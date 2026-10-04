import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  createStickerServer,
  WIDGET_URI,
  APP_ORIGIN,
  classifyClient
} from '../server/mcp.mjs';
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

test('client classifier separates the four observed ChatGPT surfaces', () => {
  const windowsApp =
    'CodexBrowser Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
  const desktopWeb =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
  const androidApp =
    'ChatGPT/1.2026.265 (Android 12; Mi 10 Pro; build 2626526)';
  const androidWeb =
    'Mozilla/5.0 (Linux; Android 12; Mi 10 Pro Build/XiaomiMi 10 Pro;) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 ' +
    'Chrome/114.0.5735.196 Mobile Safari/537.36';

  assert.equal(classifyClient(windowsApp), 'desktop');
  assert.equal(classifyClient(desktopWeb), 'desktop');
  assert.equal(classifyClient(androidApp), 'mobile');
  assert.equal(classifyClient(androidWeb), 'mobile');
  assert.equal(classifyClient(undefined), 'unknown');
  assert.equal(classifyClient('unexpected-client'), 'unknown');
});

test('MCP uses one adaptive standard-only UI-bound tool', async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createStickerServer();
  const client = new Client({ name: 'test', version: '1' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const { tools } = await client.listTools();
    const showSticker = tools.find(tool => tool.name === 'show_sticker');
    const mobileSticker = tools.find(
      tool => tool.name === 'show_sticker_mobile'
    );
    const inspectUserAgent = tools.find(
      tool => tool.name === 'inspect_client_user_agent'
    );
    assert.equal(mobileSticker, undefined);
    assert.ok(inspectUserAgent);
    assert.equal(inspectUserAgent._meta.ui, undefined);
    assert.equal(
      inspectUserAgent._meta['openai/outputTemplate'],
      undefined
    );
    assert.equal(showSticker._meta.ui.resourceUri, WIDGET_URI);
    assert.deepEqual(showSticker._meta.ui.visibility, ['model', 'app']);
    assert.equal(
      showSticker._meta['openai/outputTemplate'],
      undefined
    );
    assert.match(showSticker.description, /single adaptive tool call/);
    assert.match(
      showSticker.description,
      /before producing any user-visible prose/
    );
    assert.match(
      showSticker.description,
      /only then compose the final assistant text/
    );
    assert.match(showSticker.description, /render_mode=markdown/);
    assert.match(showSticker.description, /render_mode=widget/);

    const resource = await client.readResource({ uri: WIDGET_URI });
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.equal(resource.contents[0]._meta.ui.prefersBorder, false);
    assert.deepEqual(resource.contents[0]._meta.ui.availableDisplayModes, ['inline']);
    assert.deepEqual(
      resource.contents[0]._meta.ui.csp.resourceDomains,
      [APP_ORIGIN, 'https://raw.githubusercontent.com']
    );
    assert.ok(resource.contents[0].text.includes('object-position: left center'));

    const userAgent = 'ChatGPT-Test/1.0 (Android Mobile)';
    const probe = await client.callTool({
      name: 'inspect_client_user_agent',
      arguments: {},
      _meta: {
        'openai/userAgent': userAgent
      }
    });
    assert.deepEqual(probe.structuredContent, {
      present: true,
      user_agent: userAgent
    });
    assert.deepEqual(JSON.parse(probe.content[0].text), {
      present: true,
      user_agent: userAgent
    });

    const missingProbe = await client.callTool({
      name: 'inspect_client_user_agent',
      arguments: {}
    });
    assert.deepEqual(missingProbe.structuredContent, {
      present: false,
      user_agent: null
    });

    const desktopUserAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

    for (const size of [120, 140, 160]) {
      const result = await client.callTool({
        name: 'show_sticker',
        arguments: { sticker_id: '0003', size },
        _meta: {
          'openai/userAgent': desktopUserAgent
        }
      });
      assert.deepEqual(
        Object.keys(result.structuredContent).sort(),
        [
          'client_kind',
          'image_url',
          'render_mode',
          'size',
          'sticker_id',
          'title'
        ]
      );
      assert.equal(result.structuredContent.sticker_id, '0003');
      assert.equal(result.structuredContent.size, size);
      assert.equal(result.structuredContent.client_kind, 'desktop');
      assert.equal(result.structuredContent.render_mode, 'markdown');
      assert.match(result.content[0].text, /exactly one Markdown image/);
      assert.equal(
        result.structuredContent.image_url,
        `${ASSET_BASE}stickers/0003.png`
      );
    }

    const mobileResult = await client.callTool({
      name: 'show_sticker',
      arguments: { sticker_id: '0003', size: 140 },
      _meta: {
        'openai/userAgent':
          'ChatGPT/1.2026.265 (Android 12; Mi 10 Pro; build 2626526)'
      }
    });
    assert.deepEqual(mobileResult.structuredContent, {
      sticker_id: '0003',
      title: mobileResult.structuredContent.title,
      image_url: `${ASSET_BASE}stickers/0003.png`,
      size: 140,
      render_mode: 'widget',
      client_kind: 'mobile'
    });
    assert.equal(mobileResult.content.length, 1);
    assert.deepEqual(
      JSON.parse(mobileResult.content[0].text),
      mobileResult.structuredContent
    );

    const unknownResult = await client.callTool({
      name: 'show_sticker',
      arguments: { sticker_id: '0003' }
    });
    assert.equal(unknownResult.structuredContent.client_kind, 'unknown');
    assert.equal(unknownResult.structuredContent.render_mode, 'markdown');
    assert.match(unknownResult.content[0].text, /exactly one Markdown image/);
    assert.equal(
      unknownResult.structuredContent.image_url,
      `${ASSET_BASE}stickers/0003.png`
    );

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
      `${ASSET_BASE}stickers/0024.png`
    );
  } finally {
    await client.close();
    await new Promise(resolve => httpServer.close(resolve));
  }
});
