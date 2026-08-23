# Testing & Quality

## Commands

```bash
npm test              # 178 tests, 14 files
npm run test:coverage # thresholds: lines 85%, funcs 85%, stmts 85%, branches 70%
npm run lint          # eslint 9 flat config
npm run typecheck     # tsc --noEmit
npm run build         # dist/
npm run bench:local   # k6 load test (needs k6 + running HTTP server)
```

## Test layout

| File                         | Scope                                                                                              | Count |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ----- |
| `tests/server.test.ts`       | Core tools/resources/prompts via `InMemoryTransport`                                               | 17    |
| `tests/capabilities.test.ts` | Phase 3: filesystem sandbox, memory, DB, shell, resources, prompts, elicitation/sampling fallbacks | 22    |
| `tests/integrations.test.ts` | Phase 4: RAG lifecycle, web cache, GitHub mocks, cache/queue utils, docs://                        | 21    |
| `tests/scale.test.ts`        | OTEL spans/metrics, RedisEventStore, admin, tasks, versioning                                      | 20    |
| `tests/v2_1.test.ts`         | SLO checks, RBAC over HTTP, `/metrics`, backup persistence, initOtel                               | 13    |
| `tests/v2_2.test.ts`         | Plugin SDK, registry files, hybrid RAG modes, eval p@5 ≥ 0.8, playground                           | 16    |
| `tests/v3_0.test.ts`         | Tenants isolation/required, OIDC validation + HTTP, control plane CRUD, cluster no-op              | 15    |
| `tests/e2e/http.test.ts`     | Real Express + `StreamableHTTPClientTransport` round-trips                                         | 8     |
| `tests/e2e/security.test.ts` | Helmet headers, apiKey/bearer 401s, rate-limit 429, stateful 400s                                  | 14    |
| `tests/unit/*.test.ts`       | config zod, logger redaction, event store, RBAC ranks                                              | 32    |

## Patterns

- **In-memory transport** — `InMemoryTransport.createLinkedPair()` connects a Client to a fresh server per test; no sockets.
- **Config mutation** — singleton `config` fields are overridden per-test and restored in `afterEach` (e.g. `(config as any).auth.mode = 'apiKey'`).
- **Fetch mocking** — `vi.stubGlobal('fetch', …)` for web/github tools; always restored.
- **Filesystem isolation** — tests point `ALLOWED_ROOT` at `/tmp/…` and clean up in `afterEach`.
- **Eval-driven RAG** — `tests/eval/rag-eval.json` holds 20 query/expected-doc pairs; `p@5 ≥ 0.8` asserted against the real hybrid search path.

## CI

`.github/workflows/ci.yml` (Node 20+22 matrix): lint → format check → typecheck → coverage-gated tests → build → docker build. `.github/workflows/release.yml` publishes npm + GHCR on tags; `.github/workflows/nightly-k6.yml` runs load tests at 02:00 UTC.

## Manual smoke

```bash
npm run build && npm run start:http &
curl -s localhost:3000/health | jq
curl -s -X POST localhost:3000/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```
