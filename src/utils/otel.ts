/**
 * Lightweight OTEL tracing/metrics (Phase 5)
 * - If OTEL_ENABLED=false: no-op spans, just logger
 * - If true: creates spans with timing, attributes, and exports to console or OTLP endpoint (stub)
 * Avoids heavy @opentelemetry deps for base; production can swap with real SDK
 */
import { config } from '../config.js';
import { logger } from './logger.js';

export type SpanStatus = 'ok' | 'error';

export interface Span {
  spanId: string;
  traceId: string;
  name: string;
  startTime: number;
  end: (status?: SpanStatus, attrs?: Record<string, unknown>) => void;
  setAttribute: (key: string, value: unknown) => void;
  addEvent: (name: string, attrs?: Record<string, unknown>) => void;
}

type SpanData = {
  spanId: string;
  traceId: string;
  name: string;
  durationMs: number;
  status: SpanStatus;
  attributes: Record<string, unknown>;
  events: { name: string; attrs?: Record<string, unknown>; time: number }[];
};

const spans: SpanData[] = [];
const metrics = new Map<string, { count: number; sum: number; last: number }>();

function genId(len = 16): string {
  return Math.random()
    .toString(36)
    .slice(2, 2 + len)
    .padEnd(len, '0');
}

export function createSpan(name: string, attrs: Record<string, unknown> = {}): Span {
  const enabled = config.otel.enabled;
  const spanId = genId(16);
  const traceId = genId(32);
  const startTime = Date.now();
  const attributes: Record<string, unknown> = { ...attrs };
  const events: SpanData['events'] = [];

  const span: Span = {
    spanId,
    traceId,
    name,
    startTime,
    setAttribute: (key, value) => {
      attributes[key] = value;
    },
    addEvent: (evName, evAttrs) => {
      events.push({ name: evName, attrs: evAttrs, time: Date.now() });
    },
    end: (status: SpanStatus = 'ok', extraAttrs = {}) => {
      const durationMs = Date.now() - startTime;
      Object.assign(attributes, extraAttrs);
      const data: SpanData = { spanId, traceId, name, durationMs, status, attributes, events };
      spans.push(data);
      // Keep last 1000 spans
      if (spans.length > 1000) spans.shift();

      // Update metrics
      const key = `span.${name}.duration`;
      const m = metrics.get(key) || { count: 0, sum: 0, last: 0 };
      m.count++;
      m.sum += durationMs;
      m.last = durationMs;
      metrics.set(key, m);
      const errKey = `span.${name}.error`;
      if (status === 'error') {
        const em = metrics.get(errKey) || { count: 0, sum: 0, last: 0 };
        em.count++;
        metrics.set(errKey, em);
      }

      if (enabled) {
        const logLevel = status === 'error' ? 'error' : 'info';
        (logger as any)[logLevel](`span:${name}`, {
          traceId,
          spanId,
          durationMs,
          status,
          attributes,
          events: events.length ? events : undefined,
          otlpEndpoint: config.otel.endpoint || 'console',
        });

        // Stub OTLP export: if endpoint set, would POST to it (not implemented, just log)
        if (config.otel.endpoint) {
          // In production: fetch(config.otel.endpoint, { method: 'POST', body: JSON.stringify(data) })
          logger.debug('otel export stub', { endpoint: config.otel.endpoint, span: name });
        }
      }
    },
  };

  return span;
}

export function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attrs?: Record<string, unknown>
): Promise<T> {
  const span = createSpan(name, attrs);
  return fn(span)
    .then(res => {
      span.end('ok');
      return res;
    })
    .catch(err => {
      span.end('error', { error: err instanceof Error ? err.message : String(err) });
      throw err;
    });
}

// Metrics helpers
export function incrementCounter(
  name: string,
  value = 1,
  attrs: Record<string, unknown> = {}
): void {
  const m = metrics.get(name) || { count: 0, sum: 0, last: 0 };
  m.count += value;
  m.last = value;
  metrics.set(name, m);
  if (config.otel.enabled) {
    logger.debug('metric increment', { name, value, attrs });
  }
}

export function recordHistogram(name: string, value: number): void {
  const m = metrics.get(name) || { count: 0, sum: 0, last: 0 };
  m.count++;
  m.sum += value;
  m.last = value;
  metrics.set(name, m);
}

export function getMetrics(): Record<string, { count: number; avg: number; last: number }> {
  const out: Record<string, { count: number; avg: number; last: number }> = {};
  for (const [k, v] of metrics.entries()) {
    out[k] = { count: v.count, avg: v.count ? v.sum / v.count : 0, last: v.last };
  }
  return out;
}

export function getSpans(limit = 100): SpanData[] {
  return spans.slice(-limit).reverse();
}

export function clearTelemetry(): void {
  spans.length = 0;
  metrics.clear();
}
