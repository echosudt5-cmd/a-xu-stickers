import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createStickerServer } from './mcp.mjs';
await createStickerServer().connect(new StdioServerTransport());
