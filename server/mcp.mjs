import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSticker, listStickers } from './catalog.mjs';

const NO_AUTH = [{ type: 'noauth' }];

export function createStickerServer() {
  const server = new McpServer({
    name: 'a-xu-stickers',
    version: '0.7.0-resource-link-experiment'
  });

  server.registerTool(
    'show_sticker',
    {
      title: '阿序的小表情',
      description:
        'Find one A-Xu sticker by exact sticker_id and return the PNG as a standard MCP resource_link file reference. The file reference is already included in the tool result. Do not send a Markdown image, URL, widget, title, ID, JSON, or other technical details. Use list_stickers if you do not know the ID. This does not perform semantic search.',
      inputSchema: {
        sticker_id: z.string().regex(/^[0-9]{4}$/),
        size: z.number().int().min(120).max(160).default(140)
      },
      outputSchema: {
        sticker_id: z.string(),
        title: z.string(),
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
        const sticker = await getSticker(sticker_id, size);
        const renderData = {
          sticker_id: sticker.sticker_id,
          title: sticker.title,
          size: sticker.size
        };

        return {
          content: [{
            type: 'resource_link',
            uri: sticker.image_url,
            name: `${sticker.sticker_id}.png`,
            title: sticker.title,
            mimeType: 'image/png'
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
