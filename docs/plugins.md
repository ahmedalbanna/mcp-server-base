# Plugin SDK (v2.2)

Extend the server with first-class tools/resources/prompts without touching core files.

## Quick start

```ts
// src/integrations/my-plugin.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { definePlugin } from '../plugin/index.js';

export const myPlugin = definePlugin({
  name: 'my-plugin',
  version: '1.0.0',
  description: 'Does one thing well',
  tools: ['my_tool'], // optional metadata for admin UI
  register(server: McpServer) {
    server.registerTool(
      'my_tool',
      {
        title: 'My Tool',
        description: 'What it does',
        inputSchema: { input: z.string() },
      },
      async ({ input }) => ({ content: [{ type: 'text', text: `ok: ${input}` }] })
    );
  },
});
```

```ts
// src/server.ts (or any composition root)
import { registerPlugin } from './plugin/index.js';
import { myPlugin } from './integrations/my-plugin.js';

registerPlugin(server, myPlugin);
```

## API

| Function                    | Behavior                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `definePlugin(p)`           | Identity helper (typed)                                                                                                                                         |
| `registerPlugin(server, p)` | Runs `p.register(server)` once; records plugin; emits `tools/resources/prompts list_changed`; **tolerates duplicate registrations** (warns instead of throwing) |
| `getRegisteredPlugins()`    | Snapshot of loaded plugins                                                                                                                                      |
| `getPlugin(name)`           | Lookup                                                                                                                                                          |
| `clearPlugins()`            | Test helper                                                                                                                                                     |

## Built-in example plugins

All ship in `src/integrations/` and are auto-registered by `createMcpServer()`. Each degrades to deterministic mocks when its token is absent:

| Plugin         | Env token      | Tools                                                           |
| -------------- | -------------- | --------------------------------------------------------------- |
| `slackPlugin`  | `SLACK_TOKEN`  | `slack_list_channels`, `slack_post_message`, `slack_search`     |
| `notionPlugin` | `NOTION_TOKEN` | `notion_search`, `notion_get_page`, `notion_create_page`        |
| `linearPlugin` | —              | `linear_list_issues`, `linear_create_issue`, `linear_get_issue` |

## Guidelines

1. **Idempotent registration** — the SDK tolerates re-registration, but prefer stateless `register()` so a plugin can be attached to fresh server instances (tests, cluster workers).
2. **Declare metadata** — set `tools[]`, `resources[]`, `prompts[]` so `/admin/tools` and logs can attribute capabilities.
3. **Mock-first** — follow the built-ins: no token ⇒ deterministic mock output; never throw for missing credentials at import time.
4. **Zod inputs** — describe every argument; schemas surface to clients via `tools/list`.
5. **Respect RBAC** — new write-capable tools should be added to `TOOL_ROLES` (`src/middleware/rbac.ts`) with at least `writer`.
6. **Emit change notifications** — if you add resources, call `server.sendResourceListChanged()` after mutation.

## Registry distribution

The package is prepared for MCP registry / Smithery listing:

- `package.json`: `mcpName: io.github.ahmedalbanna/mcp-server-base`, `files` includes `dist` + `smithery.yaml`
- `smithery.yaml`: stdio `startCommand`, `configSchema` for PORT/AUTH_MODE/keys

Publish flow: `npm version <bump>` → tag push → CI builds → `npm publish` + GHCR image (see `.github/workflows/release.yml`).
