/**
 * Prometheus metrics via prom-client (v2.1)
 * Exposes /metrics for scraping
 */
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const registry = new Registry();

// Default metrics (nodejs)
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'mcp_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'mcp_http_request_duration_ms',
  help: 'HTTP request duration ms',
  labelNames: ['method', 'path'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000],
  registers: [registry],
});

export const mcpSessionsActive = new Gauge({
  name: 'mcp_sessions_active',
  help: 'Active MCP sessions',
  registers: [registry],
});

export const mcpToolCallsTotal = new Counter({
  name: 'mcp_tool_calls_total',
  help: 'Total tool calls',
  labelNames: ['tool'],
  registers: [registry],
});

export async function getMetricsText(): Promise<string> {
  return registry.metrics();
}

export function setActiveSessions(count: number): void {
  mcpSessionsActive.set(count);
}
