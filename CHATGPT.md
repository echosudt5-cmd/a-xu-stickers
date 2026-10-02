# ChatGPT 表情组件

## 运行

需要 Node.js 22 或更高版本。

```sh
npm ci
npm run build
npm test
npm start
```

默认 MCP 地址为 `http://127.0.0.1:8787/mcp`。`GET /health` 用于健康检查。
远程运行时设置 `HOST=0.0.0.0` 和托管服务要求的 `PORT`，通过 HTTPS 反向代理暴露 `/mcp`。
本地 stdio 客户端运行 `npm run start:stdio`。

## 工具

- `show_sticker({"sticker_id":"0003"})`：默认 140px。
- `show_sticker({"sticker_id":"0024","size":120})`：尺寸为 120–160 的整数。
- `list_stickers({})`：返回全部 ID 和标题，不显示组件。

ID 必须是四位字符串，保留前导零。不存在的 ID 会返回可读错误。
本阶段只实现精确 ID 查找；后续语义检索作为独立工具添加，复用表情返回格式。
图片固定到元数据所在的 Git commit。更新目录时同步更新 `ASSET_REVISION`，或通过 `STICKER_ASSET_REF` 指定可信 Git ref。

## 接入 ChatGPT

1. 在 HTTPS 服务运行 MCP server。
2. 在 ChatGPT 支持 MCP 的开发者/插件连接入口添加 `https://你的域名/mcp`。
3. 刷新连接中的工具列表，再调用 `show_sticker`。
4. 验收 ID `0003`，分别传入 120、140、160，查看真实对话位置和工具提示。

GitHub 存储图片和代码，不会仅凭仓库地址自动变成已连接的 ChatGPT 工具。
当前会话只有连接此 MCP 后才能原生调用组件。

## 显示边界

组件只有图片：透明背景、左对齐、零边距，无标题、卡片、按钮或分析代码输出。
成功调用返回 `content: []` 和 `structuredContent`，通过 UI resource 显示。
资源设置 `ui.prefersBorder: false` 和兼容的 `openai/widgetPrefersBorder: false`。

这些是宿主可采用的显示提示。ChatGPT 外层工具进度、名称、iframe 宽度及调用记录由客户端决定。
组件不能修改宿主 DOM，也没有官方保证隐藏全部调用提示的配置。
因此不能承诺所有客户端都做到完全无壳。真实客户端验收前，只能确认组件内尺寸与布局。
组件左对齐于宿主分配的 iframe；宿主自身外边距仍由 ChatGPT 决定。

## 验证

`npm test` 覆盖目录、MCP 工具调用、UI resource 元数据、错误 ID/尺寸和真实 HTTP transport。

```sh
npx playwright install chromium
node scripts/check-ui.mjs
```

浏览器检查覆盖 120/140/160px、图片 x=0、容器高度和无额外说明文字。
`dist/preview.html` 和 `dist/sticker-preview.png` 是本地预览，不代表 ChatGPT 外层渲染通过验收。
模板修改后增加 `WIDGET_URI` 版本，避免宿主缓存旧组件。

## 官方参考

- https://developers.openai.com/plugins/build/chatgpt-ui
- https://developers.openai.com/plugins/reference
- https://developers.openai.com/plugins/build/app-quickstart
