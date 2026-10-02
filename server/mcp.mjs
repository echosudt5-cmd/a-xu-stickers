import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSticker, listStickers } from './catalog.mjs';

const NO_AUTH = [{ type: 'noauth' }];
const MAX_IMAGE_BYTES = 5_000_000;

async function fetchStickerImage(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: { accept: 'image/png' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(`Sticker image request failed: ${response.status}`);
  }

  const contentType = response.headers.get('content-type')?.split(';')[0];
  if (contentType !== 'image/png') {
    throw new Error(`Unexpected sticker content type: ${contentType ?? 'unknown'}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error('Sticker image size is invalid.');
  }

  return bytes.toString('base64');
}

export function createStickerServer() {
  const server = new McpServer({
    name: 'a-xu-stickers',
    version: '0.4.0'
  });

  server.registerTool(
    'show_sticker',
    {
      title: '阿序的小表情',
      description:
        'Find one A-Xu sticker by exact sticker_id from the live GitHub catalog and return the PNG directly as native MCP image content. The tool result already contains the visible sticker: do NOT resend it as Markdown, a URL, an attachment, or a widget. Do not repeat the sticker ID or technical details. Use list_stickers if you do not know the ID. This does not perform semantic search.',
      inputSchema: {
        sticker_id: z.string().regex(/^[0-9]{4}$/)
      },
      outputSchema: {
        sticker_id: z.string(),
        title: z.string()
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
        const data = await fetchStickerImage(image_url);
        const result = { sticker_id, title };

        return {
          content: [{
            type: 'image',
            data,
            mimeType: 'image/png'
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
