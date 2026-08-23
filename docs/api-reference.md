# API Reference

All MCP capabilities are exposed via the standard protocol (`tools/list`, `tools/call`, `resources/*`, `prompts/*`) on either stdio or `POST /mcp`. HTTP-only endpoints (`/health`, `/metrics`, `/admin/...`) are listed at the end.

## Tools (40)

### Core (Phase 1)

| Tool         | Required role | Input                                                  | Notes                          |
| ------------ | ------------- | ------------------------------------------------------ | ------------------------------ |
| `echo`       | reader        | `message`, `uppercase?`                                | Connectivity test              |
| `calculator` | reader        | `operation: add\|subtract\|multiply\|divide`, `a`, `b` | Divide-by-zero → `isError`     |
| `get_time`   | reader        | `timezone?` (IANA)                                     | ISO, unix, formatted           |
| `fetch_url`  | reader        | `url`, `maxLength? ≤20000`                             | 10s timeout; truncation notice |

### Filesystem (sandboxed to `ALLOWED_ROOT`)

| Tool           | Role   | Input                                                             |
| -------------- | ------ | ----------------------------------------------------------------- |
| `list_files`   | reader | `path?=.` , `recursive?=false`                                    |
| `read_file`    | reader | `path` (≤1 MB)                                                    |
| `write_file`   | writer | `path`, `content` — emits `notifications/resources/list_changed`  |
| `search_files` | reader | `query`, `path?=`, `maxResults?≤50` — case-insensitive, line hits |

Path traversal (`../`) is rejected with `isError`.

### Memory (tenant-scoped in v3.0 semantics)

| Tool                                            | Role   | Input            |
| ----------------------------------------------- | ------ | ---------------- |
| `memory_set` / `memory_delete` / `memory_clear` | writer | `key`[, `value`] |
| `memory_get` / `memory_list`                    | reader | `key` / —        |

### Database (alasql demo DB)

| Tool              | Role   | Input                                                                                          |
| ----------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `database_query`  | writer | `sql` — must start with SELECT/INSERT/UPDATE/DELETE/CREATE/DROP/SHOW; output capped at 50 rows |
| `database_tables` | reader | — — tables `users`, `notes` seeded                                                             |

### Shell (disabled by default)

| Tool            | Role  | Input                                                                             |
| --------------- | ----- | --------------------------------------------------------------------------------- |
| `shell_execute` | admin | `command`, `timeout? ≤10000ms` — requires `ALLOW_SHELL=true` + allowlisted binary |

### RAG (hybrid search)

| Tool                     | Role            | Input                                                                                                                                                                                   |
| ------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rag_ingest`             | writer          | `text`, `id?`, `metadata?`, `chunk?=true` — chunks of `RAG_CHUNK_SIZE`/overlap                                                                                                          |
| `rag_search`             | reader          | `query`, `topK?≤20`, `threshold?`, `mode?: vector\|bm25\|hybrid` (default hybrid α=0.5). Output lines carry combined + per-signal scores: `score=… (v=… bm25=…) id=… text=… metadata=…` |
| `rag_list` / `rag_clear` | reader / writer | —                                                                                                                                                                                       |

### Web & GitHub (cached via `CACHE_TTL_MS`)

| Tool                                   | Role   | Input                                                   |
| -------------------------------------- | ------ | ------------------------------------------------------- |
| `brave_search` / `tavily_search`       | reader | `query`, `count?/maxResults?` — mocked without API keys |
| `web_fetch`                            | reader | `url`, `useCache?=true`, `maxLength?`                   |
| `github_search_repos`                  | reader | `query`, `perPage?≤10`                                  |
| `github_get_repo` / `github_get_issue` | reader | `repo` / `repo`, `issueNumber`                          |

### Tasks

| Tool              | Role   | Input                                                                      |
| ----------------- | ------ | -------------------------------------------------------------------------- |
| `create_task`     | writer | `duration? 100–10000ms`, `payload?` → returns `{taskId, status:"working"}` |
| `get_task`        | reader | `taskId` → status                                                          |
| `get_task_result` | reader | `taskId` → result when completed                                           |
| `delay_task`      | —      | Experimental SDK task (only when task store configured)                    |

### Plugin tools (slack / notion / linear)

Mocked unless `SLACK_TOKEN` / `NOTION_TOKEN` set. All `reader`.

- Slack: `slack_list_channels`, `slack_post_message{channel,text}`, `slack_search{query,count?}`
- Notion: `notion_search{query,page_size?}`, `notion_get_page{page_id}`, `notion_create_page{title,content?}`
- Linear: `linear_list_issues{team?,limit?}`, `linear_create_issue{title,description?,team?}`, `linear_get_issue{id}`

### Protocol demos

| Tool                     | Role   | Notes                                                             |
| ------------------------ | ------ | ----------------------------------------------------------------- |
| `collect_user_info`      | writer | Elicitation round-trip; graceful fallback if client lacks support |
| `generate_with_sampling` | writer | Sampling round-trip; graceful fallback                            |

## Resources (6)

| URI                    | Type     | Notes                                                                                 |
| ---------------------- | -------- | ------------------------------------------------------------------------------------- |
| `config://server-info` | static   | Name/version/features/uptime JSON                                                     |
| `greeting://{name}`    | template | Text greeting                                                                         |
| `file:///{+path}`      | template | Sandboxed read under `ALLOWED_ROOT`; `list` walks tree; `complete` suggests filenames |
| `memory://{key}`       | template | Tenant memory value; list + complete                                                  |
| `db://{table}/{id}`    | template | Row from users/notes as JSON; list + complete                                         |
| `docs://{id}`          | template | RAG chunk text; list + complete                                                       |

## Prompts (4)

| Prompt            | Args                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| `code-review`     | `language`, `code`                                                         |
| `explain-concept` | `concept`, `level?: beginner\|intermediate\|expert`                        |
| `summarize`       | `text`, `length?: short\|medium\|long`, `style?: bullets\|paragraph\|tldr` |
| `research`        | `topic`, `depth?: overview\|deep`, `audience?`                             |

Preview without a client: `POST /admin/prompts/:name/preview` with an args JSON body.

## HTTP endpoints

| Endpoint                                                               | Auth             | Description                                                                                                             |
| ---------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                                          | none             | SLO checks (memory/rag/cache/uptime), version, otel/eventStore status                                                   |
| `GET /ready`                                                           | none             | `200` when all SLO checks pass, else `503`                                                                              |
| `GET /metrics`                                                         | none             | Prometheus exposition (`mcp_http_requests_total`, `mcp_http_request_duration_ms`, `mcp_sessions_active`, node defaults) |
| `POST /mcp`                                                            | auth+rbac+tenant | Streamable HTTP transport (JSON response mode)                                                                          |
| `GET/DELETE /mcp`                                                      | —                | Stateful mode only: SSE stream w/ replay, session close; stateless returns `405`                                        |
| `GET /admin`                                                           | admin token      | HTML dashboard incl. prompt playground                                                                                  |
| `GET /admin/tools\|resources\|prompts\|metrics\|spans\|stores\|health` | admin token      | Introspection JSON                                                                                                      |
| `POST /admin/prompts/:name/preview`                                    | admin token      | Server-side prompt rendering                                                                                            |
| `GET/POST /admin/tenants`, `GET/PATCH/DELETE /admin/tenants/:id`       | admin token      | Control plane CRUD (409 dup, 400 invalid id)                                                                            |
| `POST /admin/tenants/:id/rotate-key`                                   | admin token      | New `ak_*` API key                                                                                                      |
| `GET /admin/tenants/:id/store`                                         | admin token      | Tenant memory inspection                                                                                                |

## Error codes

| Code     | Meaning                                                               |
| -------- | --------------------------------------------------------------------- |
| `-32000` | Rate limited / bad request / tenant required                          |
| `-32001` | Unauthorized (auth/RBAC) — RBAC uses HTTP `403` for insufficient role |
| `-32601` | Method not found (e.g. elicitation unsupported by client)             |
| `-32602` | Invalid tool/resource arguments (Zod)                                 |
| `-32603` | Internal error                                                        |

Tool-level failures return normally with `isError: true` and a human-readable message.
