import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createStickerServer } from './mcp.mjs';
import { ASSET_BASE } from './catalog.mjs';

const MAX_STICKER_BYTES = 5_000_000;

async function serveSticker(stickerId, res) {
  try {
    const response = await fetch(`${ASSET_BASE}stickers/${stickerId}.png`, {
      headers: { accept: 'image/png' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      res.writeHead(response.status === 404 ? 404 : 502).end('Sticker unavailable');
      return;
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_STICKER_BYTES) {
      res.writeHead(502).end('Sticker too large');
      return;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_STICKER_BYTES) {
      res.writeHead(502).end('Sticker too large');
      return;
    }

    res.writeHead(200, {
      'content-type': 'image/png',
      'content-length': String(bytes.byteLength),
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff'
    }).end(bytes);
  } catch (error) {
    console.error(`Sticker proxy failed for ${stickerId}: ${error.message}`);
    if (!res.headersSent) res.writeHead(502).end('Sticker unavailable');
  }
}

export function createHttpServer() {
  return createServer(async (req, res) => {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    if (path === '/health' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}'); return; }

    const stickerMatch = path.match(/^\/stickers\/([0-9]{4})\.png$/);
    if (stickerMatch) {
      if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }).end('Method not allowed'); return; }
      await serveSticker(stickerMatch[1], res);
      return;
    }

    if (path !== '/mcp') { res.writeHead(404).end('Not found'); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end('Method not allowed'); return; }
    const server = createStickerServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res); }
    catch (error) { console.error(error); if (!res.headersSent) res.writeHead(500).end('Internal server error'); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || '0.0.0.0';
  createHttpServer().listen(port, host, () => console.error(`A-Xu MCP listening on http://${host}:${port}/mcp`));
}
