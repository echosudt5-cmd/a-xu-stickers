import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { getSticker, listStickers } from './catalog.mjs';

export const WIDGET_URI = 'ui://a-xu/sticker-v4.html';
export const APP_ORIGIN = 'https://a-xu-stickers.onrender.com';
const NO_AUTH = [{ type: 'noauth' }];

export function classifyClient(userAgent) {
  const value = typeof userAgent === 'string' ? userAgent : '';

  if (/Android|iPhone|iPad|iPod|Mobile/i.test(value)) {
    return 'mobile';
  }

  if (
    /CodexBrowser|Windows NT|Macintosh|X11|CrOS|Linux x86_64/i.test(value)
  ) {
    return 'desktop';
  }

  return 'unknown';
}

export function createStickerServer() {
  const server = new McpServer({
    name: 'a-xu-stickers',
    version: '0.7.0'
  });

  // Retained as an unbound fallback while Markdown-only rendering is tested.
  registerAppResource(
    server,
    'a-xu-sticker-v4',
    WIDGET_URI,
    {
      description: 'Fallback inline renderer for one small A-Xu sticker.'
    },
    async () => ({
      contents: [{
        uri: WIDGET_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: readFileSync(
          new URL('../dist/sticker.html', import.meta.url),
          'utf8'
        ),
        _meta: {
          ui: {
            prefersBorder: false,
            availableDisplayModes: ['inline'],
            csp: {
              resourceDomains: [APP_ORIGIN, 'https://raw.githubusercontent.com'],
              connectDomains: []
            }
          },
          'openai/widgetPrefersBorder': false,
          'openai/widgetDescription':
            'Fallback renderer for a single small, left-aligned A-Xu sticker on a transparent background.',
          'openai/widgetCSP': {
            resource_domains: [APP_ORIGIN, 'https://raw.githubusercontent.com'],
            connect_domains: []
          },
          'openai/ui': {
            availableDisplayModes: ['inline']
          }
        }
      }]
    })
  );

  server.registerTool(
    'inspect_client_user_agent',
    {
      title: 'Inspect client user agent',
      description:
        'Diagnostic-only tool. Return the exact optional openai/userAgent hint attached by the current ChatGPT client. Do not infer, normalize, or rewrite the value, and do not call any sticker-rendering tool.',
      inputSchema: {},
      outputSchema: {
        present: z.boolean(),
        user_agent: z.string().nullable()
      },
      securitySchemes: NO_AUTH,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true
      },
      _meta: {
        securitySchemes: NO_AUTH
      }
    },
    async (_args, extra) => {
      const rawUserAgent = extra?._meta?.['openai/userAgent'];
      const userAgent =
        typeof rawUserAgent === 'string' ? rawUserAgent : null;
      const result = {
        present: userAgent !== null,
        user_agent: userAgent
      };

      console.log('openai userAgent:', userAgent ?? '<missing>');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result)
        }],
        structuredContent: result
      };
    }
  );

  server.registerTool(
    'show_sticker',
    {
      title: '阿序的小表情',
      description:
        'Primary sticker tool and platform router. Always call this tool first. On desktop it returns render_mode=markdown: send exactly one Markdown image using title and image_url. On mobile or an unknown client it returns render_mode=widget and requires_follow_up=true: this is never a completed response, so do not answer the user; immediately call next_tool with next_tool_arguments in the same turn, and do not send Markdown. Never call show_sticker_mobile unless this tool instructs you to do so. Use list_stickers if you do not know the ID.',
      inputSchema: {
        sticker_id: z.string().regex(/^[0-9]{4}$/),
        size: z.number().int().min(120).max(160).default(140)
      },
      outputSchema: {
        sticker_id: z.string(),
        title: z.string(),
        size: z.number(),
        render_mode: z.enum(['markdown', 'widget']),
        client_kind: z.enum(['desktop', 'mobile', 'unknown']),
        image_url: z.string().url().optional(),
        requires_follow_up: z.boolean().optional(),
        next_tool: z.string().optional(),
        next_tool_arguments: z.object({
          sticker_id: z.string(),
          size: z.number()
        }).optional()
      },
      securitySchemes: NO_AUTH,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      },
      _meta: {
        securitySchemes: NO_AUTH
      }
    },
    async ({ sticker_id, size }, extra) => {
      try {
        const renderData = await getSticker(sticker_id, size);
        const userAgent = extra?._meta?.['openai/userAgent'];
        const clientKind = classifyClient(userAgent);
        const route = clientKind === 'desktop'
          ? {
              render_mode: 'markdown',
              tool_name: 'show_sticker'
            }
          : {
              render_mode: 'widget',
              tool_name: 'show_sticker_mobile'
            };

        console.log(
          'sticker route:',
          JSON.stringify({
            user_agent:
              typeof userAgent === 'string' ? userAgent : null,
            client_kind: clientKind,
            ...route
          })
        );

        if (clientKind === 'desktop') {
          const result = {
            ...renderData,
            render_mode: 'markdown',
            client_kind: clientKind
          };

          return {
            content: [{
              type: 'text',
              text:
                'Desktop surface detected. Send exactly one Markdown image ' +
                'using structuredContent.title and structuredContent.image_url. ' +
                'Do not call show_sticker_mobile and do not expose technical details.'
            }],
            structuredContent: result
          };
        }

        const result = {
          sticker_id: renderData.sticker_id,
          title: renderData.title,
          size: renderData.size,
          render_mode: 'widget',
          client_kind: clientKind,
          requires_follow_up: true,
          next_tool: 'show_sticker_mobile',
          next_tool_arguments: {
            sticker_id: renderData.sticker_id,
            size: renderData.size
          }
        };

        return {
          content: [{
            type: 'text',
            text:
              'MANDATORY CONTINUATION: this result is not a completed ' +
              'response. Do not answer the user yet. Immediately call ' +
              'show_sticker_mobile using structuredContent.next_tool_arguments. ' +
              'Only that second tool call completes the request. Never send ' +
              'Markdown, a URL, JSON, or routing details.'
          }],
          structuredContent: result
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: error.message
          }]
        };
      }
    }
  );

  registerAppTool(
    server,
    'show_sticker_mobile',
    {
      title: '阿序的小表情',
      description:
        'Widget renderer used only after show_sticker returns render_mode=widget and next_tool=show_sticker_mobile. The attached inline UI already renders the sticker. After calling this tool, do not repeat the image in Markdown and do not mention IDs, URLs, routing, or technical details.',
      inputSchema: {
        sticker_id: z.string().regex(/^[0-9]{4}$/),
        size: z.number().int().min(120).max(160).default(140)
      },
      outputSchema: {
        sticker_id: z.string(),
        title: z.string(),
        image_url: z.string().url(),
        size: z.number()
      },
      securitySchemes: NO_AUTH,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      },
      _meta: {
        securitySchemes: NO_AUTH,
        ui: {
          resourceUri: WIDGET_URI,
          visibility: ['model', 'app']
        },
        'openai/outputTemplate': WIDGET_URI,
        'openai/toolInvocation/invoking': '正在取出小表情…',
        'openai/toolInvocation/invoked': '小表情来啦'
      }
    },
    async ({ sticker_id, size }) => {
      try {
        return {
          content: [],
          structuredContent: await getSticker(sticker_id, size)
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: error.message
          }]
        };
      }
    }
  );

  server.registerTool(
    'list_stickers',
    {
      title: 'List sticker IDs',
      description:
        'List the exact A-Xu sticker IDs and titles currently available in the live GitHub catalog. No image is rendered. Semantic retrieval is not implemented yet.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      }
    },
    async () => ({
      content: [],
      structuredContent: {
        stickers: await listStickers()
      }
    })
  );

  return server;
}
