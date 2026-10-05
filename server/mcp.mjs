import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { getSticker, listStickers } from './catalog.mjs';

export const WIDGET_URI = 'ui://a-xu/sticker-v7.html';
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

function commonToolOptions(description) {
  return {
    title: '阿序的小表情',
    description,
    inputSchema: {
      sticker_id: z.string().regex(/^[0-9]{4}$/),
      size: z.number().int().min(120).max(160).default(140)
    },
    outputSchema: {
      sticker_id: z.string(),
      title: z.string(),
      image_url: z.string().url(),
      size: z.number(),
      render_mode: z.enum(['markdown', 'widget']),
      client_kind: z.enum(['desktop', 'mobile', 'unknown'])
    },
    securitySchemes: NO_AUTH,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: true
    }
  };
}

export function createStickerServer() {
  const server = new McpServer({
    name: 'a-xu-stickers',
    version: '0.11.0'
  });

  registerAppResource(
    server,
    'a-xu-sticker-v7',
    WIDGET_URI,
    {
      description: 'Mobile-only inline renderer for one A-Xu sticker.'
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
            'Renders one small, left-aligned A-Xu sticker on mobile.',
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

  // This is the only entry tool the model should choose on its own.
  // It has no UI binding, so desktop/web can never acquire widget chrome.
  server.registerTool(
    'show_sticker',
    {
      ...commonToolOptions(
        'Show one A-Xu sticker. Always call this routing tool before producing any user-visible prose. It selects presentation from the client hint. If its result says render_mode=markdown, send exactly one Markdown image using title and image_url, then continue the reply; do not call another sticker tool. If its result says render_mode=widget, immediately call show_sticker_mobile with the same sticker_id and size before producing any prose; wait for that UI call to finish, never repeat the image in Markdown, and only then compose the final assistant text so the sticker precedes the prose. Do not expose the ID, URL, JSON, render mode, routing, or technical details. Use list_stickers if you do not know the ID.'
      ),
      _meta: {
        securitySchemes: NO_AUTH,
        'openai/toolInvocation/invoking': '正在选择小表情…',
        'openai/toolInvocation/invoked': '小表情选好啦'
      }
    },
    async ({ sticker_id, size }, extra) => {
      try {
        const sticker = await getSticker(sticker_id, size);
        const userAgent = extra?._meta?.['openai/userAgent'];
        const clientKind = classifyClient(userAgent);
        const renderMode =
          clientKind === 'mobile' ? 'widget' : 'markdown';
        const result = {
          ...sticker,
          render_mode: renderMode,
          client_kind: clientKind
        };

        console.log(
          'sticker route:',
          JSON.stringify({
            user_agent:
              typeof userAgent === 'string' ? userAgent : null,
            client_kind: clientKind,
            render_mode: renderMode,
            tool_name: 'show_sticker'
          })
        );

        return {
          content: [{
            type: 'text',
            text: renderMode === 'widget'
              ? 'Before writing any user-visible text, immediately call show_sticker_mobile with the same sticker_id and size. Wait for its attached UI to finish. Do not send a Markdown image.'
              : 'Send exactly one Markdown image using structuredContent.title and structuredContent.image_url. Do not call show_sticker_mobile.'
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

  // The UI-bound tool is a second-stage mobile renderer only.
  registerAppTool(
    server,
    'show_sticker_mobile',
    {
      ...commonToolOptions(
        'Mobile-only second-stage renderer. Never choose this tool directly. Call it only when show_sticker has just returned render_mode=widget, using exactly the same sticker_id and size. Call it before any user-visible prose, wait for the attached UI to complete, do not repeat the image in Markdown, and only then write the final reply.'
      ),
      _meta: {
        securitySchemes: NO_AUTH,
        ui: {
          resourceUri: WIDGET_URI,
          visibility: ['model', 'app']
        },
        'openai/toolInvocation/invoking': '正在取出小表情…',
        'openai/toolInvocation/invoked': '小表情来啦'
      }
    },
    async ({ sticker_id, size }, extra) => {
      try {
        const sticker = await getSticker(sticker_id, size);
        const userAgent = extra?._meta?.['openai/userAgent'];
        const clientKind = classifyClient(userAgent);
        const result = {
          ...sticker,
          render_mode: 'widget',
          client_kind: clientKind
        };

        console.log(
          'sticker route:',
          JSON.stringify({
            user_agent:
              typeof userAgent === 'string' ? userAgent : null,
            client_kind: clientKind,
            render_mode: 'widget',
            tool_name: 'show_sticker_mobile'
          })
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result)
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
