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

- `show_sticker({"sticker_id":"0003"})`：返回该表情的 `title` 和 `image_url`。
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
4. 验收 ID `0003`。

GitHub 负责存储图片和目录；MCP 负责按 ID 查找、校验并返回图片地址。

## 显示方式

`show_sticker` 不绑定 MCP widget，也不注册 UI resource。它只返回：

```json
{
  "title": "咪",
  "image_url": "https://raw.githubusercontent.com/echosudt5-cmd/a-xu-stickers/main/stickers/0003.png"
}
```

工具说明要求模型在拿到结果后直接发送 Markdown 图片：

```md
![咪](https://raw.githubusercontent.com/echosudt5-cmd/a-xu-stickers/main/stickers/0003.png)
```

这样网页端和桌面客户端只显示同一张 Markdown 图片，不会再由 widget 重复渲染。

## 验证

`npm test` 覆盖动态目录、MCP 工具调用、无 widget 绑定、错误 ID 和真实 HTTP transport。
