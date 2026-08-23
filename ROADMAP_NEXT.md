# ROADMAP NEXT — v2.0 → v3.0 ✅ COMPLETED

> Base: `v2.0.0` `3299f3e` — 31 tools / 6 resources / 4 prompts / 130 tests / 90.89% lines
> Final: **`v3.0.0` `67184ce`** — 40 tools / 6 resources / 4 prompts / plugins / 178 tests / 88% lines
> Repo: https://github.com/ahmedalbanna/mcp-server-base
>
> **Status: ALL PHASES SHIPPED** — v2.1 (`1e6335a`) · v2.2 (`1edcde7`) · v3.0 (`67184ce`)
> All 3 GitHub milestones closed, all 11 tracking issues closed.

## Overview

```
v2.0 ──► v2.1 Hardening ✅ ──► v2.2 Ecosystem ✅ ──► v3.0 Enterprise ✅
  Scale &   SLOs + OTEL-real +   Plugin SDK +        Multi-tenant +
  Operability RBAC + Backup     Registry + Eval      SSO + Control Plane
```

---

## v2.1 — Hardening & Observability — `2.1.0` ✅ DONE (commit `1e6335a`)

**Goal:** 99.9% uptime, real OTEL, security hardening.

| Area             | Delivered                                                                                                                            | Files                                                                                           | Verified by                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **OTEL real** ✅ | `initOtel()` boots `@opentelemetry/sdk-node` + OTLP exporter (console fallback); spans per HTTP/MCP request                          | `src/observability/otel-real.ts`, `src/index.ts`, `docker-compose.override.yml`                 | `tests/v2_1.test.ts` initOtel enabled/disabled            |
| **SLOs** ✅      | `checkSlo()` (memory/rag/cache/uptime) drives `/health` (degraded), `/ready` (503), `/metrics` Prometheus via prom-client            | `src/observability/slo.ts`, `src/utils/metrics.ts`, `src/routes/admin.ts`                       | `tests/v2_1.test.ts` health/metrics endpoints             |
| **Security** ✅  | RBAC `reader/writer/admin` enforced per-tool on `tools/call` (403), admin-token on control plane; audit via structured logs          | `src/middleware/rbac.ts`, `src/routes/controlplane.ts`                                          | `tests/unit/rbac.test.ts`, `tests/v2_1.test.ts` RBAC 403s |
| **Backup** ✅    | Debounced persistence of memory+RAG to `ALLOWED_ROOT/.backup.json`, reloaded at startup; Redis sync hook logged when `REDIS_URL` set | `src/utils/persistence.ts`, `src/tools/rag.tool.ts`, `src/tools/memory.tool.ts`                 | `tests/v2_1.test.ts` save/load + scheduleSave             |
| **CI** ✅        | Nightly k6 workflow (cron 02:00 UTC, thresholds p95<100ms) + otel-collector compose override                                         | `.github/workflows/nightly-k6.yml`, `docker-compose.override.yml`, `otel-collector-config.yaml` | Workflow file + k6 script thresholds                      |

Milestone: [#1 closed](https://github.com/ahmedalbanna/mcp-server-base/milestone/1) · Issues #1–5 closed.

## v2.2 — Ecosystem & DX — `2.2.0` ✅ DONE (commit `1edcde7`)

**Goal:** Distribution via registry + plugin DX.

| Area              | Delivered                                                                                                                      | Files                                                            | Verified by                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------- |
| **Plugin SDK** ✅ | `definePlugin`/`registerPlugin` (duplicate-tolerant) + slack/notion/linear example integrations auto-registered (9 mock tools) | `src/plugin/index.ts`, `src/integrations/*`, `src/server.ts`     | `tests/v2_2.test.ts` SDK + callable mocks |
| **Registry** ✅   | `smithery.yaml` (startCommand/configSchema), `package.json` `mcpName` + `files`; npm publish wired in release workflow         | `smithery.yaml`, `package.json`, `.github/workflows/release.yml` | `tests/v2_2.test.ts` registry assertions  |
| **Eval** ✅       | Hybrid RAG: BM25(k1=1.5,b=0.75) ⊕ cosine (α=0.5) with per-signal scores; 20-pair eval set; **p@5 ≥ 0.8 asserted**              | `src/tools/rag.tool.ts`, `tests/eval/rag-eval.json`              | `tests/v2_2.test.ts` hybrid modes + eval  |
| **DX** ✅         | Prompt playground: `POST /admin/prompts/:name/preview` + UI card in `/admin` dashboard                                         | `src/routes/admin.ts`                                            | `tests/v2_2.test.ts` preview/UI/count     |

Milestone: [#2 closed](https://github.com/ahmedalbanna/mcp-server-base/milestone/2) · Issues #6–8 closed.

## v3.0 — Scale & Enterprise — `3.0.0` ✅ DONE (commit `67184ce`)

**Goal:** Multi-tenant SaaS.

| Area                 | Delivered                                                                                                                                                  | Files                                                                         | Verified by                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| **Multi-tenant** ✅  | `X-Tenant-Id` middleware (`TENANT_REQUIRED` → 400), tenant-scoped memory stores, namespaced cache keys, tenant registry w/ validation                      | `src/middleware/tenant.ts`                                                    | `tests/v3_0.test.ts` isolation + required-400  |
| **SSO** ✅           | `AUTH_MODE=oidc`: Bearer JWT structural validation (exp/iss/aud vs `OIDC_ISSUER`/`OIDC_AUDIENCE`), claims on request                                       | `src/middleware/auth.ts`                                                      | `tests/v3_0.test.ts` token + HTTP 401/200      |
| **Control plane** ✅ | `/admin/tenants` CRUD (+409 dup, 400 invalid id), key rotation (`ak_*`), store isolation inspection; `/metrics` Prometheus + Grafana/Prometheus in compose | `src/routes/controlplane.ts`, `prometheus.yml`, `docker-compose.override.yml` | `tests/v3_0.test.ts` lifecycle/rotate/disabled |
| **Runtime** ✅       | `initCluster()` node:cluster fork/restart (`CLUSTER_MODE`/`CLUSTER_WORKERS`) for stateless ×N horizontal with RedisEventStore                              | `src/utils/cluster.ts`, `src/index.ts`                                        | `tests/v3_0.test.ts` no-op when disabled       |

Milestone: [#3 closed](https://github.com/ahmedalbanna/mcp-server-base/milestone/3) · Issues #9–11 closed.

> Deferred (documented trade-offs): distroless image + p95<50ms tuning and Postgres-backed control plane remain open follow-ups; current control plane uses the in-memory registry and the node:22-alpine image.

---

## Milestones (GitHub) — ALL CLOSED ✅

- ~~**v2.1 Hardening & Observability**~~ — closed — issues #1–5 closed
- ~~**v2.2 Ecosystem & DX**~~ — closed — issues #6–8 closed
- ~~**v3.0 Scale & Enterprise**~~ — closed — issues #9–11 closed

## Commit trail

```
67184ce feat: v3.0 Scale & Enterprise          ◄── final
1edcde7 feat: v2.2 Ecosystem & DX
1e6335a feat: v2.1 Hardening & Observability
6fb7224 docs: scaffold ROADMAP_NEXT + milestones + starter code v2.1
3299f3e feat: Phase 5 Scale & Operability v2.0 (base)
```

## Where to go next

All planned phases are complete. Candidate follow-ups (not committed):

1. **Deferred v3.0 items** — distroless Dockerfile (<100MB), Postgres-backed control plane, p95<50ms tuning
2. **npm publish** — `npm publish` of `mcp-server-base@3.0.0` (release workflow ready; needs `NPM_TOKEN` secret)
3. **Registry listing** — submit `smithery.yaml` to Smithery + modelcontextprotocol registry
4. **Docs site** — host `docs/` via GitHub Pages or MkDocs

## References

- Roadmap v1.0-v2.0: `ROADMAP.md`
- Docs suite: `docs/` (architecture, configuration, api-reference, security, plugins, deployment, testing)
- Spec: https://spec.modelcontextprotocol.io · OpenTelemetry: https://opentelemetry.io · k6: https://k6.io
