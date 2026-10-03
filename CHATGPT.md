# ChatGPT 表情工具

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

- `show_sticker({"sticker_id":"0003","size":140})`：返回并用 inline UI 显示一个表情。
- `list_stickers({})`：返回当前目录里的全部 ID 和标题。

ID 必须是四位字符串，保留前导零。尺寸范围为 120–160px，默认 140px。不存在的 ID 或越界尺寸会返回可读错误。
本阶段实现精确 ID 查找；后续语义检索作为独立工具添加，复用同一目录。

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
3. 部署代码后刷新或重新连接插件，让客户端重新读取工具 schema 和 UI resource。
4. 最好开一个新聊天调用 `show_sticker({"sticker_id":"0003","size":140})`。

GitHub 负责存储图片和目录；MCP 负责按 ID 查找、校验并返回图片地址；inline UI 负责跨端展示。

## 显示方式

`show_sticker` 绑定 `ui://a-xu/sticker-v3.html`，使用 MCP Apps MIME `text/html;profile=mcp-app`。标准绑定字段为 `_meta.ui.resourceUri`，并保留 `openai/outputTemplate` 兼容别名。

工具输出包含：

```json
{
  "sticker_id": "0003",
  "title": "咪",
  "image_url": "https://raw.githubusercontent.com/echosudt5-cmd/a-xu-stickers/main/stickers/0003.png",
  "size": 140
}
```

组件为透明背景、左对齐、无边框、无标题、无按钮，仅显示一张 120–160px 图片。CSP 只允许从 `https://raw.githubusercontent.com` 加载资源，显示模式仅为 `inline`。

工具说明明确要求模型不要再发送 Markdown 图片，也不要重复 ID、URL、JSON、标题或技术信息，以避免双份表情。

## 实验记录

- Markdown 外链图片：网页端可见，但 Android ChatGPT App 不稳定或完全不显示，因此不再作为当前显示方案。
- MCP `image content`（base64 PNG）：测试时没有自动显示到用户可见消息中，因此暂不采用。
- 当前方案：标准 MCP Apps inline UI，使用新版 `_meta.ui.resourceUri` 和 v3 resource URI。

## 三端验收

分别在 Web、Windows desktop、Android 测试 `0003`：

- 成功时只出现一张图片。
- 图片左对齐，尺寸 120–160px。
- 背景透明，无 border、card chrome、标题、按钮或说明文字。
- 模型不重复发送 Markdown 图片。
- 失败时区分并记录：resource 未挂载、iframe 加载失败、tool result 未传入、remote image CSP 失败。

## 验证

`npm test` 覆盖动态目录、v3 UI resource、MIME、CSP、工具绑定、完整输出、错误 ID/尺寸和真实 HTTP transport。
