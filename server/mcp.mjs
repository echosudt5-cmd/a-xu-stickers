import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { getSticker, listStickers } from './catalog.mjs';

export const WIDGET_URI = 'ui://a-xu/sticker-v2.html';
const NO_AUTH = [{ type: 'noauth' }];

export function createStickerServer() {
  const server = new McpServer({
    name: 'a-xu-stickers',
    version: '0.1.1'
  });

  registerAppResource(
    server,
    'a-xu-sticker',
    WIDGET_URI,
    {
      description: 'Render one small A-Xu sticker inline.'
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
            csp: {
              resourceDomains: ['https://raw.githubusercontent.com'],
              connectDomains: []
            }
          },
          'openai/widgetPrefersBorder': false,
          'openai/widgetDescription':
            'A single small, left-aligned A-Xu sticker on a transparent background. The sticker is already visible; do not repeat its title, ID, or technical details in the reply.',
          'openai/widgetCSP': {
            resource_domains: ['https://raw.githubusercontent.com'],
            connect_domains: []
          },
          'openai/ui': {
            availableDisplayModes: ['inline']
          }
        }
      }]
    })
  );

  registerAppTool(
    server,
    'show_sticker',
    {
      title: '阿序的小表情',
      description:
        'Show one A-Xu sticker inline in the conversation by exact sticker_id (0001–0025). Use list_stickers if you do not know the ID. Default size 140px. The widget renders the image; avoid extra captions or explaining the call. This does not perform semantic search.',
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
        openWorldHint: false,
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
        const sticker = getSticker(sticker_id, size);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(sticker)
          }],
          structuredContent: sticker
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
        'List exact A-Xu sticker IDs and titles. No image is rendered. Semantic retrieval is not implemented yet.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true
      }
    },
    async () => ({
      content: [],
      structuredContent: {
        stickers: listStickers()
      }
    })
  );

  return server;
}
