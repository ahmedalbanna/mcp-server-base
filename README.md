# MCP Server Base v3.0 — Scale & Enterprise (2026)

[![CI](https://github.com/ahmedalbanna/mcp-server-base/actions/workflows/ci.yml/badge.svg)](https://github.com/ahmedalbanna/mcp-server-base/actions/workflows/ci.yml)
[![Node 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](.nvmrc)
[![MCP SDK 1.12.1](https://img.shields.io/badge/MCP%20SDK-1.12.1-blue)](https://github.com/modelcontextprotocol/typescript-sdk)
[![TypeScript 5.7](https://img.shields.io/badge/TypeScript-5.7-3178c6)](https://www.typescriptlang.org/)
[![License MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Coverage 88%](https://img.shields.io/badge/coverage-88%25-brightgreen)](vitest.config.ts)
[![Version 3.0.0](https://img.shields.io/badge/version-3.0.0-blue)](package.json)
[![Smithery](https://img.shields.io/badge/Registry-smithery-orange)](smithery.yaml)

Modern **Model Context Protocol** server using the latest stack:

- **MCP SDK `1.12+`** — `McpServer` high-level API + `StreamableHTTPServerTransport` (new) & `StdioServerTransport`
- **TypeScript 5.7 ESM** + `NodeNext` module
- **Zod** validation → auto JSON Schema + env validation (`src/config.ts:1`)
- **Express 4** + **helmet** + **CORS allowlist** + **rate-limit** + health/ready + **Admin UI**
- Dual transport: **STDIO** (Claude Desktop) and **Streamable HTTP** (remote, 2025-03 spec, stateless + stateful resumability via **RedisEventStore**)
- Structured tool/resource/prompt modules + **RAG hybrid (BM25+vector)**, **Web (cached)**, **GitHub** integrations
- **Plugin SDK** (`src/plugin/index.ts:1`) + integrations (slack/notion/linear), **Registry** (smithery.yaml, mcpName), **Prompt Playground** at `/admin`
- **v3.0 Enterprise**: Multi-tenant (`X-Tenant-Id`, namespaced stores), SSO OIDC, Control plane CRUD, cluster mode, Prometheus/Grafana stack
- **OTEL** tracing/metrics (`src/utils/otel.ts:1`), **Tasks** (experimental + `create_task`), **k6** load tests
- `tsx` watch, `vitest` (178 tests, 88% coverage), graceful shutdown, `docker-compose` (redis, postgres, qdrant, otel-collector, prometheus, grafana)

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

## 🧰 Tools (40)

| Tool                     | Description                            | Input                                    |
| ------------------------ | -------------------------------------- | ---------------------------------------- |
| `echo`                   | Echo message                           | `message`, `uppercase?`                  |
| `calculator`             | add/sub/mul/div                        | `operation`, `a`, `b`                    |
| `get_time`               | Current time                           | `timezone?`                              |
| `fetch_url`              | Fetch URL                              | `url`, `maxLength?`                      |
| `list_files`             | List files under ALLOWED_ROOT          | `path?`, `recursive?`                    |
| `read_file`              | Read file (1MB limit)                  | `path`                                   |
| `write_file`             | Write file + triggers resource changed | `path`, `content`                        |
| `search_files`           | Search text inside files               | `query`, `path?`, `maxResults?`          |
| `memory_set`             | Set KV in memory                       | `key`, `value`                           |
| `memory_get`             | Get KV                                 | `key`                                    |
| `memory_delete`          | Delete KV                              | `key`                                    |
| `memory_list`            | List KVs                               | —                                        |
| `memory_clear`           | Clear all                              | —                                        |
| `database_query`         | SQL via alasql (users, notes)          | `sql`                                    |
| `database_tables`        | List tables row counts                 | —                                        |
| `shell_execute`          | Shell (allowlist, disabled by default) | `command`, `timeout?`                    |
| `collect_user_info`      | Elicitation demo (contact/preferences) | `infoType?`                              |
| `generate_with_sampling` | Sampling demo (LLM)                    | `prompt`, `maxTokens?`                   |
| `rag_ingest`             | Ingest text (chunked, embedded)        | `text`, `id?`, `metadata?`, `chunk?`     |
| `rag_search`             | **Hybrid search (vector+BM25)**        | `query`, `topK?`, `threshold?`, `mode?`  |
| `rag_list`               | List docs                              | —                                        |
| `rag_clear`              | Clear vector store                     | —                                        |
| `brave_search`           | Brave API (mock if no key)             | `query`, `count?`                        |
| `tavily_search`          | Tavily API (mock if no key)            | `query`, `maxResults?`, `includeAnswer?` |
| `web_fetch`              | Cached web fetch                       | `url`, `useCache?`, `maxLength?`         |
| `github_search_repos`    | GitHub search repos                    | `query`, `perPage?`                      |
| `github_get_repo`        | GitHub get repo                        | `repo`                                   |
| `github_get_issue`       | GitHub get issue                       | `repo`, `issueNumber`                    |
| `create_task`            | Create background task                 | `duration?`, `payload?`                  |
| `get_task`               | Get task status                        | `taskId`                                 |
| `get_task_result`        | Get task result                        | `taskId`                                 |
| `slack_list_channels`    | Slack channels (plugin)                | —                                        |
| `slack_post_message`     | Slack post (plugin)                    | `channel`, `text`                        |
| `slack_search`           | Slack search (plugin)                  | `query`, `count?`                        |
| `notion_search`          | Notion search (plugin)                 | `query`, `page_size?`                    |
| `notion_get_page`        | Notion page (plugin)                   | `page_id`                                |
| `notion_create_page`     | Notion create (plugin)                 | `title`, `content?`                      |
| `linear_list_issues`     | Linear issues (plugin)                 | `team?`, `limit?`                        |
| `linear_create_issue`    | Linear create (plugin)                 | `title`, `description?`, `team?`         |
| `linear_get_issue`       | Linear issue (plugin)                  | `id`                                     |

## 📦 Resources (6)

- `config://server-info` — server metadata (JSON, now includes `features`)
- `greeting://{name}` — dynamic greeting template
- `file:///{+path}` — sandboxed file (`ALLOWED_ROOT`), list + complete, `file:///notes.txt`
- `memory://{key}` — memory KV, list + complete
- `db://{table}/{id}` — demo DB row (users/notes), list + complete
- `docs://{id}` — RAG chunk (ingested via `rag_ingest`), list + complete

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

```bash
# Single container
docker build -t mcp-server-base .
docker run -p 3000:3000 --env TRANSPORT=http mcp-server-base

# Full stack (app + redis + postgres + qdrant) — see docker-compose.yml
docker compose up -d
docker compose logs -f app
# → http://localhost:3000/health, http://localhost:3000/mcp
# → redis :6379, postgres :5432, qdrant :6333
```

### RAG Demo (ingest → search → docs://)

```bash
# via MCP tools (Inspector or Client)
# 1. ingest
rag_ingest { "text": "MCP is Model Context Protocol...", "id": "mcp-intro" }
# 2. search
rag_search { "query": "what is MCP?", "topK": 3 }
# 3. read resource
# docs://mcp-intro  → returns ingested text
```

---

## 📁 Structure

```
src/
├── index.ts              # entry: stdio + http (helmet/cors/rateLimit/auth/RBAC/OTEL/metrics)
├── server.ts             # createMcpServer() factory (v2.1.0, instructions)
├── config.ts             # zod env (AUTH, CORS, rateLimit, RAG, cache, integrations, OTEL, admin, tasks)
├── types.ts              # Zod schemas
├── middleware/auth.ts    # AUTH_MODE none|apiKey|bearer
├── middleware/rateLimit.ts
├── middleware/requestId.ts
├── middleware/rbac.ts    # RBAC reader/writer/admin + mcpRbacMiddleware (v2.1)
├── observability/otel-real.ts # OTEL NodeSDK init (v2.1)
├── observability/slo.ts  # checkSlo() for /health/ready (v2.1)
├── utils/logger.ts       # stderr, JSON/text, redaction, child(requestId)
├── utils/eventStore.ts   # InMemoryEventStore
├── utils/redisEventStore.ts # RedisEventStore (scale)
├── utils/cache.ts        # MemoryCache (TTL) + defaultCache
├── utils/queue.ts        # SimpleQueue
├── utils/metrics.ts      # prom-client Registry (v2.1)
├── utils/persistence.ts  # save/load backup (v2.1)
├── utils/otel.ts         # stub OTEL spans/metrics
├── tools/                # 40 tools: echo, fs, memory, db, shell, rag (hybrid), web, github, elicitation, sampling, tasks
│   ├── filesystem.tool.ts, memory.tool.ts, database.tool.ts, shell.tool.ts
│   ├── rag.tool.ts, web.tool.ts, github.tool.ts, elicitation.tool.ts, sampling.tool.ts, tasks.tool.ts
├── plugin/index.ts       # Plugin SDK: definePlugin/registerPlugin (v2.2)
├── integrations/         # slack/notion/linear plugins (v2.2)
├── middleware/tenant.ts  # Multi-tenant X-Tenant-Id + scoped stores (v3.0)
├── routes/controlplane.ts# Tenants CRUD + key rotation (v3.0)
├── utils/cluster.ts      # Cluster mode horizontal scale (v3.0)
├── resources/            # 6 resources: config, greeting, file, memory, db, docs
├── routes/admin.ts       # Admin UI + metrics/spans/stores (v2.0) + /metrics Prometheus (v2.1)
└── prompts/              # 4 prompts: code-review, explain-concept, summarize, research
```

Add a new tool: create `src/tools/my.tool.ts` → export `registerMyTool(server)` → add to `src/tools/index.ts`.

---

## 🔐 Security (Phase 2)

- **Helmet** headers (`x-dns-prefetch-control`, `x-frame-options`, `x-content-type-options`, etc.) via `helmet@7` (`src/index.ts:1`)
- **CORS allowlist** (`CORS_ORIGIN=*` or comma list) with `cors` credentials handling (`src/config.ts:60`)
- **Auth** `AUTH_MODE=none|apiKey|bearer` at `src/middleware/auth.ts:1` — `401` without valid `X-API-Key` or `Authorization: Bearer` (health/ready & OPTIONS excluded)
- **Rate limiting** `express-rate-limit` (default 100/15min) on `/mcp` — `429 Too Many Requests` (`src/middleware/rateLimit.ts:1`)
- **RequestId** (`X-Request-Id` randomUUID, echo header, child logger correlation) (`src/middleware/requestId.ts:1`)
- **Zod env validation** (`src/config.ts:1`) — `parseEnv()` validates `PORT`, `AUTH_MODE`, `API_KEY` cross-field, fails fast on invalid env
- **Structured logger** JSON/text, `[REDACTED]` for `authorization`, `apiKey`, `token` (`src/utils/logger.ts:24`)
- **Resumability** `InMemoryEventStore` (`src/utils/eventStore.ts:1`) + stateful session map when `RESUMABILITY_ENABLED=true` (replay via `Last-Event-ID`, `GET /mcp` stream, `DELETE` close)
- **Docker hardening** non-root `appuser` + `HEALTHCHECK` (`Dockerfile:1`)
- Tests: `tests/unit/auth.test.ts`, `tests/unit/logger.test.ts`, `tests/unit/eventStore.test.ts`, `tests/e2e/security.test.ts` (helmet/auth/rateLimit/resumability) — `67 tests → 130 total with Phase 5, 90.89% coverage`

## 🔗 Integrations (Phase 4)

- **Cache** `MemoryCache` TTL (`src/utils/cache.ts:1`) — `defaultCache` for web/github, `SimpleQueue` (`src/utils/queue.ts:1`)
- **RAG** local vector (hash embedding 128-dim, cosine, chunk 500/50) at `src/tools/rag.tool.ts:1` — `rag_ingest` (chunked + `sendResourceListChanged`), `rag_search` (topK, threshold), `rag_list`, `rag_clear` + `docs://{id}` resource
- **Web** `src/tools/web.tool.ts:1` — `brave_search` (mock if no `BRAVE_API_KEY`), `tavily_search` (mock), `web_fetch` (cached via `defaultCache`, `CACHE_TTL_MS`)
- **GitHub** `src/tools/github.tool.ts:1` — `github_search_repos`, `github_get_repo`, `github_get_issue` (cached, `GITHUB_TOKEN` for rate limit)
- **Stack** `docker-compose.yml:1` (app + redis:7 + postgres:16 + qdrant:v1.12.4) with healthchecks
- **Demo** `rag_ingest → rag_search → docs://` E2E verified in `tests/integrations.test.ts:1` (21 tests)

## 🏢 Scale & Enterprise (Phase 5 — v3.0) — NEW

- **Multi-tenant** `src/middleware/tenant.ts:1` — `X-Tenant-Id` header (or `?tenant=`), `tenantMiddleware` rejects `400` when `TENANT_REQUIRED=true` and missing, tenant-scoped memory `getTenantMemory(tid)` (isolated stores), namespaced cache keys `tenant:{id}:key`, registry `createTenant/deleteTenant`
- **SSO OIDC** `src/middleware/auth.ts:1` — `AUTH_MODE=oidc`: Bearer JWT structural validation (3-part, `exp`, `iss` vs `OIDC_ISSUER`, `aud` vs `OIDC_AUDIENCE`), claims attached to `req.oidcClaims`; production swaps in JWKS signature verification
- **Control plane** `src/routes/controlplane.ts:1` — CRUD `/admin/tenants` (`POST/GET/PATCH/DELETE` + 409 dup/400 invalid-id), `POST /admin/tenants/:id/rotate-key`, `GET /admin/tenants/:id/store` isolation inspection; admin-token protected
- **Runtime scale** `src/utils/cluster.ts:1` — `initCluster()` forks `CLUSTER_WORKERS` (default CPU-1), auto-restart on worker exit, `CLUSTER_MODE=true`; stateless + `RedisEventStore` for true horizontal
- **Monitoring stack** `docker-compose.override.yml:1` — Prometheus (`prometheus.yml` scrapes `app:3000/metrics`) at :9090 + Grafana at :3001
- **Tests** `tests/v3_0.test.ts:1` (15 tests: tenant extraction/isolation/required-400, OIDC token validation + issuer/audience + HTTP 401/200, control plane lifecycle 201/409/400/404/rotate-key/store-inspection/disabled-404, cluster no-op, compose services) — total 178

## 🔌 Ecosystem & DX (Phase 5 — v2.2)

- **Plugin SDK** `src/plugin/index.ts:1` — `definePlugin({name, version, register})`, `registerPlugin(server, plugin)` (duplicate-tolerant), `getRegisteredPlugins()`, auto `sendToolListChanged` notifications
- **Integrations** `src/integrations/` — `slackPlugin` (list/post/search), `notionPlugin` (search/get/create), `linearPlugin` (list/create/get) — all mocked without tokens (`SLACK_TOKEN`, `NOTION_TOKEN`); auto-registered in `src/server.ts:1`
- **Registry** `smithery.yaml:1` — Smithery config + MCP Registry name `io.github.ahmedalbanna/mcp-server-base`, `package.json:1` `mcpName`/`files` fields
- **Hybrid RAG** `src/tools/rag.tool.ts:1` — `rag_search` modes `vector|bm25|hybrid` (default hybrid, alpha 0.5), BM25 (k1=1.5, b=0.75) normalized + cosine re-rank; eval set `tests/eval/rag-eval.json` (20 Q/A) with p@5 ≥0.8 verified in `tests/v2_2.test.ts:1`
- **Prompt Playground** `src/routes/admin.ts:1` — `POST /admin/prompts/:name/preview` renders prompts server-side; playground UI in `/admin` dashboard
- **Tests** `tests/v2_2.test.ts:1` (16 tests: Plugin SDK define/register/dup/tools callable, registry files, hybrid modes, eval p@5, playground preview/UI/count) — total 163

## 📈 Scale & Operability (Phase 5 — v2.0)

- **Versioned MCP** `v2.0.0` (`package.json:1`, `config.MCP_SERVER_VERSION`) with instructions per minor (`src/server.ts:1`)
- **OTEL** tracing/metrics (`src/utils/otel.ts:1`) — `createSpan`/`withSpan`, `incrementCounter`/`recordHistogram`, `getMetrics`/`getSpans`, JSON export stub for `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_ENABLED` flag
- **RedisEventStore** (`src/utils/redisEventStore.ts:1`) — `EventStore` impl with `storeEvent`/`replayEventsAfter`, in-memory fallback, `eventStoreFactory.create()` for horizontal scale (`EVENT_STORE_TYPE=memory|redis`, `REDIS_URL`)
- **Admin UI** (`src/routes/admin.ts:1`) — `GET /admin` (HTML dashboard), `/admin/tools|resources|prompts|metrics|spans|stores|health` (JSON), protected via `ADMIN_TOKEN` (`X-Admin-Token`), `ADMIN_ENABLED` flag
- **Tasks** (`src/tools/tasks.tool.ts:1`) — experimental `delay_task` (if SDK tasks available) + fallback `create_task`/`get_task`/`get_task_result` (in-memory, polling), `SimpleQueue`/`MemoryCache` infra
- **Bench** `k6/load.js:1` — `http_req_duration p(95)<100ms`, `stages` 10→50 VUs, `checks >99%`, `npm run bench` / `bench:local`
- **Compose** `docker-compose.yml:1` already includes redis/postgres/qdrant for scale
- Tests: `tests/scale.test.ts:1` (OTEL spans/metrics, RedisEventStore replay, cache TTL, queue, admin HTML/metrics/token/ready, tasks create/poll, version, k6 script) — 130 total (now 147 with v2.1)
- **Deploy** ready for Fly.io/Cloud Run (stateless + RedisEventStore), GHCR via `release.yml`, npm `2.0.0`

## 🔒 Hardening & Observability (Phase 5 — v2.1) — NEW

- **OTEL Real** `src/observability/otel-real.ts:1` — `initOtel()` dynamic import of `@opentelemetry/sdk-node` + `OTLPTraceExporter` (console fallback), `OTEL_ENABLED` + `OTEL_EXPORTER_OTLP_ENDPOINT`, graceful `shutdown` on SIGTERM
- **SLOs** `src/observability/slo.ts:1` — `checkSlo()` (memory/rag/cache/uptime, `latencyMs`), `GET /health` → `{status, checks, uptime, version, otel, eventStore}` + `GET /ready` → `503` if not `ok`, `GET /metrics` → Prometheus `text/plain` via `prom-client` (`mcp_http_requests_total`, `mcp_http_request_duration_ms`, `mcp_sessions_active`)
- **RBAC** `src/middleware/rbac.ts:1` — `reader < writer < admin` (`X-Role` header, JWT stub), `TOOL_ROLES` map (31 tools), `mcpRbacMiddleware` inspects `tools/call` body → `403` if `reader` tries `write_file`/`shell_execute`, `GET /admin` → `admin` required
- **Backup** `src/utils/persistence.ts:1` — `saveBackup()`/`loadBackup()`/`scheduleSave()` (500ms debounce) to `ALLOWED_ROOT/.backup.json` (dynamic `getBackupFile()`), logs Redis sync stub when `REDIS_URL` set, `loadBackup()` at startup in `src/index.ts:1`
- **Metrics** `src/utils/metrics.ts:1` — `prom-client` `Registry` + `collectDefaultMetrics`, `httpRequestsTotal`/`httpRequestDuration`/`mcpToolCallsTotal`/`mcpSessionsActive`, `GET /metrics` handler
- **Tests** `tests/v2_1.test.ts:1` (13 tests: SLO checks, RBAC `hasRole`/`X-Role` 403/200, `SLO health/metrics` 200 + Prometheus text, OTEL span, backup save/load + `scheduleSave` via `memory_set`, `initOtel` disabled/enabled) + `tests/unit/rbac.test.ts:1` (4 tests) — total 147

- Logger stderr-safe, never logs secrets (redaction)
- Zod → JSON Schema via SDK (`src/types.ts:1`, `src/tools/*.tool.ts`)
- Timeout on fetch (10s) + structured errors
- Graceful shutdown (`SIGINT/SIGTERM`)
- Health (`GET /health`) & ready (`GET /ready`) separate from MCP
- Stateless default (`sessionIdGenerator: undefined`), stateful when `RESUMABILITY_ENABLED=true` (`src/index.ts:22`)
- Type-safe, strict TS + ESLint flat + Prettier + husky + lint-staged
- Coverage 85% lines / 70% branches enforced (`vitest.config.ts:1`), 178 tests: unit + e2e HTTP/security/capabilities/integrations/scale/v2.1/v2.2/v3.0

## 📚 Docs

Full documentation in [`docs/`](docs/):

- [Architecture](docs/architecture.md) — diagram, module map, request lifecycle
- [Configuration](docs/configuration.md) — every env var + validation rules
- [API Reference](docs/api-reference.md) — tools/resources/prompts/endpoints
- [Security](docs/security.md) — auth, RBAC, OIDC, tenancy, hardening checklist
- [Plugins](docs/plugins.md) — Plugin SDK guide + registry distribution
- [Deployment](docs/deployment.md) — Docker, cluster/multi-replica scale, monitoring, k6
- [Testing](docs/testing.md) — suite map, patterns, CI

## 🤝 Contributing

See `CONTRIBUTING.md` — `nvm use`, `npm test`, add tool/resource/prompt, ensure `lint`/`typecheck`/`test` pass. See `CODE_OF_CONDUCT.md`.

---

## 📚 MCP Docs

- Spec: https://spec.modelcontextprotocol.io
- SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Inspector: https://github.com/modelcontextprotocol/inspector
