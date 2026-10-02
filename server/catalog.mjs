import { readFileSync } from 'node:fs';

const bundledCatalog = JSON.parse(
  readFileSync(new URL('../metadata/stickers.json', import.meta.url), 'utf8')
);

export const METADATA_URL =
  'https://raw.githubusercontent.com/echosudt5-cmd/a-xu-stickers/main/metadata/stickers.json';
export const ASSET_BASE =
  'https://raw.githubusercontent.com/echosudt5-cmd/a-xu-stickers/main/';
const CACHE_TTL_MS = 60_000;
const MAX_CATALOG_BYTES = 1_000_000;

let cachedCatalog = validateCatalog(bundledCatalog);
let cacheExpiresAt = 0;
let catalogLoadPromise;

function validateCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.stickers)) {
    throw new Error('Invalid sticker catalog.');
  }

  const seen = new Set();
  for (const sticker of catalog.stickers) {
    if (!sticker || !/^[0-9]{4}$/.test(sticker.id)) {
      throw new Error('Invalid sticker ID in catalog.');
    }
    if (seen.has(sticker.id)) {
      throw new Error(`Duplicate sticker ID in catalog: ${sticker.id}`);
    }
    if (typeof sticker.title !== 'string' || !sticker.title.trim()) {
      throw new Error(`Invalid title for sticker ${sticker.id}.`);
    }
    if (sticker.file !== `stickers/${sticker.id}.png`) {
      throw new Error(`Invalid image path for sticker ${sticker.id}.`);
    }
    seen.add(sticker.id);
  }

  return catalog;
}

async function fetchRemoteCatalog() {
  const response = await fetch(METADATA_URL, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000)
  });

  if (!response.ok) {
    throw new Error(`GitHub catalog request failed: ${response.status}`);
  }

  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_CATALOG_BYTES) {
    throw new Error('Sticker catalog is unexpectedly large.');
  }

  return validateCatalog(JSON.parse(text));
}

async function loadCatalog() {
  if (Date.now() < cacheExpiresAt) return cachedCatalog;
  if (catalogLoadPromise) return catalogLoadPromise;

  catalogLoadPromise = (async () => {
    try {
      cachedCatalog = await fetchRemoteCatalog();
    } catch (error) {
      console.error(`Using cached sticker catalog: ${error.message}`);
    } finally {
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      catalogLoadPromise = undefined;
    }
    return cachedCatalog;
  })();

  return catalogLoadPromise;
}

export async function getSticker(stickerId, size = 140) {
  if (!Number.isInteger(size) || size < 120 || size > 160) {
    throw new Error('size must be an integer from 120 to 160.');
  }

  const catalog = await loadCatalog();
  const sticker = catalog.stickers.find(item => item.id === stickerId);
  if (!sticker) {
    throw new Error(`Unknown sticker_id: ${stickerId}. Use list_stickers to see available IDs.`);
  }

  return {
    sticker_id: sticker.id,
    title: sticker.title,
    image_url: `${ASSET_BASE}${sticker.file}`,
    size
  };
}

export async function listStickers() {
  const catalog = await loadCatalog();
  return catalog.stickers.map(({ id, title }) => ({
    sticker_id: id,
    title
  }));
}
