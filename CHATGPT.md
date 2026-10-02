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

- `show_sticker({"sticker_id":"0003"})`：直接返回该表情的原生 MCP PNG image content。
- `list_stickers({})`：返回当前目录里的全部 ID 和标题。

ID 必须是四位字符串，保留前导零。不存在的 ID 会返回可读错误。
本阶段实现精确 ID 查找；后续语义检索作为独立工具添加。

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
4. 验收 ID `0003`，观察原生图片是否显示，以及消息输出完成时是否闪烁。

## 原生图片实验

`show_sticker` 不绑定 MCP widget，也不注册 UI resource。执行时服务端会：

1. 动态查询 GitHub catalog。
2. 下载目标 PNG（最多 5 MB，要求 `image/png`）。
3. 转成 base64，并作为 MCP `content` 中的原生 image 返回：

```js
content: [{
  type: 'image',
  data: '<base64>',
  mimeType: 'image/png'
}]
```

`structuredContent` 只保留模型理解所需的信息：

```json
{
  "sticker_id": "0003",
  "title": "咪"
}
```

工具说明要求模型不要再用 Markdown、URL、附件或 widget 重发图片，避免重复显示。此版本用于验证 ChatGPT 是否对原生 MCP image content 使用更稳定的媒体渲染路径。

## 验证

`npm test` 覆盖动态目录、PNG 下载与签名、原生 image content、无 widget 绑定、错误 ID 和真实 HTTP transport。
