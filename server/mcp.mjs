import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppResource,
  RESOURCE_MIME_TYPE
} from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { getSticker, listStickers } from './catalog.mjs';

export const WIDGET_URI = 'ui://a-xu/sticker-v4.html';
export const APP_ORIGIN = 'https://a-xu-stickers.onrender.com';
const NO_AUTH = [{ type: 'noauth' }];

export function createStickerServer() {
  const server = new McpServer({
    name: 'a-xu-stickers',
    version: '0.6.2'
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
        'Find one A-Xu sticker by exact sticker_id from the live GitHub catalog. After this tool returns, send exactly one Markdown image using the returned title and image_url: ![title](image_url). Do not render or attach a widget. Do not repeat the sticker ID, raw URL, JSON, or technical details. Use list_stickers if you do not know the ID. This does not perform semantic search.',
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
        securitySchemes: NO_AUTH
      }
    },
    async ({ sticker_id, size }) => {
      try {
        const renderData = await getSticker(sticker_id, size);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(renderData)
          }],
          structuredContent: renderData
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
