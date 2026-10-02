# ChatGPT 表情组件

## 运行

需要 Node.js 22 或更高版本。

```sh
npm ci
npm run build
npm test
npm start
```

默认 MCP 地址为 `http://127.0.0.1:8787/mcp`，`GET /health` 用于健康检查。
远程运行时设置 `HOST=0.0.0.0` 和托管服务要求的 `PORT`，通过 HTTPS 暴露 `/mcp`。
本地 stdio 客户端运行 `npm run start:stdio`。

## 工具

- `show_sticker({"sticker_id":"0003"})`：默认 140px。
- `show_sticker({"sticker_id":"0024","size":120})`：尺寸为 120–160 的整数。
- `list_stickers({})`：返回当前目录里的全部 ID 和标题。

ID 必须是四位字符串，保留前导零。不存在的 ID 会返回可读错误。
本阶段实现精确 ID 查找；后续语义检索作为独立工具添加，复用同一返回格式。

## 动态表情目录

运行中的服务会从 GitHub `main` 分支读取：

- `metadata/stickers.json`
- `stickers/{sticker_id}.png`

目录缓存 60 秒。GitHub 暂时不可用时，服务会退回最近成功读取的目录或部署时打包的目录。

新增表情时：

1. 上传 `stickers/四位ID.png`。
2. 在 `metadata/stickers.json` 的 `stickers` 数组添加对应记录。
3. 提交到 `main`。

不需要修改服务器代码，也不需要重新部署 Render；最多等待约 60 秒即可被 `show_sticker` 和 `list_stickers` 发现。

## 接入 ChatGPT

1. 在 HTTPS 服务运行 MCP server。
2. 在 ChatGPT 的开发者/插件连接入口添加 `https://你的域名/mcp`。
3. 刷新连接中的工具列表，再调用 `show_sticker`。
4. 验收 ID `0003`，分别传入 120、140、160。

GitHub 负责存储图片和目录；MCP 负责按 ID 查找、校验并返回图片地址。

## 网页与桌面客户端

支持 MCP Apps UI 的网页端可以渲染原生 widget：透明背景、左对齐、无标题和按钮。

不渲染自定义 widget 的客户端仍可使用同一个工具。工具会返回 `image_url`，模型应使用标题作为 alt 文本，以 Markdown 图片形式直接发送：

```md
![咪](https://raw.githubusercontent.com/echosudt5-cmd/a-xu-stickers/main/stickers/0003.png)
```

因此 widget 保留用于支持它的宿主，Markdown 图片作为跨客户端回退方案。

## 显示边界

资源设置 `ui.prefersBorder: false` 和兼容的 `openai/widgetPrefersBorder: false`。
这些是宿主可采用的显示提示。ChatGPT 外层工具进度、名称、iframe 宽度及调用记录由客户端决定。
组件不能修改宿主 DOM，因此不能保证所有客户端都完全无壳。

## 验证

`npm test` 覆盖动态目录、MCP 工具调用、UI resource 元数据、错误 ID/尺寸和真实 HTTP transport。

```sh
npx playwright install chromium
node scripts/check-ui.mjs
```

浏览器检查覆盖 120/140/160px、图片 x=0、容器高度和无额外说明文字。
`dist/preview.html` 和 `dist/sticker-preview.png` 是本地预览，不代表所有 ChatGPT 客户端都支持 widget。
模板修改后增加 `WIDGET_URI` 版本，避免宿主缓存旧组件。

## 官方参考

- https://developers.openai.com/plugins/build/chatgpt-ui
- https://developers.openai.com/plugins/reference
- https://developers.openai.com/plugins/build/app-quickstart
