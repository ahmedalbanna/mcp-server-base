import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from './config.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { registerAllPrompts } from './prompts/index.js';
import { registerPlugin } from './plugin/index.js';
import { slackPlugin } from './integrations/slack.js';
import { notionPlugin } from './integrations/notion.js';
import { linearPlugin } from './integrations/linear.js';

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
      instructions: `This is ${config.server.name} v${config.server.version} - production-ready MCP base server (v2.2 Ecosystem & DX).

Capabilities:
- Tools (40): echo, calculator, get_time, fetch_url, filesystem (list/read/write/search), memory (set/get/delete/list/clear), database (query/tables), shell (allowlist), rag (ingest/search/list/clear hybrid BM25+vector), web (brave/tavily/fetch cached), github (search/repo/issue), slack (list/post/search), notion (search/get/create), linear (list/create/get), elicitation, sampling, tasks (create/get/result)
- Resources (6): config://server-info, greeting://{name}, file:///{+path}, memory://{key}, db://{table}/{id}, docs://{id}
- Prompts (4): code-review, explain-concept, summarize, research + playground at /admin/prompts/:name/preview
- Security: helmet, CORS, auth (none/apiKey/bearer), RBAC (reader/writer/admin), rateLimit, requestId
- Operability: OTEL tracing (${config.otel.enabled ? 'enabled' : 'disabled'}), admin at /admin, resumability ${config.resumability.enabled ? 'enabled' : 'stateless'}, eventStore ${config.eventStore.type}, cache (memory/redis), plugins (slack, notion, linear)
- Registry: npm + smithery.yaml (mcpName io.github.ahmedalbanna/mcp-server-base) — v2.2.0

Use tools with Zod validation. For filesystem, stay under ALLOWED_ROOT=${config.fs.allowedRoot}. For RAG, ingest (hybrid) then search (vector|bm25|hybrid). Admin playground at /admin. Plugins via definePlugin/registerPlugin.`,
    }
  );

  // Register all capabilities
  registerAllTools(server);
  registerAllResources(server);
  registerAllPrompts(server);

  // v2.2 Plugin SDK - register example integrations (slack, notion, linear) as plugins
  // These are lightweight mock plugins; real tokens via env SLACK_TOKEN etc.
  try {
    registerPlugin(server, slackPlugin);
    registerPlugin(server, notionPlugin);
    registerPlugin(server, linearPlugin);
  } catch {}

  return server;
}
