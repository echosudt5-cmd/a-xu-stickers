import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { getSticker } from '../server/catalog.mjs';

const browser = await chromium.launch({
  headless: true,
  ...(process.env.STICKER_BROWSER_EXECUTABLE
    ? { executablePath: process.env.STICKER_BROWSER_EXECUTABLE }
    : {})
});
const page = await browser.newPage({ viewport: { width: 700, height: 400 } });
page.on('pageerror', error => console.error(error.message));

const html = await readFile(
  new URL('../dist/sticker.html', import.meta.url),
  'utf8'
);
const png = await readFile(
  new URL('../stickers/0003.png', import.meta.url)
);
await page.route(
  'https://raw.githubusercontent.com/**',
  route => route.fulfill({ contentType: 'image/png', body: png })
);

try {
  for (const size of [120, 140, 160]) {
    const sticker = await getSticker('0003', size);
    await page.goto('about:blank');
    await page.evaluate(
      data => { window.__STICKER_PREVIEW__ = data; },
      sticker
    );
    await page.setContent(html);
    await page.waitForFunction(
      () => {
        const image = document.querySelector('#image');
        return image.complete && image.naturalWidth > 0;
      },
      null,
      { timeout: 5000 }
    );

    const box = await page.locator('#image').boundingBox();
    assert.equal(box.x, 0);
    assert.equal(box.width, size);
    assert.equal(box.height, size);
    assert.equal(await page.locator('#status').isVisible(), false);
    assert.equal(
      await page.evaluate(
        () => document.body.getBoundingClientRect().height
      ),
      size
    );
  }

  await page.screenshot({ path: 'dist/sticker-preview.png' });

  const previewSticker = await getSticker('0003');
  const preview = html.replace(
    '<script type="module">',
    `<script>window.__STICKER_PREVIEW__=${JSON.stringify(previewSticker).replace(/</g, '\\u003c')};</script><script type="module">`
  );
  await writeFile(
    new URL('../dist/preview.html', import.meta.url),
    preview
  );

  console.log(
    'UI verified: 120/140/160px, x=0, transparent, image-only, no excess body height.'
  );
} finally {
  await browser.close();
}
