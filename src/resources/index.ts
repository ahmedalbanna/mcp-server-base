import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config.js';

export function registerAllResources(server: McpServer) {
  // Static resource: server info
  server.registerResource(
    'server-info',
    'config://server-info',
    {
      title: 'Server Information',
      description: 'Static information about this MCP server',
      mimeType: 'application/json',
    },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              name: config.server.name,
              version: config.server.version,
              description: config.server.description,
              capabilities: ['tools', 'resources', 'prompts'],
              runtime: `Node ${process.version}`,
              uptime: process.uptime(),
            },
            null,
            2
          ),
        },
      ],
    })
  );

  // Dynamic resource template: greeting
  server.registerResource(
    'greeting',
    new ResourceTemplate('greeting://{name}', { list: undefined }),
    {
      title: 'Personalized Greeting',
      description: 'Generate a greeting for a given name',
      mimeType: 'text/plain',
    },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/plain',
          text: `Hello, ${variables.name}! Welcome to ${config.server.name} v${config.server.version}. Time: ${new Date().toISOString()}`,
        },
      ],
    })
  );
}
