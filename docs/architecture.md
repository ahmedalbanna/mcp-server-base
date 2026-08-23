# Architecture

> mcp-server-base v3.0 — Scale & Enterprise

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Clients                             │
│   Claude Desktop (stdio) │ Inspector │ HTTP clients │ k6        │
└──────────────┬──────────────────────────┬───────────────────────┘
               │ STDIO                    │ Streamable HTTP (/mcp)
┌──────────────▼──────────────────────────▼───────────────────────┐
│                      Transport Layer (src/index.ts)             │
│  helmet → cors → requestId → json → otel-span → rateLimit       │
│  → auth (none|apiKey|bearer|oidc) → rbac → tenant               │
├─────────────────────────────────────────────────────────────────┤
│  Stateful mode: session map + RedisEventStore (Last-Event-ID)   │
│  Stateless mode: per-request transport (default)                │
├─────────────────────────────────────────────────────────────────┤
│                    McpServer (src/server.ts)                    │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ 40 Tools  │ │6 Resources│ │4 Prompts │ │ Plugin SDK       │  │
│  │ src/tools/│ │src/resources│ │src/prompts│ │ slack/notion/linear│
│  └───────────┘ └───────────┘ └──────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                     Cross-cutting services                      │
│  logger (stderr, redaction) │ otel spans/metrics │ prom-client  │
│  MemoryCache │ SimpleQueue │ persistence (.backup.json)         │
├─────────────────────────────────────────────────────────────────┤
│              HTTP surfaces (non-MCP)                            │
│  /health /ready /metrics /admin (+playground) /admin/tenants    │
└─────────────────────────────────────────────────────────────────┘
```

## Module map

| Path                              | Responsibility                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `src/index.ts`                    | Entry: stdio + HTTP app factory, middleware chain, transports, cluster boot             |
| `src/server.ts`                   | `createMcpServer()` — registers tools/resources/prompts/plugins, versioned instructions |
| `src/config.ts`                   | Zod-validated env (`parseEnv`), fails fast on invalid config                            |
| `src/middleware/auth.ts`          | `none \| apiKey \| bearer \| oidc` auth; OIDC JWT structural validation                 |
| `src/middleware/rbac.ts`          | Roles `reader < writer < admin`; per-tool role map; inspects `tools/call` body          |
| `src/middleware/tenant.ts`        | Multi-tenant: `X-Tenant-Id`, scoped memory stores, tenant registry                      |
| `src/middleware/rateLimit.ts`     | express-rate-limit on `/mcp` (skips health)                                             |
| `src/routes/admin.ts`             | `/admin` dashboard + JSON introspection + prompt playground                             |
| `src/routes/controlplane.ts`      | Tenants CRUD + key rotation                                                             |
| `src/tools/*`                     | One file per domain; each exports `registerXTools(server)`                              |
| `src/resources/index.ts`          | Static + template resources with list/complete callbacks                                |
| `src/plugin/index.ts`             | Plugin SDK (`definePlugin`/`registerPlugin`)                                            |
| `src/integrations/*`              | Example plugins (slack/notion/linear, mocked without tokens)                            |
| `src/utils/logger.ts`             | stderr-only logger (JSON/text), secret redaction, child(requestId)                      |
| `src/utils/otel.ts`               | Lightweight span/metrics registry (always on, exports when enabled)                     |
| `src/observability/otel-real.ts`  | Real OpenTelemetry SDK bootstrap (OTLP exporter)                                        |
| `src/utils/metrics.ts`            | prom-client registry + collectors for `/metrics`                                        |
| `src/utils/eventStore.ts`         | InMemoryEventStore (resumability)                                                       |
| `src/utils/redisEventStore.ts`    | Redis-compatible EventStore + factory                                                   |
| `src/utils/cache.ts` / `queue.ts` | TTL cache + FIFO queue primitives                                                       |
| `src/utils/persistence.ts`        | Debounced backup of memory+RAG to `.backup.json`                                        |
| `src/utils/cluster.ts`            | node:cluster fork/restart wrapper                                                       |

## Request lifecycle (HTTP)

1. **helmet/cors/requestId** — security headers, origin allowlist, `X-Request-Id`
2. **otel span open** — `http.{method} {path}` span + Prometheus counters
3. **rate limit** — sliding window per IP on `/mcp`; `429` when exceeded
4. **auth** — mode-specific credential check; `401` on failure; health/ready/OPTIONS bypass
5. **RBAC** — for `tools/call`, required role resolved from tool map; `403` if insufficient
6. **tenant** — resolve `X-Tenant-Id`; `400` if `TENANT_REQUIRED=true` and missing
7. **transport** — stateless (new transport per request) or stateful (session reuse + event store)
8. **span close** — duration recorded to OTEL registry and Prometheus histogram

## Design decisions

- **stderr logging**: stdout belongs to the stdio transport; logs must never corrupt it.
- **Stateless default**: simplest horizontal scaling path; opt into sessions via `RESUMABILITY_ENABLED`.
- **Stub-first integrations**: every external dependency (Slack, Notion, Linear, Brave, Tavily, Redis, Qdrant) has a mock fallback so the server runs with zero configuration.
- **Zod everywhere**: env vars, tool inputs, and prompt args share one validation stack; tool input schemas become JSON Schema automatically via the SDK.
- **Plugin isolation**: plugins register through the same SDK surface as built-ins; duplicate registration is tolerated, not fatal.

See also: [configuration.md](configuration.md) · [api-reference.md](api-reference.md) · [deployment.md](deployment.md) · [security.md](security.md) · [plugins.md](plugins.md)
