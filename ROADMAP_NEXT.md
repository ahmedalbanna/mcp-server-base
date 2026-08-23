# ROADMAP NEXT — v2.0 → v3.0

> Base: `v2.0.0` `3299f3e` — 31 tools / 6 resources / 4 prompts / 130 tests / 90.89% lines
> Repo: https://github.com/ahmedalbanna/mcp-server-base | Next: v2.1 → v2.2 → v3.0

## Overview

```
v2.0 (now) ──► v2.1 Hardening (2-3w) ──► v2.2 Ecosystem (3-4w) ──► v3.0 Enterprise (6-8w)
  Scale &        SLOs + OTEL-real +      Plugin SDK +           Multi-tenant +
  Operability    RBAC + Backup           Registry + Eval         SSO + Control Plane
```

---

## v2.1 — Hardening & Observability — `2.1.0` (2-3w) — **NEXT**

**Goal:** 99.9% uptime, real OTEL, security hardening.

| Area          | Tasks                                                                                                                                                                                        | Files                                                            | Success Criteria                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **OTEL real** | Replace `src/utils/otel.ts:1` stub with `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http` + `@opentelemetry/sdk-metrics`                                                 | `src/utils/otel.ts`, `src/index.ts:72` (span), `k6/load.js:1`    | `OTEL_ENABLED=true` → traces to `OTEL_EXPORTER_OTLP_ENDPOINT` (e.g. `http://otel-collector:4318`), metrics `http_duration` p95 visible |
| **SLOs**      | `GET /health` → checks DB/Redis/qdrant; `GET /ready` → dependency probes; `src/routes/admin.ts:1` → `/admin/metrics` → Prometheus `/metrics`                                                 | `src/routes/admin.ts`, `src/index.ts:58`, `docker-compose.yml:1` | `k6` nightly passes `p95<100ms`, `health` 99.9%                                                                                        |
| **Security**  | `npm audit fix` (alasql 6 high → replace with `sql.js` or pin), `helmet` CSP, `src/middleware/auth.ts:1` → RBAC (roles `reader/writer/admin` via JWT claim), `ADMIN_TOKEN` → JWT + audit log | `src/middleware/rbac.ts` (new), `src/middleware/auth.ts`         | `auth` rejects `reader` write, `audit.log` contains admin actions                                                                      |
| **Backup**    | `getVectorStore()` → Redis persistence when `REDIS_URL` set; `RedisEventStore` e2e test with real Redis (`docker-compose.yml:1` `redis:7`)                                                   | `src/tools/rag.tool.ts:1`, `src/utils/redisEventStore.ts:1`      | `rag_ingest` survives restart when `REDIS_URL` set                                                                                     |
| **CI**        | `.github/workflows/nightly-k6.yml` (cron) + `.github/workflows/ci.yml:1` already                                                                                                             | `.github/workflows/nightly-k6.yml` (new)                         | Nightly k6 passes                                                                                                                      |

**Starter code in this commit:** `src/observability/`, `src/middleware/rbac.ts` stub, `docker-compose.override.yml` otel-collector, `.github/workflows/nightly-k6.yml` skeleton.

---

## v2.2 — Ecosystem & DX — `2.2.0` (3-4w)

**Goal:** Distribution via registry + plugin DX.

| Area           | Tasks                                                                                                                             | Success Criteria                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Plugin SDK** | `src/tools/index.ts:1` → `export function registerPlugin(server, plugin)` + `src/integrations/` (slack, notion, linear templates) | `npm i mcp-server-base` + `import { slackPlugin } from 'mcp-server-base/integrations/slack'` works |
| **Registry**   | Publish to `registry.modelcontextprotocol.io` + Smithery, `README.md:1` install badge, `package.json:1` `bin` + `files`           | `npx mcp-server-base --help` works, registry shows `v2.2.0`                                        |
| **Eval**       | `tests/integrations.test.ts:1` → RAG hybrid (BM25 + vector) + re-rank, eval set `tests/eval/rag-eval.json` (20 Q/A), metric `p@5` | `rag_search` p@5 >0.8 on eval set                                                                  |
| **DX**         | `src/prompts/index.ts:1` → `prompt` playground at `/admin/prompts` (live preview)                                                 | Admin can test prompts without client                                                              |

---

## v3.0 — Scale & Enterprise — `3.0.0` (6-8w)

**Goal:** Multi-tenant SaaS.

| Area              | Tasks                                                                                                                                                              | Success Criteria                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| **Multi-tenant**  | `src/config.ts:1` → `TENANT_ID` header, `src/utils/cache.ts:1` → namespaced `tenant:${id}:` Redis, `src/resources/index.ts:1` → tenant-scoped `file://`, `docs://` | `X-Tenant-Id: acme` isolates `memory://`/`docs://`               |
| **SSO**           | `src/middleware/auth.ts:1` → `bearer` → `requireBearerAuth` + `mcpAuthMetadataRouter` (SDK), OIDC discovery, `GITHUB_TOKEN` → `ADMIN_TOKEN` rotation               | Login via OAuth2 OIDC, `/.well-known/mcp` exposes metadata       |
| **Control plane** | `/admin` → CRUD orgs/users/keys (backed by `postgres:16` in `docker-compose.yml:1`), `GET /admin/metrics` → `GET /metrics` Prometheus + Grafana dashboard          | Grafana shows `http_req_duration` by tenant                      |
| **Runtime**       | `src/index.ts:1` → `node:cluster` or `worker_threads` + `EVENT_STORE_TYPE=redis` for stateless `app × N` horizontal                                                | `docker compose up --scale app=3` passes k6 with no session loss |
| **Runtime**       | `Dockerfile:1` → `distroless` + `Dockerfile` multi-stage cache, `k6/load.js:1` `p95<50ms` after scale                                                              | Image <100MB, p95 halved                                         |

---

## Milestones (GitHub)

- **v2.1 Hardening & Observability** — due +3w — issues: OTEL-real, SLOs, RBAC, Backup, Nightly k6
- **v2.2 Ecosystem & DX** — due +7w — issues: Plugin SDK, Registry, Eval, Prompt playground
- **v3.0 Scale & Enterprise** — due +15w — issues: Multi-tenant, SSO, Control plane, Runtime scale

## Starter Code (this commit)

- `src/observability/otel-real.ts` — real OTEL SDK wrapper (feature-flagged, falls back to stub)
- `src/middleware/rbac.ts` — RBAC stub (`reader/writer/admin`)
- `src/observability/slo.ts` — SLO checks for `/health`/`/ready`
- `.github/workflows/nightly-k6.yml` — nightly k6 skeleton
- `docker-compose.override.yml` — otel-collector stub (for v2.1)
- `tests/unit/rbac.test.ts` — skeleton

## How to continue

```bash
# Pick v2.1 next (recommended)
git checkout -b feat/v2.1-otel-real
# Enable real OTEL locally
OTEL_ENABLED=true OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces npm run dev:http
# Run k6 nightly locally
npm run bench:local
```

## References

- Roadmap v1.0-v2.0: `ROADMAP.md:1`
- Current: `README.md:1`, `src/index.ts:1`, `src/config.ts:1`, `k6/load.js:1`
- Docs: https://spec.modelcontextprotocol.io, https://opentelemetry.io, https://k6.io
