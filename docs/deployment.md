# Deployment

## Local

```bash
npm install && npm run build

npm start            # stdio (Claude Desktop / Cursor)
npm run start:http   # Streamable HTTP on :3000
```

## Docker (single container)

```bash
docker build -t mcp-server-base .
docker run -p 3000:3000 -e TRANSPORT=http mcp-server-base
```

Image: multi-stage `node:22-alpine`, non-root `appuser`, `HEALTHCHECK` on `/health`.

## Full stack (docker compose)

Base services (`docker-compose.yml`): **app**, **redis:7**, **postgres:16**, **qdrant:v1.12.4** — all with healthchecks and named volumes.

Observability override (`docker-compose.override.yml`) adds **otel-collector**, **prometheus** (:9090), **grafana** (:3001, admin/admin):

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
docker compose logs -f app

curl localhost:3000/health   # SLO checks
curl localhost:3000/metrics  # Prometheus exposition
```

Prometheus scrapes `app:3000/metrics` every 15s via `prometheus.yml`; point a Grafana Prometheus datasource at `http://prometheus:9090`.

## Horizontal scale (v3.0)

Two complementary modes:

### 1. In-process cluster (single host)

```bash
CLUSTER_MODE=true CLUSTER_WORKERS=4 TRANSPORT=http npm start
```

Primary forks N workers (auto-restart on crash). Requires stateless mode or shared session store.

### 2. Multi-replica (multi host / orchestrator)

Requirements:

- `RESUMABILITY_ENABLED=true` + `EVENT_STORE_TYPE=redis` + `REDIS_URL=...` so any replica can serve a session
- Stateless-friendly tools only (all built-ins qualify; avoid in-process task state)
- Load balancer with sticky sessions optional (session id travels in `mcp-session-id` header)

```bash
docker compose up -d --scale app=3
```

Fly.io / Cloud Run: deploy the image, set env from [configuration.md](configuration.md), health probe `/health`, port 3000.

## Resumable sessions

When enabled, clients receive `mcp-session-id` on initialize; reconnect with:

```
GET /mcp
mcp-session-id: <id>
last-event-id: <eventId>
```

Missed events are replayed from the event store before the live stream resumes.

## Backups

`memory` + RAG vector store are persisted (debounced 500 ms) to `${ALLOWED_ROOT}/.backup.json` and reloaded at startup. Set `REDIS_URL` to also log the Redis sync hook (production wiring point). Verify contents at `GET /admin/stores`.

## Load testing

```bash
npm run bench:local                    # k6 against localhost:3000
BASE_URL=https://staging k6 run k6/load.js --out json=k6/results.json
```

Thresholds (enforced by k6, also used by nightly CI): p95 < 100 ms, error rate < 1%, checks > 99%. Stages ramp 10 → 50 VUs.

Nightly schedule lives in `.github/workflows/nightly-k6.yml` (02:00 UTC) with artifact upload.

## Health & capacity signals

| Signal     | Endpoint        | Healthy when                                     |
| ---------- | --------------- | ------------------------------------------------ |
| Liveness   | `/health`       | `status:"ok"`                                    |
| Readiness  | `/ready`        | all SLO checks pass (`503` otherwise)            |
| Throughput | `/metrics`      | `mcp_http_request_duration_ms` p95 within budget |
| Sessions   | `/metrics`      | `mcp_sessions_active` trending as expected       |
| Stores     | `/admin/stores` | memory/rag/cache sizes sane                      |
