# ROADMAP — mcp-server-base

> Strong base MCP Server (2026) — `ahmedalbanna/mcp-server-base`
> SDK: `@modelcontextprotocol/sdk@1.12.1` | Spec: 2025-03 (Streamable HTTP) | Runtime: Node 22 + TypeScript 5.7 ESM

## Vision
Production-ready, modular MCP server template that works as:
1. **Local STDIO** server for Claude Desktop / Cursor / opencode
2. **Remote Streamable HTTP** server for cloud, Docker, and multi-client
3. **Extensible base** for domain servers (RAG, DB, filesystem, browser, SaaS integrations)

Principles: spec-compliant, stdio-safe, type-safe (Zod), observable, secure by default.

---

## Current State — v1.0.0 (2026-08-23) ✅

**Tag:** `062851f` on `main` | **Repo:** https://github.com/ahmedalbanna/mcp-server-base

| Area | Status |
|------|--------|
| Transports | `StdioServerTransport` + `StreamableHTTPServerTransport` (dual, `src/index.ts:1`) |
| Server factory | `createMcpServer()` at `src/server.ts:1` |
| Tools (4) | `echo`, `calculator`, `get_time`, `fetch_url` — Zod validation, `src/tools/` |
| Resources (2) | `config://server-info`, `greeting://{name}` via `ResourceTemplate` (`src/resources/index.ts:4`) |
| Prompts (2) | `code-review`, `explain-concept` (`src/prompts/index.ts:1`) |
| HTTP | Express 4, CORS, `/health`, `/mcp` POST/GET/DELETE, sessionId `randomUUID()` |
| DX | `tsx watch`, `tsc` build, `vitest` 5 tests (InMemoryTransport), `Dockerfile` node:22-alpine |
| Safety | stderr logger, fetch 10s timeout, SIGINT/SIGTERM graceful shutdown |

---

## Roadmap Overview

```
v1.0.0 (now) ──► v1.1 Hardening ──► v1.2 Security ──► v1.3 Capabilities ──► v1.4 Integrations ──► v2.0 Scale
  STDIO+HTTP       CI/QA               Auth           Core Tools          External Services     Multi-tenant/Prod
```

## Phase 1 — Hardening & DX — v1.1 (next, 1-2 weeks)

**Goal:** CI, quality gates, dev ergonomics.

- [ ] `.github/workflows/ci.yml`: `typecheck`, `lint`, `test`, `build` on PR + `main`
- [ ] ESLint 9 + Prettier + `eslint-config-prettier`, `lint-staged` + `husky` pre-commit
- [ ] `vitest` coverage threshold 80% + `tests/e2e/http.test.ts` for Streamable HTTP
- [ ] `.nvmrc` (22), `LICENSE` MIT, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
- [ ] Badges in `README.md:1`, GitHub topics, `package.json:1` `publishConfig`
- [ ] `tsup` or `tsc` incremental build, `npm run inspect` docs
- **Exit criteria:** PRs blocked without green CI; `npm run typecheck && npm test` passes locally and in CI.

## Phase 2 — Security & HTTP Production — v1.2 (2-3 weeks)

**Goal:** Secure remote deployment.

- [ ] `src/middleware/auth.ts`: `requireBearerAuth` (SDK) + API-key middleware, `AUTH_MODE=none|apiKey|oauth`
- [ ] `helmet`, `cors` allowlist, rate-limit (`express-rate-limit`), zod input sanitization
- [ ] `src/config.ts:1` — `dotenv` + `zod` env validation, secrets never logged
- [ ] Session store: `InMemoryEventStore` for resumability (`Last-Event-ID`) in `src/index.ts:1`
- [ ] Structured JSON logging (pino) -> stderr, `LOG_LEVEL`, request correlation IDs
- [ ] `Dockerfile:1` hardening: non-root user, healthcheck already present, multi-stage cache
- **Exit criteria:** `curl /mcp` without token → 401; resumable stream replay works; no secrets in logs.

## Phase 3 — Core Capabilities — v1.3 (3-5 weeks)

**Goal:** Reference implementations for most common MCP patterns.

**Tools:**
- [ ] `filesystem` — `list_files`, `read_file`, `write_file`, `search` (sandboxed to `ALLOWED_ROOT`)
- [ ] `shell` (optional, disabled by default) — allowlist commands
- [ ] `database` — `query` via `sqlite` (better-sqlite3) / `pg`, prepared statements
- [ ] `memory` — in-memory key/value + `notifications/tools/list_changed` demo

**Resources:**
- [ ] `file://` + `db://` `ResourceTemplate` with `list` + `complete` callbacks
- [ ] `notifications/resources/list_changed` on file watch

**Prompts & Sampling:**
- [ ] `summarize`, `research` prompts with `argsSchema` at `src/prompts/index.ts:1`
- [ ] Elicitation example (`extra.sendRequest('elicitation/create')`) + `sampling/createMessage` passthrough

**Exit criteria:** All tools covered by `vitest` + inspector manual test; filesystem sandboxed; DB queries parameterized.

## Phase 4 — Integrations — v1.4 (5-8 weeks)

Pick 2-3 based on domain. Template branches:

**A. RAG / Knowledge:**
- [ ] `src/tools/rag.tool.ts` — `ingest`, `search` via `pgvector` / `qdrant` / `sqlite-vec`
- [ ] `src/resources/docs://` — chunked resource provider
- [ ] Embedding adapter (`openai`, `cohere`)

**B. Web / SaaS:**
- [ ] `brave_search`, `tavily_search`, `fetch` with caching (Redis)
- [ ] `github`, `slack`, `notion` OAuth tool packs (separate `src/integrations/`)

**C. Browser / Automation:**
- [ ] `playwright` tool: `navigate`, `screenshot`, `act`

**Infra:**
- [ ] `src/utils/cache.ts` (Redis / memory), `src/utils/queue.ts`
- [ ] `docker-compose.yml`: app + redis + postgres + qdrant
- **Exit criteria:** One end-to-end RAG demo: `ingest` → `search` → prompt uses resource.

## Phase 5 — Scale & Operability — v2.0 (8-12 weeks)

- [ ] Stateless horizontal scale: external `EventStore` (Redis) + `sessionIdGenerator` affinity
- [ ] OpenTelemetry traces/metrics (`@opentelemetry/sdk-node`) → OTLP
- [ ] Admin UI: list tools/resources/prompts, live logs at `/admin` (protected)
- [ ] Versioned MCP: `serverInfo.version` semver + `instructions` per minor
- [ ] Task support (SDK experimental `tasks` API): `delay` + `collect-user-info-task` examples
- [ ] Publish to npm (`mcp-server-base`) + GHCR (`ghcr.io/ahmedalbanna/mcp-server-base`)
- [ ] Benchmarks + load tests (`k6`) for Streamable HTTP: p95 < 100ms (tools), SSE reconnect < 1s
- **Exit criteria:** Deploy to Fly.io/Cloud Run, 99.9% healthcheck uptime, published images.

---

## Tech Decisions (ADR)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Transport | Streamable HTTP (2025-03) only, SSE deprecated | Spec requirement; single `/mcp` endpoint |
| Server API | `McpServer` high-level (not low-level `Server`) | Zod auto-schema, simpler `registerTool/Resource/Prompt` |
| TS | `NodeNext` ESM, `ES2022` | Native ESM in SDK 1.12, future-proof |
| HTTP framework | Express 4 (via SDK `createMcpExpressApp` in v2) | Mature, SDK examples use it |
| Validation | `zod@3.23` + `zod-to-json-schema` | Single source of truth |
| Test | `vitest` + `InMemoryTransport` | Fast, no network, matches SDK tests |

## Release Process

1. Conventional commits (`feat:`, `fix:`) on `main`
2. `npm version patch|minor` → tag → `git push --tags`
3. GitHub Release auto-builds Docker → GHCR
4. `CHANGELOG.md` generated via `conventional-changelog`

## Contributing

Add a tool: `src/tools/my.tool.ts` → `export function registerMyTool(server: McpServer)` → register in `src/tools/index.ts:1`. Add test in `tests/server.test.ts:1`. Run `npm run typecheck && npm test`.

## Links

- Spec: https://spec.modelcontextprotocol.io
- TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Inspector: https://github.com/modelcontextprotocol/inspector
- Repo: https://github.com/ahmedalbanna/mcp-server-base

---
*Last updated: 2026-08-23 — Maintainer: Ahmed Al-Banna (@ahmedalbanna)*
