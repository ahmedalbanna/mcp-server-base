import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

export const options = {
  stages: [
    { duration: '30s', target: 10 }, // ramp up
    { duration: '1m', target: 10 }, // steady
    { duration: '30s', target: 50 }, // spike
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<100', 'p(99)<200'], // p95 <100ms per ROADMAP
    http_req_failed: ['rate<0.01'], // <1% errors
    checks: ['rate>0.99'],
  },
};

const mcpTrend = new Trend('mcp_duration');
const mcpFailed = new Rate('mcp_failed');
const mcpRequests = new Counter('mcp_requests');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const MCP_URL = `${BASE_URL}/mcp`;

function mcpPayload(id, method, params = {}) {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params });
}

export function setup() {
  // Health check
  const res = http.get(`${BASE_URL}/health`);
  check(res, { 'health 200': r => r.status === 200 });
}

export default function () {
  // Wrap with group for MCP tools/list
  let res;

  // 1. tools/list
  res = http.post(MCP_URL, mcpPayload(1, 'tools/list'), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'tools/list 200': r => r.status === 200 });
  mcpTrend.add(res.timings.duration);
  mcpFailed.add(res.status !== 200);
  mcpRequests.add(1);
  sleep(0.5);

  // 2. echo
  res = http.post(
    MCP_URL,
    mcpPayload(2, 'tools/call', { name: 'echo', arguments: { message: 'hello k6' } }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, { 'echo 200': r => r.status === 200 && r.body.includes('hello k6') });
  mcpTrend.add(res.timings.duration);
  sleep(0.5);

  // 3. calculator
  res = http.post(
    MCP_URL,
    mcpPayload(3, 'tools/call', { name: 'calculator', arguments: { operation: 'add', a: 1, b: 2 } }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, { 'calc 200': r => r.status === 200 });
  mcpTrend.add(res.timings.duration);
  sleep(0.5);

  // 4. health (should be fast, not rate-limited)
  res = http.get(`${BASE_URL}/health`);
  check(res, { 'health 200': r => r.status === 200 });
  sleep(0.5);
}

export function handleSummary(data) {
  return {
    'k6/summary.json': JSON.stringify(data, null, 2),
    stdout: `
    ========== MCP Load Test Summary ==========
    p95: ${data.metrics.http_req_duration.values['p(95)']}ms (threshold <100ms)
    p99: ${data.metrics.http_req_duration.values['p(99)']}ms
    Failed: ${data.metrics.http_req_failed.values.rate * 100}%
    Checks: ${data.metrics.checks.values.rate * 100}%
    ==========================================
    `,
  };
}
