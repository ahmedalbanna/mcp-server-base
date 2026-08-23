# Security

Defense-in-depth across transport, identity, authorization, tenancy, and operations.

## Layers

```
request → helmet → cors → rateLimit → auth → RBAC → tenant → handler
```

### 1. Transport hardening

- **helmet** sets `X-Frame-Options`, `X-Content-Type-Options: nosniff`, HSTS, and disables `X-Powered-By`.
- **CORS allowlist**: `CORS_ORIGIN=*` or an explicit comma list; `credentials` enabled only for allowlists; `mcp-session-id` and `X-Request-Id` exposed.
- **Body limit**: JSON bodies capped at 1 MB.
- **Rate limiting** (`src/middleware/rateLimit.ts`): default 100 req / 15 min per IP on `/mcp`, standard headers, health checks exempt → `429` with JSON-RPC error body.

### 2. Authentication (`AUTH_MODE`)

| Mode     | Credential                      | Validation                                                                                                                                 |
| -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `none`   | —                               | Open (development)                                                                                                                         |
| `apiKey` | `X-API-Key` header              | Exact match to `API_KEY`                                                                                                                   |
| `bearer` | `Authorization: Bearer <token>` | Exact match to `BEARER_TOKEN`/`AUTH_TOKEN`                                                                                                 |
| `oidc`   | `Authorization: Bearer <jwt>`   | Structural JWT validation: 3 segments, `exp` not expired, `iss == OIDC_ISSUER`, `aud == OIDC_AUDIENCE`; claims exposed as `req.oidcClaims` |

Bypasses (all modes): `GET /health`, `GET /ready`, `OPTIONS` preflight.

> **Production OIDC note:** the built-in validator performs claim checks only. Swap in JWKS signature verification (`${issuer}/.well-known/openid-configuration` → `jwks_uri`) or put a gateway (e.g. OAuth2 proxy, API7, Envoy) in front.

### 3. Authorization (RBAC)

Roles: `reader(1) < writer(2) < admin(3)` — resolved from the `X-Role` header (JWT claim in production).

`src/middleware/rbac.ts` maps all 40 tools to the minimum role:

- **reader** (default): read-only tools — echo, calculator, get_time, fetch_url, list/read/search_files, memory_get/list, database_tables, rag_search/list, brave/tavily/web_fetch, github__, get_task_
- **writer**: write_file, memory_set/delete/clear, database_query, rag_ingest/clear, create_task, collect_user_info, generate_with_sampling
- **admin**: shell_execute (+ any admin API)

Insufficient role on `tools/call` → HTTP `403` with `-32001` naming required vs actual role. Non-call methods are unaffected.

### 4. Tenancy

- `X-Tenant-Id` identifies the tenant (`?tenant=` also accepted); `TENANT_REQUIRED=true` makes it mandatory (`400` otherwise).
- Memory stores are isolated per tenant (`getTenantMemory(tid)`); shared cache keys are namespaced `tenant:{id}:{key}`.
- The control plane (`/admin/tenants`) creates tenants with optional per-tenant API keys and rotation (`POST :id/rotate-key`).
- Isolation is verifiable via `GET /admin/tenants/:id/store`.

### 5. Sandbox & least privilege

- Filesystem tools resolve every path against `ALLOWED_ROOT` and reject escapes (`path.resolve` prefix check).
- `shell_execute` is triple-gated: disabled by default (`ALLOW_SHELL`), binary allowlist, admin role.
- SQL tool enforces statement-type allowlist (no `TRUNCATE`/`ATTACH`/…).
- Outbound fetches carry 10s timeouts; response sizes are capped/truncated.

### 6. Secrets & logging

- Logger redacts keys matching `authorization|api_key|apikey|token|bearer|password|secret|x-api-key` and Bearer-looking strings before writing to stderr.
- Redis URLs are masked in logs (`user:***@host`).
- `.env` is gitignored; `.env.example` documents shape without secrets.

### 7. Operations

- Admin/control-plane APIs require `ADMIN_TOKEN` when configured (`X-Admin-Token`); disabling `ADMIN_ENABLED` returns 404.
- Key rotation endpoint issues fresh random keys without restart.
- Docker image runs as non-root `appuser` with a container HEALTHCHECK.
- Graceful SIGINT/SIGTERM shutdown drains the listener.

## Hardening checklist for production

- [ ] `AUTH_MODE=oidc` + real signature verification (or gateway-managed auth)
- [ ] `ADMIN_TOKEN` set; `/metrics` behind network policy or scrape-auth
- [ ] `TENANT_REQUIRED=true` for multi-tenant deployments
- [ ] `ALLOW_SHELL=false` unless strictly needed
- [ ] `CORS_ORIGIN` pinned to known origins
- [ ] `LOG_FORMAT=json` shipped to a log pipeline with retention
- [ ] `RESUMABILITY_ENABLED=true` + `EVENT_STORE_TYPE=redis` + `REDIS_URL` for stateful scale-out
- [ ] TLS terminated at ingress; mTLS between replicas if cross-trust
