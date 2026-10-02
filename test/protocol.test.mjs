import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createStickerServer } from '../server/mcp.mjs';
import { getSticker, listStickers, ASSET_BASE } from '../server/catalog.mjs';
import { createHttpServer } from '../server/http.mjs';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('live catalog resolves exact IDs and rejects unavailable IDs/sizes', async () => {
  const stickers = await listStickers();
  assert.ok(stickers.length >= 25);

  for (const sticker of stickers) {
    const result = await getSticker(sticker.sticker_id);
    assert.equal(result.size, 140);
    assert.equal(
      result.image_url,
      `${ASSET_BASE}stickers/${sticker.sticker_id}.png`
    );
  }

  for (const id of ['1', 'xxxx', '../0001', '0001.png']) {
    await assert.rejects(() => getSticker(id));
  }
  for (const size of [119, 161, 140.5]) {
    await assert.rejects(() => getSticker('0001', size));
  }
});

test('MCP returns native PNG content without widget or Markdown binding', async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createStickerServer();
  const client = new Client({ name: 'test', version: '1' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const { tools } = await client.listTools();
    const showSticker = tools.find(tool => tool.name === 'show_sticker');
    assert.equal(showSticker._meta?.ui, undefined);
    assert.equal(showSticker._meta?.['openai/outputTemplate'], undefined);
    assert.match(showSticker.description, /native MCP image content/);
    assert.match(showSticker.description, /do NOT resend it as Markdown/);

    const result = await client.callTool({
      name: 'show_sticker',
      arguments: { sticker_id: '0003' }
    });
    assert.deepEqual(result.structuredContent, {
      sticker_id: '0003',
      title: '咪'
    });
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, 'image');
    assert.equal(result.content[0].mimeType, 'image/png');

    const bytes = Buffer.from(result.content[0].data, 'base64');
    assert.ok(bytes.length > 0);
    assert.deepEqual(
      [...bytes.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10]
    );

    const missing = await client.callTool({
      name: 'show_sticker',
      arguments: { sticker_id: '9999' }
    });
    assert.equal(missing.isError, true);

    const list = await client.callTool({
      name: 'list_stickers',
      arguments: {}
    });
    assert.ok(list.structuredContent.stickers.length >= 25);
  } finally {
    await client.close();
    await server.close();
  }
});

test('HTTP transport carries native image content', async () => {
  const httpServer = createHttpServer();
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const port = httpServer.address().port;
  const client = new Client({ name: 'http-test', version: '1' });

  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp`)
      )
    );
    const result = await client.callTool({
      name: 'show_sticker',
      arguments: { sticker_id: '0024' }
    });
    assert.deepEqual(result.structuredContent, {
      sticker_id: '0024',
      title: '宝宝'
    });
    assert.equal(result.content[0].type, 'image');
    assert.equal(result.content[0].mimeType, 'image/png');
    assert.ok(result.content[0].data.length > 0);
  } finally {
    await client.close();
    await new Promise(resolve => httpServer.close(resolve));
  }
});
