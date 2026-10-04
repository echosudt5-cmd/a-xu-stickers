import { App } from '@modelcontextprotocol/ext-apps';

const app = new App(
  { name: 'a-xu-sticker', version: '0.3.0' },
  {},
  { autoResize: false }
);
const image = document.querySelector('#image');
const status = document.querySelector('#status');
const githubBasePath = '/echosudt5-cmd/a-xu-stickers/';
const proxyOrigin = 'https://a-xu-stickers.onrender.com';
let connected = false;
let dismissRequested = false;

function notifySize(height) {
  if (!connected) return;
  void app.sendSizeChanged({
    height: height ?? Math.ceil(document.body.getBoundingClientRect().height)
  }).catch(() => {});
}

function requestDismiss() {
  dismissRequested = true;
  image.hidden = true;
  image.removeAttribute('src');
  status.hidden = true;
  document.documentElement.style.height = '0';
  document.documentElement.style.overflow = 'hidden';
  document.body.style.height = '0';
  document.body.style.minHeight = '0';
  notifySize(0);

  if (connected && typeof app.requestTeardown === 'function') {
    void Promise.resolve(app.requestTeardown()).catch(() => {});
  }
  if (typeof window.openai?.requestClose === 'function') {
    void Promise.resolve(window.openai.requestClose()).catch(() => {});
  }
}

function showSurface() {
  dismissRequested = false;
  document.documentElement.style.height = '';
  document.documentElement.style.overflow = '';
  document.body.style.height = '';
  document.body.style.minHeight = '';
}

function fail(message) {
  showSurface();
  image.hidden = true;
  image.removeAttribute('src');
  status.textContent = message;
  status.hidden = false;
  notifySize();
}

function unwrapToolOutput(value) {
  return value?.structuredContent ?? value?.structured_content ?? value;
}

export function renderSticker(value) {
  const data = unwrapToolOutput(value);
  if (
    !data ||
    typeof data.image_url !== 'string' ||
    !/^[0-9]{4}$/.test(data.sticker_id)
  ) {
    fail('没有收到表情数据');
    return;
  }

  if (data.render_mode === 'markdown') {
    requestDismiss();
    return;
  }

  showSurface();

  let url;
  try {
    url = new URL(data.image_url);
  } catch {
    fail('表情地址不可用');
    return;
  }

  const proxyPath = `/stickers/${data.sticker_id}.png`;
  const isProxyUrl =
    url.origin === proxyOrigin &&
    url.pathname === proxyPath &&
    !url.search &&
    !url.hash;
  const isGithubUrl =
    url.origin === 'https://raw.githubusercontent.com' &&
    url.pathname.startsWith(githubBasePath) &&
    url.pathname.endsWith(proxyPath) &&
    !url.search &&
    !url.hash;
  if (!isProxyUrl && !isGithubUrl) {
    fail('表情地址不可用');
    return;
  }

  const size = Number.isInteger(data.size)
    ? Math.max(120, Math.min(160, data.size))
    : 140;
  image.style.setProperty('--sticker-size', `${size}px`);
  image.alt =
    typeof data.title === 'string' ? data.title : '阿序的小表情';
  status.hidden = true;
  image.hidden = false;
  image.src = url.href;
  notifySize();
}

image.onload = () => notifySize();
image.onerror = () => fail('表情图片加载失败');
app.ontoolresult = result =>
  result.isError ? fail('没找到这张表情') : renderSticker(result);
app.ontoolcancelled = requestDismiss;

// Existing ChatGPT clients may supply the initial result through the compatibility bridge.
if (window.openai?.toolOutput) renderSticker(window.openai.toolOutput);
window.addEventListener('openai:set_globals', event => {
  if (event.detail?.globals?.toolOutput) {
    renderSticker(event.detail.globals.toolOutput);
  }
});

if (window.parent !== window) {
  app.connect().then(() => {
    connected = true;
    if (dismissRequested) {
      requestDismiss();
    } else {
      notifySize();
    }
  }).catch(() => {
    if (!window.openai?.toolOutput) fail('表情组件连接失败');
  });
}

// Preview injection is provided only by the separate local test page, never URL query parameters.
if (window.parent === window && window.__STICKER_PREVIEW__) {
  renderSticker(window.__STICKER_PREVIEW__);
}
