# k6 Load Tests

```bash
# Install k6: https://k6.io/docs/getting-started/installation/
# Run against local HTTP
BASE_URL=http://localhost:3000 k6 run k6/load.js

# With auth
BASE_URL=http://localhost:3000 AUTH_TOKEN=secret k6 run --env BASE_URL=http://localhost:3000 k6/load.js

# Output summary
k6 run k6/load.js --out json=k6/results.json
```

Thresholds per ROADMAP v2.0:

- `http_req_duration p(95) < 100ms`
- `http_req_failed < 1%`
- Checks >99%
