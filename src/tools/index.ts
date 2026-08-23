import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEchoTool, registerCalculatorTool, registerTimeTool } from './echo.tool.js';
import { registerFetchTool } from './fetch.tool.js';

export function registerAllTools(server: McpServer) {
  registerEchoTool(server);
  registerCalculatorTool(server);
  registerTimeTool(server);
  registerFetchTool(server);
}
