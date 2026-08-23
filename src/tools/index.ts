import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEchoTool, registerCalculatorTool, registerTimeTool } from './echo.tool.js';
import { registerFetchTool } from './fetch.tool.js';
import { registerFilesystemTools } from './filesystem.tool.js';
import { registerMemoryTools } from './memory.tool.js';
import { registerDatabaseTools } from './database.tool.js';
import { registerShellTool } from './shell.tool.js';
import { registerElicitationTool } from './elicitation.tool.js';
import { registerSamplingTool } from './sampling.tool.js';

export function registerAllTools(server: McpServer) {
  // Phase 1 core
  registerEchoTool(server);
  registerCalculatorTool(server);
  registerTimeTool(server);
  registerFetchTool(server);
  // Phase 3 core capabilities
  registerFilesystemTools(server);
  registerMemoryTools(server);
  registerDatabaseTools(server);
  registerShellTool(server);
  registerElicitationTool(server);
  registerSamplingTool(server);
}
