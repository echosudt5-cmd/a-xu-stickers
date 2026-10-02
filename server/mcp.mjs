import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSticker, listStickers } from './catalog.mjs';

const NO_AUTH = [{ type: 'noauth' }];

export function createStickerServer() {
  const server = new McpServer({
    name: 'a-xu-stickers',
    version: '0.3.1'
  });

  server.registerTool(
    'show_sticker',
    {
      title: '阿序的小表情',
      description:
        'Find one A-Xu sticker by exact sticker_id from the live GitHub catalog. After this tool returns, you MUST send the sticker as a Markdown image using the returned title and image_url: ![title](image_url). Do not render or attach a widget. Do not repeat the sticker ID, raw URL, JSON, or technical details. Use list_stickers if you do not know the ID. This does not perform semantic search.',
      inputSchema: {
        sticker_id: z.string().regex(/^[0-9]{4}$/)
      },
      outputSchema: {
        title: z.string(),
        image_url: z.string().url()
      },
      securitySchemes: NO_AUTH,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true
      }
    },
    async ({ sticker_id }) => {
      try {
        const { title, image_url } = await getSticker(sticker_id);
        const result = { title, image_url };

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
