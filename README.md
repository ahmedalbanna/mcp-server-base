# MCP Server Base — Strong Production Ready (2026)

[![CI](https://github.com/ahmedalbanna/mcp-server-base/actions/workflows/ci.yml/badge.svg)](https://github.com/ahmedalbanna/mcp-server-base/actions/workflows/ci.yml)
[![Node 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](.nvmrc)
[![MCP SDK 1.12.1](https://img.shields.io/badge/MCP%20SDK-1.12.1-blue)](https://github.com/modelcontextprotocol/typescript-sdk)
[![TypeScript 5.7](https://img.shields.io/badge/TypeScript-5.7-3178c6)](https://www.typescriptlang.org/)
[![License MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Coverage 80%](https://img.shields.io/badge/coverage-80%25-brightgreen)](vitest.config.ts)

Modern **Model Context Protocol** server using the latest stack:

- **MCP SDK `1.12+`** — `McpServer` high-level API + `StreamableHTTPServerTransport` (new) & `StdioServerTransport`
- **TypeScript 5.7 ESM** + `NodeNext` module
- **Zod** validation → auto JSON Schema
- **Express 4** for HTTP + CORS + health check
- Dual transport: **STDIO** (Claude Desktop) and **Streamable HTTP** (remote, 2025-03 spec)
- Structured tool/resource/prompt modules
- `tsx` watch, `vitest`, graceful shutdown

---

## 🚀 Quick Start

```bash
npm install
npm run build

# STDIO (for Claude Desktop, Cursor, opencode, etc.)
npm start

# HTTP (Streamable HTTP - latest)
npm run start:http
# → http://localhost:3000/mcp
# → health http://localhost:3000/health
```

### Dev

```bash
npm run dev          # stdio watch
npm run dev:http     # http watch (Streamable HTTP at http://localhost:3000/mcp)
npm test             # unit + e2e (InMemory + HTTP)
npm run test:coverage # coverage 80% thresholds
npm run lint         # eslint 9 flat config
npm run format:check # prettier
npm run typecheck    # tsc --noEmit
npm run build
```

### CI

`.github/workflows/ci.yml` runs on `push`/`PR` to `main` with Node 20+22 matrix: lint, format:check, typecheck, test:coverage, build, docker build.

---

## 🔌 Transports

| Transport           | Use                            | Command                     |
| ------------------- | ------------------------------ | --------------------------- |
| **STDIO**           | Local clients (Claude Desktop) | `node dist/index.js`        |
| **Streamable HTTP** | Remote / Docker / Cloud        | `node dist/index.js --http` |

Streamable HTTP is the **new standard** replacing SSE (deprecated March 2025).

---

## 🧰 Tools (4)

| Tool         | Description     | Input                   |
| ------------ | --------------- | ----------------------- |
| `echo`       | Echo message    | `message`, `uppercase?` |
| `calculator` | add/sub/mul/div | `operation`, `a`, `b`   |
| `get_time`   | Current time    | `timezone?`             |
| `fetch_url`  | Fetch URL       | `url`, `maxLength?`     |

## 📦 Resources (2)

- `config://server-info` — server metadata (JSON)
- `greeting://{name}` — dynamic greeting template

## 💬 Prompts (2)

- `code-review` — args: `language`, `code`
- `explain-concept` — args: `concept`, `level`

---

## ⚙️ Client Config

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "mcp-server-base": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

### HTTP Client

```ts
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const client = new Client({ name: 'my-client', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp')));
const tools = await client.listTools();
```

### Inspector

```bash
npm run inspect
# or
npx @modelcontextprotocol/inspector node dist/index.js
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

---

## 🐳 Docker

```dockerfile
# See Dockerfile
docker build -t mcp-server-base .
docker run -p 3000:3000 --env TRANSPORT=http mcp-server-base
```

---

## 📁 Structure

```
src/
├── index.ts        # entry: stdio + http dual transport
├── server.ts       # createMcpServer() factory
├── config.ts       # env config
├── types.ts        # Zod schemas
├── utils/logger.ts # stderr logger (stdio-safe)
├── tools/          # registerAllTools()
├── resources/      # registerAllResources()
└── prompts/        # registerAllPrompts()
```

Add a new tool: create `src/tools/my.tool.ts` → export `registerMyTool(server)` → add to `src/tools/index.ts`.

---

## 🔐 Best Practices Included

- Logger uses `console.error` (stderr) so logs don't corrupt stdio stdout (`src/utils/logger.ts:1`)
- Zod → JSON Schema via SDK (`src/types.ts:1`, `src/tools/*.tool.ts`)
- Timeout on fetch (10s) + structured errors
- Graceful SIGINT/SIGTERM (`src/index.ts:86`)
- Health endpoint separate from MCP (`GET /health`)
- Stateless Streamable HTTP per-request (`sessionIdGenerator: undefined`, `src/index.ts:22`)
- Type-safe, strict TS + ESLint flat + Prettier + husky + lint-staged
- Coverage 80% enforced (`vitest.config.ts:1`), E2E HTTP tests (`tests/e2e/http.test.ts:1`)

## 🤝 Contributing

See `CONTRIBUTING.md` — `nvm use`, `npm test`, add tool/resource/prompt, ensure `lint`/`typecheck`/`test` pass. See `CODE_OF_CONDUCT.md`.

---

## 📚 MCP Docs

- Spec: https://spec.modelcontextprotocol.io
- SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Inspector: https://github.com/modelcontextprotocol/inspector
