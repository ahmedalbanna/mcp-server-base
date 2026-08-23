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
- **Zod** validation → auto JSON Schema + env validation (`src/config.ts:1`)
- **Express 4** + **helmet** + **CORS allowlist** + **rate-limit** + health/ready
- Dual transport: **STDIO** (Claude Desktop) and **Streamable HTTP** (remote, 2025-03 spec, stateless + stateful resumability)
- Structured tool/resource/prompt modules
- `tsx` watch, `vitest` (67 tests, 98% coverage), graceful shutdown

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

## 🧰 Tools (18)

| Tool                     | Description                            | Input                           |
| ------------------------ | -------------------------------------- | ------------------------------- |
| `echo`                   | Echo message                           | `message`, `uppercase?`         |
| `calculator`             | add/sub/mul/div                        | `operation`, `a`, `b`           |
| `get_time`               | Current time                           | `timezone?`                     |
| `fetch_url`              | Fetch URL                              | `url`, `maxLength?`             |
| `list_files`             | List files under ALLOWED_ROOT          | `path?`, `recursive?`           |
| `read_file`              | Read file (1MB limit)                  | `path`                          |
| `write_file`             | Write file + triggers resource changed | `path`, `content`               |
| `search_files`           | Search text inside files               | `query`, `path?`, `maxResults?` |
| `memory_set`             | Set KV in memory                       | `key`, `value`                  |
| `memory_get`             | Get KV                                 | `key`                           |
| `memory_delete`          | Delete KV                              | `key`                           |
| `memory_list`            | List KVs                               | —                               |
| `memory_clear`           | Clear all                              | —                               |
| `database_query`         | SQL via alasql (users, notes)          | `sql`                           |
| `database_tables`        | List tables row counts                 | —                               |
| `shell_execute`          | Shell (allowlist, disabled by default) | `command`, `timeout?`           |
| `collect_user_info`      | Elicitation demo (contact/preferences) | `infoType?`                     |
| `generate_with_sampling` | Sampling demo (LLM)                    | `prompt`, `maxTokens?`          |

## 📦 Resources (5)

- `config://server-info` — server metadata (JSON, now includes `features`)
- `greeting://{name}` — dynamic greeting template
- `file:///{+path}` — sandboxed file (`ALLOWED_ROOT`), list + complete, `file:///notes.txt`
- `memory://{key}` — memory KV, list + complete
- `db://{table}/{id}` — demo DB row (users/notes), list + complete

## 💬 Prompts (4)

- `code-review` — args: `language`, `code`
- `explain-concept` — args: `concept`, `level`
- `summarize` — args: `text`, `length` (short/medium/long), `style` (bullets/paragraph/tldr)
- `research` — args: `topic`, `depth` (overview/deep), `audience` (beginner/expert/executive)

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
├── index.ts              # entry: stdio + http (helmet/cors/rateLimit/auth/resumability)
├── server.ts             # createMcpServer() factory
├── config.ts             # zod env validation (AUTH_MODE, CORS, rateLimit, resumability)
├── types.ts              # Zod schemas
├── middleware/auth.ts    # AUTH_MODE none|apiKey|bearer
├── middleware/rateLimit.ts
├── middleware/requestId.ts
├── utils/logger.ts       # stderr, JSON/text, redaction, child(requestId)
├── utils/eventStore.ts   # InMemoryEventStore for Last-Event-ID
├── tools/                # registerAllTools()
├── resources/            # registerAllResources()
└── prompts/              # registerAllPrompts()
```

Add a new tool: create `src/tools/my.tool.ts` → export `registerMyTool(server)` → add to `src/tools/index.ts`.

---

## 🔐 Security (Phase 2) — New

- **Helmet** headers (`x-dns-prefetch-control`, `x-frame-options`, `x-content-type-options`, etc.) via `helmet@7` (`src/index.ts:1`)
- **CORS allowlist** (`CORS_ORIGIN=*` or comma list) with `cors` credentials handling (`src/config.ts:60`)
- **Auth** `AUTH_MODE=none|apiKey|bearer` at `src/middleware/auth.ts:1` — `401` without valid `X-API-Key` or `Authorization: Bearer` (health/ready & OPTIONS excluded)
- **Rate limiting** `express-rate-limit` (default 100/15min) on `/mcp` — `429 Too Many Requests` (`src/middleware/rateLimit.ts:1`)
- **RequestId** (`X-Request-Id` randomUUID, echo header, child logger correlation) (`src/middleware/requestId.ts:1`)
- **Zod env validation** (`src/config.ts:1`) — `parseEnv()` validates `PORT`, `AUTH_MODE`, `API_KEY` cross-field, fails fast on invalid env
- **Structured logger** JSON/text, `[REDACTED]` for `authorization`, `apiKey`, `token` (`src/utils/logger.ts:24`)
- **Resumability** `InMemoryEventStore` (`src/utils/eventStore.ts:1`) + stateful session map when `RESUMABILITY_ENABLED=true` (replay via `Last-Event-ID`, `GET /mcp` stream, `DELETE` close)
- **Docker hardening** non-root `appuser` + `HEALTHCHECK` (`Dockerfile:1`)
- Tests: `tests/unit/auth.test.ts`, `tests/unit/logger.test.ts`, `tests/unit/eventStore.test.ts`, `tests/e2e/security.test.ts` (helmet/auth/rateLimit/resumability) — `67 tests, 98% coverage`

## 🔐 Best Practices Included

- Logger stderr-safe, never logs secrets (redaction)
- Zod → JSON Schema via SDK (`src/types.ts:1`, `src/tools/*.tool.ts`)
- Timeout on fetch (10s) + structured errors
- Graceful shutdown (`SIGINT/SIGTERM`)
- Health (`GET /health`) & ready (`GET /ready`) separate from MCP
- Stateless default (`sessionIdGenerator: undefined`), stateful when `RESUMABILITY_ENABLED=true` (`src/index.ts:22`)
- Type-safe, strict TS + ESLint flat + Prettier + husky + lint-staged
- Coverage 80% enforced (`vitest.config.ts:1`), E2E HTTP + security tests (`tests/e2e/*.test.ts:1`)

## 🤝 Contributing

See `CONTRIBUTING.md` — `nvm use`, `npm test`, add tool/resource/prompt, ensure `lint`/`typecheck`/`test` pass. See `CODE_OF_CONDUCT.md`.

---

## 📚 MCP Docs

- Spec: https://spec.modelcontextprotocol.io
- SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Inspector: https://github.com/modelcontextprotocol/inspector
