import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createStickerServer } from './mcp.mjs';

export function createHttpServer() {
  return createServer(async (req, res) => {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    if (path === '/health' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}'); return; }
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
