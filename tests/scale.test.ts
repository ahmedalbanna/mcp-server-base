import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSpan,
  withSpan,
  incrementCounter,
  recordHistogram,
  getMetrics,
  getSpans,
  clearTelemetry,
} from '../src/utils/otel.js';
import { RedisEventStore, eventStoreFactory } from '../src/utils/redisEventStore.js';
import { MemoryCache } from '../src/utils/cache.js';
import { SimpleQueue } from '../src/utils/queue.js';
import { getTasks } from '../src/tools/tasks.tool.js';
import { createMcpServer } from '../src/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createHttpApp } from '../src/index.js';
import { config } from '../src/config.js';

async function createClient() {
  const server = createMcpServer();
  const client = new Client({ name: 'scale-test', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  return { client, server };
}

describe('Phase 5 Scale & Operability', () => {
  describe('OTEL tracing/metrics', () => {
    beforeEach(() => clearTelemetry());
    afterEach(() => clearTelemetry());

    it('createSpan and end records metrics', async () => {
      const orig = (config as any).otel.enabled;
      (config as any).otel.enabled = true;

      const span = createSpan('test.span', { foo: 'bar' });
      expect(span.spanId).toBeDefined();
      expect(span.traceId).toBeDefined();
      span.setAttribute('extra', 123);
      span.addEvent('test.event', { a: 1 });
      span.end('ok', { result: 'success' });

      const metrics = getMetrics();
      expect(metrics['span.test.span.duration']).toBeDefined();
      expect(metrics['span.test.span.duration'].count).toBe(1);

      const spans = getSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].name).toBe('test.span');
      expect(spans[0].status).toBe('ok');

      (config as any).otel.enabled = orig;
    });

    it('withSpan handles success and error', async () => {
      const orig = (config as any).otel.enabled;
      (config as any).otel.enabled = true;
      clearTelemetry();

      const res = await withSpan('withSpan.success', async span => {
        span.setAttribute('x', 1);
        return 42;
      });
      expect(res).toBe(42);
      expect(getSpans()[0].status).toBe('ok');

      await expect(
        withSpan('withSpan.error', async () => {
          throw new Error('fail');
        })
      ).rejects.toThrow('fail');
      expect(getSpans().some(s => s.status === 'error')).toBe(true);

      (config as any).otel.enabled = orig;
    });

    it('incrementCounter and recordHistogram', () => {
      clearTelemetry();
      incrementCounter('test.counter', 5);
      incrementCounter('test.counter', 2);
      recordHistogram('test.hist', 100);
      recordHistogram('test.hist', 200);
      const m = getMetrics();
      expect(m['test.counter'].count).toBe(7);
      expect(m['test.hist'].count).toBe(2);
      expect(m['test.hist'].avg).toBe(150);
    });

    it('clearTelemetry', () => {
      createSpan('a').end();
      expect(getSpans().length).toBeGreaterThan(0);
      clearTelemetry();
      expect(getSpans().length).toBe(0);
      expect(Object.keys(getMetrics()).length).toBe(0);
    });
  });

  describe('RedisEventStore (scale)', () => {
    it('stores and replays via RedisEventStore', async () => {
      const store = new RedisEventStore();
      const sid = 'stream1';
      const msg1: any = { jsonrpc: '2.0', method: 'test', id: 1 };
      const msg2: any = { jsonrpc: '2.0', method: 'test2', id: 2 };
      const id1 = await store.storeEvent(sid, msg1);
      const id2 = await store.storeEvent(sid, msg2);
      expect(store.size).toBe(2);

      const sent: any[] = [];
      const retStream = await store.replayEventsAfter(id1, {
        send: async (eid, msg) => sent.push({ eid, msg }),
      });
      expect(retStream).toBe(sid);
      expect(sent.length).toBe(1);
      expect(sent[0].msg).toEqual(msg2);
      expect(id1).toContain(sid);
      expect(id2).toContain(sid);
      store.clear();
      expect(store.size).toBe(0);
    });

    it('factory creates EventStore', async () => {
      const store = eventStoreFactory.create();
      expect(store).toBeDefined();
      const id = await store.storeEvent('s', { jsonrpc: '2.0' } as any);
      expect(id).toBeDefined();
    });

    it('replay unknown returns empty', async () => {
      const store = new RedisEventStore();
      const res = await store.replayEventsAfter('unknown', { send: async () => {} });
      expect(res).toBe('');
    });
  });

  describe('Cache and Queue (scale infra)', () => {
    it('MemoryCache via scale', () => {
      const cache = new MemoryCache<string, number>(1000);
      cache.set('k', 1);
      expect(cache.get('k')).toBe(1);
      cache.delete('k');
      expect(cache.get('k')).toBeUndefined();
    });

    it('SimpleQueue via scale', () => {
      const q = new SimpleQueue<string>();
      q.enqueue('a');
      q.enqueue('b');
      expect(q.peek()).toBe('a');
      expect(q.dequeue()).toBe('a');
      expect(q.size).toBe(1);
      q.clear();
      expect(q.isEmpty()).toBe(true);
    });
  });

  describe('Admin routes', () => {
    it('GET /admin returns html dashboard (no token)', async () => {
      const origEnabled = (config as any).admin.enabled;
      const origToken = (config as any).admin.token;
      (config as any).admin.enabled = true;
      (config as any).admin.token = undefined;

      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;

      try {
        const res = await fetch(`${base}/admin`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain('MCP Admin');
        expect(text).toContain(config.server.name);

        // /admin/tools
        const toolsRes = await fetch(`${base}/admin/tools`);
        expect(toolsRes.status).toBe(200);
        const tools = await toolsRes.json();
        expect(tools.tools.length).toBeGreaterThan(0);

        // /admin/metrics
        const metricsRes = await fetch(`${base}/admin/metrics`);
        expect(metricsRes.status).toBe(200);
        const metrics = await metricsRes.json();
        expect(metrics).toBeDefined();

        // /admin/spans
        const spansRes = await fetch(`${base}/admin/spans`);
        expect(spansRes.status).toBe(200);

        // /admin/stores
        const storesRes = await fetch(`${base}/admin/stores`);
        expect(storesRes.status).toBe(200);
        const stores = await storesRes.json();
        expect(stores.config).toBeDefined();
      } finally {
        await new Promise<void>(r => server.close(() => r()));
        (config as any).admin.enabled = origEnabled;
        (config as any).admin.token = origToken;
      }
    });

    it('admin token protects', async () => {
      const origToken = (config as any).admin.token;
      (config as any).admin.token = 'secret-admin';
      (config as any).admin.enabled = true;

      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;

      try {
        const noAuth = await fetch(`${base}/admin/tools`);
        expect(noAuth.status).toBe(401);

        const withAuth = await fetch(`${base}/admin/tools`, {
          headers: { 'X-Admin-Token': 'secret-admin' },
        });
        expect(withAuth.status).toBe(200);

        const withQuery = await fetch(`${base}/admin/tools?token=secret-admin`);
        expect(withQuery.status).toBe(200);
      } finally {
        await new Promise<void>(r => server.close(() => r()));
        (config as any).admin.token = origToken;
      }
    });

    it('admin disabled returns 404', async () => {
      const origEnabled = (config as any).admin.enabled;
      (config as any).admin.enabled = false;
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;
      try {
        const res = await fetch(`${base}/admin`);
        expect(res.status).toBe(404);
      } finally {
        await new Promise<void>(r => server.close(() => r()));
        (config as any).admin.enabled = origEnabled;
      }
    });

    it('GET /health and /ready still work with admin', async () => {
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;
      try {
        const h = await fetch(`${base}/health`);
        expect(h.status).toBe(200);
        const r = await fetch(`${base}/ready`);
        expect(r.status).toBe(200);
        const j = await r.json();
        expect(j.uptime).toBeDefined();
      } finally {
        await new Promise<void>(r => server.close(() => r()));
      }
    });
  });

  describe('Tasks (delay)', () => {
    beforeEach(() => getTasks().clear());

    it('create_task and poll get_task', async () => {
      const { client } = await createClient();
      const createRes = await client.callTool({
        name: 'create_task',
        arguments: { duration: 200, payload: 'test-payload' },
      });
      const text = (createRes.content as any)[0].text as string;
      const { taskId } = JSON.parse(text);
      expect(taskId).toMatch(/^task_/);

      // immediate status should be working
      let res = await client.callTool({ name: 'get_task', arguments: { taskId } });
      expect((res.content as any)[0].text).toContain('working');

      // wait for completion
      await new Promise(r => setTimeout(r, 300));
      res = await client.callTool({ name: 'get_task', arguments: { taskId } });
      expect((res.content as any)[0].text).toContain('completed');

      const resultRes = await client.callTool({ name: 'get_task_result', arguments: { taskId } });
      const resultText = (resultRes.content as any)[0].text as string;
      expect(resultText).toContain('completed after 200ms');
    });

    it('get_task not found', async () => {
      const { client } = await createClient();
      const res = await client.callTool({ name: 'get_task', arguments: { taskId: 'nonexistent' } });
      expect(res.isError).toBe(true);
    });

    it('get_task_result not completed yet', async () => {
      const { client } = await createClient();
      const createRes = await client.callTool({
        name: 'create_task',
        arguments: { duration: 500 },
      });
      const { taskId } = JSON.parse((createRes.content as any)[0].text);
      const res = await client.callTool({ name: 'get_task_result', arguments: { taskId } });
      expect((res.content as any)[0].text).toContain('working');
    });

    it('delay_task experimental fallback (if not configured, should still have create_task)', async () => {
      const { client } = await createClient();
      const { tools } = await client.listTools();
      const names = tools.map(t => t.name);
      expect(names).toContain('create_task');
      // delay_task may be registered if experimental available, but at least create_task exists
    });
  });

  describe('Server versioning', () => {
    it('server version and instructions', async () => {
      const { client } = await createClient();
      // We can't directly get serverInfo via MCP, but we can check resources
      const { resources } = await client.listResources();
      expect(resources.length).toBeGreaterThan(0);
      // Check that config version is set (should be 2.1.0 per package.json)
      expect(config.server.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('health shows version', async () => {
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;
      try {
        const res = await fetch(`${base}/health`);
        const body = await res.json();
        expect(body.version).toBe(config.server.version);
        expect(body.name).toBe(config.server.name);
      } finally {
        await new Promise<void>(r => server.close(() => r()));
      }
    });
  });

  describe('k6 script exists', () => {
    it('k6 load script is valid', async () => {
      const fs = await import('node:fs/promises');
      const content = await fs.readFile('k6/load.js', 'utf-8');
      expect(content).toContain('http_req_duration');
      expect(content).toContain('p(95)<100');
      const pkg = JSON.parse(await fs.readFile('package.json', 'utf-8'));
      expect(pkg.scripts.bench).toContain('k6');
    });
  });
});
