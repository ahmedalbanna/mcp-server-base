# Configuration Reference

All configuration is environment-driven and validated by Zod at startup (`src/config.ts`). Invalid config fails fast with a field-level error report.

## Server

| Variable             | Default           | Description                                                                                                |
| -------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`           | `development`     | `development` \| `production` \| `test`. In `test`, auto-start is disabled (imports are side-effect free). |
| `PORT`               | `3000`            | HTTP listen port (1–65535)                                                                                 |
| `HOST`               | `0.0.0.0`         | Bind address                                                                                               |
| `MCP_SERVER_NAME`    | `mcp-server-base` | Server name reported in `initialize`                                                                       |
| `MCP_SERVER_VERSION` | `3.0.0`           | Semver reported to clients                                                                                 |

## Transport & sessions

| Variable               | Default  | Description                                                                                |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `TRANSPORT`            | —        | Set to `http` (or pass `--http`) for Streamable HTTP; otherwise stdio                      |
| `RESUMABILITY_ENABLED` | `false`  | `true` enables stateful sessions + event store (`Last-Event-ID` replay, `GET/DELETE /mcp`) |
| `EVENT_STORE_TYPE`     | `memory` | `memory` \| `redis`                                                                        |
| `CORS_ORIGIN`          | `*`      | `*` or comma-separated allowlist (`https://a.com,https://b.com`)                           |

## Security

| Variable                      | Default  | Description                                                                 |
| ----------------------------- | -------- | --------------------------------------------------------------------------- |
| `AUTH_MODE`                   | `none`   | `none` \| `apiKey` \| `bearer` \| `oidc`                                    |
| `API_KEY`                     | —        | Required when `AUTH_MODE=apiKey`; clients send `X-API-Key`                  |
| `BEARER_TOKEN` / `AUTH_TOKEN` | —        | Required when `AUTH_MODE=bearer`; static token compare                      |
| `OIDC_ISSUER`                 | —        | Optional issuer claim check in oidc mode (e.g. `https://sso.example.com`)   |
| `OIDC_AUDIENCE`               | —        | Optional audience claim check in oidc mode                                  |
| `ADMIN_ENABLED`               | `true`   | Exposes `/admin`, `/admin/*`, `/admin/tenants`                              |
| `ADMIN_TOKEN`                 | —        | When set, admin/control-plane routes require `X-Admin-Token` (or `?token=`) |
| `RATE_LIMIT_WINDOW_MS`        | `900000` | Rate limit window (15 min)                                                  |
| `RATE_LIMIT_MAX`              | `100`    | Max requests per window on `/mcp`                                           |

## Multi-tenant (v3.0)

| Variable          | Default | Description                                            |
| ----------------- | ------- | ------------------------------------------------------ |
| `TENANT_REQUIRED` | `false` | `true` → `/mcp` rejects requests without `X-Tenant-Id` |

Tenants are managed at runtime via the control plane (`POST /admin/tenants`). Memory stores and cache keys are namespaced per tenant.

## Capabilities (Phase 3)

| Variable          | Default                          | Description                                          |
| ----------------- | -------------------------------- | ---------------------------------------------------- |
| `ALLOWED_ROOT`    | `/tmp/mcp-data`                  | Filesystem sandbox root for all file tools/resources |
| `ALLOW_SHELL`     | `false`                          | Enables `shell_execute` (admin role also required)   |
| `SHELL_ALLOWLIST` | `ls,cat,echo,pwd,head,tail,grep` | Comma-separated command allowlist                    |
| `DATABASE_PATH`   | `:memory:`                       | alasql database location                             |

## Integrations (Phase 4)

| Variable                               | Default      | Description                                                                  |
| -------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP` | `500` / `50` | Chunking for `rag_ingest`                                                    |
| `CACHE_TTL_MS`                         | `300000`     | TTL for web/github caches                                                    |
| `REDIS_URL`                            | —            | Enables Redis log lines in persistence/event store (production wiring point) |
| `QDRANT_URL`                           | —            | Reserved for external vector store                                           |
| `BRAVE_API_KEY`                        | —            | Real Brave results when set (mock otherwise)                                 |
| `TAVILY_API_KEY`                       | —            | Real Tavily results when set (mock otherwise)                                |
| `OPENAI_API_KEY`                       | —            | Reserved for hosted embeddings                                               |
| `GITHUB_TOKEN`                         | —            | Higher GitHub API rate limits                                                |
| `SLACK_TOKEN` / `NOTION_TOKEN`         | —            | Real Slack/Notion plugin calls when set                                      |

## Observability (v2.1+)

| Variable                      | Default | Description                                                                                |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `LOG_LEVEL`                   | `info`  | `debug` \| `info` \| `warn` \| `error`                                                     |
| `LOG_FORMAT`                  | `text`  | `text` \| `json` (use json in production)                                                  |
| `OTEL_ENABLED`                | `false` | Boots real OpenTelemetry SDK (`src/observability/otel-real.ts`)                            |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | —       | OTLP HTTP endpoint, e.g. `http://otel-collector:4318/v1/traces`; console exporter if unset |

## Runtime scale (v3.0)

| Variable          | Default | Description                                |
| ----------------- | ------- | ------------------------------------------ |
| `CLUSTER_MODE`    | `false` | Fork workers via node:cluster              |
| `CLUSTER_WORKERS` | `0`     | Worker count; `0` = CPU count − 1 (max 16) |

> Cluster mode requires stateless sessions (or RedisEventStore) so any worker can serve any request.

## Cross-field validation rules

- `AUTH_MODE=apiKey` → `API_KEY` must be set
- `AUTH_MODE=bearer` → `BEARER_TOKEN` or `AUTH_TOKEN` must be set
- Invalid values abort startup before any listener opens
