import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../metadata/stickers.json', import.meta.url), 'utf8'));
const byId = new Map(catalog.stickers.map(sticker => [sticker.id, sticker]));
// Pin images to the same revision as the catalog instead of mutable main.
export const ASSET_REVISION = 'b14ba787063e39f907c375977aca3fe9c5a6e4aa';
const revision = process.env.STICKER_ASSET_REF || ASSET_REVISION;
export const ASSET_BASE = `https://raw.githubusercontent.com/echosudt5-cmd/a-xu-stickers/${revision}/`;

export function getSticker(stickerId, size = 140) {
  const sticker = byId.get(stickerId);
  if (!sticker) throw new Error(`Unknown sticker_id: ${stickerId}. Use list_stickers to see available IDs.`);
  if (!Number.isInteger(size) || size < 120 || size > 160) throw new Error('size must be an integer from 120 to 160.');
  if (!/^stickers\/[0-9]{4}\.png$/.test(sticker.file)) throw new Error('Invalid catalog image path.');
  return { sticker_id: sticker.id, title: sticker.title, image_url: `${ASSET_BASE}${sticker.file}`, size };
}

export function listStickers() {
  return catalog.stickers.map(({ id, title }) => ({ sticker_id: id, title }));
}
