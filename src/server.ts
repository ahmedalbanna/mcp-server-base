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
      // v2.0: versioned MCP with instructions per minor
      title: `${config.server.name} v${config.server.version}`,
      description: config.server.description,
    },
    {
      capabilities: {
        logging: {},
        tools: {},
        resources: {},
        prompts: {},
      },
      instructions: `This is ${config.server.name} v${config.server.version} - production-ready MCP base server (v2.0 Scale & Operability).

Capabilities:
- Tools (28): echo, calculator, get_time, fetch_url, filesystem (list/read/write/search), memory (set/get/delete/list/clear), database (query/tables), shell (allowlist), rag (ingest/search/list/clear), web (brave/tavily/fetch cached), github (search/repo/issue), elicitation, sampling, tasks (create/get/result)
- Resources (6): config://server-info, greeting://{name}, file:///{+path}, memory://{key}, db://{table}/{id}, docs://{id}
- Prompts (4): code-review, explain-concept, summarize, research
- Security: helmet, CORS, auth (none/apiKey/bearer), rateLimit, requestId
- Operability: OTEL tracing (${config.otel.enabled ? 'enabled' : 'disabled'}), admin at /admin, resumability ${config.resumability.enabled ? 'enabled' : 'stateless'}, eventStore ${config.eventStore.type}, cache (memory/redis)

Use tools with Zod validation. For filesystem, stay under ALLOWED_ROOT=${config.fs.allowedRoot}. For RAG, ingest then search. For web/github, cached. Admin at /admin (token: ${config.admin.token ? 'protected' : 'open'}).`,
    }
  );

  // Register all capabilities
  registerAllTools(server);
  registerAllResources(server);
  registerAllPrompts(server);

  return server;
}
