import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createStickerServer, WIDGET_URI, APP_ORIGIN } from '../server/mcp.mjs';
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

test('MCP keeps the v4 widget only as an unbound fallback and returns Markdown render data', async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createStickerServer();
  const client = new Client({ name: 'test', version: '1' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const { tools } = await client.listTools();
    const showSticker = tools.find(tool => tool.name === 'show_sticker');
    assert.equal(showSticker._meta.ui, undefined);
    assert.equal(showSticker._meta['openai/outputTemplate'], undefined);
    assert.match(showSticker.description, /send exactly one Markdown image/);
    assert.match(showSticker.description, /Do not render or attach a widget/);

    const resource = await client.readResource({ uri: WIDGET_URI });
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.equal(resource.contents[0]._meta.ui.prefersBorder, false);
    assert.deepEqual(resource.contents[0]._meta.ui.availableDisplayModes, ['inline']);
    assert.deepEqual(
      resource.contents[0]._meta.ui.csp.resourceDomains,
      [APP_ORIGIN, 'https://raw.githubusercontent.com']
    );
    assert.ok(resource.contents[0].text.includes('object-position: left center'));

    for (const size of [120, 140, 160]) {
      const result = await client.callTool({
        name: 'show_sticker',
        arguments: { sticker_id: '0003', size }
      });
      assert.deepEqual(
        Object.keys(result.structuredContent).sort(),
        ['image_url', 'size', 'sticker_id', 'title']
      );
      assert.equal(result.structuredContent.sticker_id, '0003');
      assert.equal(result.structuredContent.size, size);
      assert.equal(
        JSON.parse(result.content[0].text).image_url,
        result.structuredContent.image_url
      );
      assert.equal(
        result.structuredContent.image_url,
        `${APP_ORIGIN}/stickers/0003.png`
      );
    }

    const missing = await client.callTool({
      name: 'show_sticker',
      arguments: { sticker_id: '9999' }
    });
    assert.equal(missing.isError, true);

    const invalid = await client.callTool({
      name: 'show_sticker',
      arguments: { sticker_id: '0001', size: 161 }
    });
    assert.equal(invalid.isError, true);

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

test('HTTP serves repository PNGs directly with image-safe headers', async () => {
  const httpServer = createHttpServer();
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const port = httpServer.address().port;

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/stickers/0003.png`,
      { redirect: 'manual' }
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.equal(
      response.headers.get('cross-origin-resource-policy'),
      'cross-origin'
    );
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(
      response.headers.get('cache-control'),
      /^public, max-age=86400/
    );

    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.byteLength > 100);
    assert.equal(
      Number(response.headers.get('content-length')),
      bytes.byteLength
    );
    assert.deepEqual(
      [...bytes.subarray(0, 8)],
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    );

    const head = await fetch(
      `http://127.0.0.1:${port}/stickers/0003.png`,
      { method: 'HEAD', redirect: 'manual' }
    );
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-type'), 'image/png');
    assert.equal(head.headers.get('location'), null);
    assert.equal(head.headers.get('content-length'), String(bytes.byteLength));
    assert.equal(head.headers.get('access-control-allow-origin'), '*');
    assert.equal(
      head.headers.get('cross-origin-resource-policy'),
      'cross-origin'
    );
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  } finally {
    await new Promise(resolve => httpServer.close(resolve));
  }
});

test('HTTP transport supports real MCP initialize and sticker invocation', async () => {
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
    assert.equal(result.structuredContent.sticker_id, '0024');
    assert.equal(result.structuredContent.size, 140);
    assert.equal(
      result.structuredContent.image_url,
      `${APP_ORIGIN}/stickers/0024.png`
    );
  } finally {
    await client.close();
    await new Promise(resolve => httpServer.close(resolve));
  }
});
