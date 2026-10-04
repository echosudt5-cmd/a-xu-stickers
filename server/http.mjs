import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createStickerServer } from './mcp.mjs';

const STICKER_DIRECTORY = new URL('../stickers/', import.meta.url);

async function serveSticker(stickerId, res, headOnly = false) {
  const fileUrl = new URL(`${stickerId}.png`, STICKER_DIRECTORY);

  try {
    const bytes = await readFile(fileUrl);
    res.writeHead(200, {
      'content-type': 'image/png',
      'content-length': String(bytes.byteLength),
      'cache-control': 'public, max-age=86400',
      'access-control-allow-origin': '*',
      'cross-origin-resource-policy': 'cross-origin',
      'x-content-type-options': 'nosniff'
    });
    res.end(headOnly ? undefined : bytes);
  } catch (error) {
    console.error('Sticker read failed', {
      stickerId,
      filePath: fileURLToPath(fileUrl),
      error
    });
    const notFound = error?.code === 'ENOENT';
    res.writeHead(notFound ? 404 : 500, {
      'content-type': 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff'
    }).end(notFound ? 'Sticker not found' : 'Internal server error');
  }
}

export function createHttpServer() {
  return createServer(async (req, res) => {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    if (path === '/health' && req.method === 'GET') {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }).end(JSON.stringify({
        ok: true,
        version: '0.8.1',
        rendering: 'adaptive-single-tool',
        branch: 'experiment/adaptive-rendering'
      }));
      return;
    }

    const stickerMatch = path.match(/^\/stickers\/([0-9]{4})\.png$/);
    if (stickerMatch) {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
        return;
      }
      await serveSticker(stickerMatch[1], res, req.method === 'HEAD');
      return;
    }

    if (path !== '/mcp') {
      res.writeHead(404).end('Not found');
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' }).end('Method not allowed');
      return;
    }
    const server = createStickerServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        res.writeHead(500).end('Internal server error');
      }
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || '0.0.0.0';
  createHttpServer().listen(port, host, () =>
    console.error(`A-Xu MCP listening on http://${host}:${port}/mcp`)
  );
}
