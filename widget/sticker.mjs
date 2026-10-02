import { App } from '@modelcontextprotocol/ext-apps';

const app = new App({ name: 'a-xu-sticker', version: '0.1.0' }, {});
const image = document.querySelector('#image');
const status = document.querySelector('#status');
const basePath = '/echosudt5-cmd/a-xu-stickers/';
let connected = false;
function notifySize() {
  if (connected) void app.sendSizeChanged({ height: Math.ceil(document.body.getBoundingClientRect().height) }).catch(() => {});
}
function fail(message) {
  image.hidden = true;
  image.removeAttribute('src');
  status.textContent = message;
  status.hidden = false;
  notifySize();
}
export function renderSticker(data) {
  if (!data || typeof data.image_url !== 'string' || !/^[0-9]{4}$/.test(data.sticker_id)) { fail('表情暂时没能加载'); return; }
  let url;
  try { url = new URL(data.image_url); } catch { fail('表情暂时没能加载'); return; }
  if (url.origin !== 'https://raw.githubusercontent.com' || !url.pathname.startsWith(basePath) || !url.pathname.endsWith(`/stickers/${data.sticker_id}.png`) || url.search || url.hash) { fail('表情地址不可用'); return; }
  const size = Number.isInteger(data.size) ? Math.max(120, Math.min(160, data.size)) : 140;
  image.style.setProperty('--sticker-size', `${size}px`);
  image.alt = typeof data.title === 'string' ? data.title : '阿序的小表情';
  status.hidden = true;
  image.hidden = false;
  image.src = url.href;
  notifySize();
}
image.onload = notifySize;
image.onerror = () => fail('表情暂时没能加载');
app.ontoolresult = result => result.isError ? fail('没找到这张表情') : renderSticker(result.structuredContent);
app.ontoolcancelled = () => { image.hidden = true; status.hidden = true; notifySize(); };
// Existing ChatGPT clients may supply the initial result through the compatibility bridge.
if (window.openai?.toolOutput) renderSticker(window.openai.toolOutput);
window.addEventListener('openai:set_globals', event => {
  if (event.detail?.globals?.toolOutput) renderSticker(event.detail.globals.toolOutput);
});
if (window.parent !== window) {
  app.connect().then(() => { connected = true; notifySize(); }).catch(() => {
    if (!window.openai?.toolOutput) fail('表情组件连接失败');
  });
}
// Preview injection is provided only by the separate local test page, never URL query parameters.
if (window.parent === window && window.__STICKER_PREVIEW__) renderSticker(window.__STICKER_PREVIEW__);
