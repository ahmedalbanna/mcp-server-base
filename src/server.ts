import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from './config.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: config.server.name,
      version: config.server.version,
    },
    {
      capabilities: {
        logging: {},
        tools: {},
        resources: {},
        prompts: {},
      },
      instructions: `This is ${config.server.name} - a production-ready MCP base server. Use tools like echo, calculator, get_time, fetch_url. Resources at config://server-info and greeting://{name}. Prompts: code-review, explain-concept.`,
    }
  );

  // Register all capabilities
  registerAllTools(server);
  registerAllResources(server);
  registerAllPrompts(server);

  return server;
}
