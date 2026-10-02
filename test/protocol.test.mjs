import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createStickerServer, WIDGET_URI } from '../server/mcp.mjs';
import { getSticker, listStickers, ASSET_REVISION } from '../server/catalog.mjs';
import { createHttpServer } from '../server/http.mjs';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('catalog resolves every exact ID and rejects unavailable IDs/sizes', () => {
  assert.equal(listStickers().length, 25);
  for (const sticker of listStickers()) {
    const result = getSticker(sticker.sticker_id);
    assert.equal(result.size, 140);
    assert.ok(result.image_url.includes(ASSET_REVISION));
  }
  for (const id of ['1', '0026', '../0001', '0001.png']) assert.throws(() => getSticker(id));
  for (const size of [119, 161, 140.5]) assert.throws(() => getSticker('0001', size));
});

test('MCP returns a borderless UI resource and no success text/image output', async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createStickerServer();
  const client = new Client({ name: 'test', version: '1' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.find(tool => tool.name === 'show_sticker')._meta.ui.resourceUri, WIDGET_URI);
    const resource = await client.readResource({ uri: WIDGET_URI });
    assert.equal(resource.contents[0]._meta.ui.prefersBorder, false);
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.ok(resource.contents[0].text.includes('object-position: left center'));
    for (const size of [120, 140, 160]) {
      const result = await client.callTool({ name: 'show_sticker', arguments: { sticker_id: '0003', size } });
      assert.deepEqual(result.content, []);
      assert.equal(result.structuredContent.size, size);
    }
    const missing = await client.callTool({ name: 'show_sticker', arguments: { sticker_id: '0026' } });
    assert.equal(missing.isError, true);
    const invalid = await client.callTool({ name: 'show_sticker', arguments: { sticker_id: '0001', size: 161 } });
    assert.equal(invalid.isError, true);
    const list = await client.callTool({ name: 'list_stickers', arguments: {} });
    assert.equal(list.structuredContent.stickers.length, 25);
  } finally { await client.close(); await server.close(); }
});

test('HTTP transport supports real MCP initialize and sticker invocation', async () => {
  const httpServer = createHttpServer();
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const port = httpServer.address().port;
  const client = new Client({ name: 'http-test', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    const result = await client.callTool({ name: 'show_sticker', arguments: { sticker_id: '0024' } });
    assert.equal(result.structuredContent.sticker_id, '0024');
  } finally {
    await client.close();
    await new Promise(resolve => httpServer.close(resolve));
  }
});
