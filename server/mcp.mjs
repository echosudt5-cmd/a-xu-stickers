import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSticker, listStickers } from './catalog.mjs';

const NO_AUTH = [{ type: 'noauth' }];
const MAX_STICKER_BYTES = 5_000_000;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

async function fetchStickerPng(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: { accept: 'image/png' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    throw new Error(`Sticker image fetch failed (${response.status})`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_STICKER_BYTES) {
    throw new Error('Sticker image is too large');
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_STICKER_BYTES) {
    throw new Error('Sticker image is too large');
  }
  if (
    bytes.byteLength < PNG_SIGNATURE.byteLength ||
    !bytes.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE)
  ) {
    throw new Error('Sticker image is not a valid PNG');
  }

  return bytes;
}

export function createStickerServer() {
  const server = new McpServer({
    name: 'a-xu-stickers',
    version: '0.7.0-image-experiment'
  });

  server.registerTool(
    'show_sticker',
    {
      title: '阿序的小表情',
      description:
        'Find one A-Xu sticker by exact sticker_id and return its PNG directly as a standard MCP image content block. The image is already included in the tool result. Do not send a Markdown image, URL, attachment, widget, title, ID, JSON, or other technical details. Use list_stickers if you do not know the ID. This does not perform semantic search.',
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
        const bytes = await fetchStickerPng(sticker.image_url);
        const renderData = {
          sticker_id: sticker.sticker_id,
          title: sticker.title,
          size: sticker.size
        };

        return {
          content: [{
            type: 'image',
            data: bytes.toString('base64'),
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
