import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { checkSlo } from '../src/observability/slo.js';
import { hasRole, getRoleFromRequest } from '../src/middleware/rbac.js';
import { createHttpApp } from '../src/index.js';
import { clearTelemetry, createSpan, getMetrics } from '../src/utils/otel.js';
import { saveBackup, loadBackup } from '../src/utils/persistence.js';
import { getMemoryStore } from '../src/tools/memory.tool.js';
import { clearVectorStore } from '../src/tools/rag.tool.js';
import { getVectorStore } from '../src/tools/rag.tool.js';
import type { Request } from 'express';

describe('v2.1 Hardening & Observability', () => {
  describe('SLO checks', () => {
    it('checkSlo returns ok and checks', async () => {
      const res = await checkSlo();
      expect(res.ok).toBe(true);
      expect(res.checks.length).toBeGreaterThan(0);
      expect(res.uptime).toBeGreaterThan(0);
      const names = res.checks.map(c => c.name);
      expect(names).toContain('memory_store');
      expect(names).toContain('rag_store');
      expect(names).toContain('cache');
    });
  });

  describe('RBAC', () => {
    it('hasRole', () => {
      expect(hasRole('admin', 'reader')).toBe(true);
      expect(hasRole('writer', 'admin')).toBe(false);
    });

    it('getRoleFromRequest', () => {
      expect(getRoleFromRequest({ headers: {} } as unknown as Request)).toBe('reader');
      expect(getRoleFromRequest({ headers: { 'x-role': 'writer' } } as unknown as Request)).toBe(
        'writer'
      );
      expect(getRoleFromRequest({ headers: { 'x-role': 'admin' } } as unknown as Request)).toBe(
        'admin'
      );
    });

    it('RBAC enforced on MCP tools via HTTP', async () => {
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;

      try {
        // reader trying to write_file should be 403
        const resReader = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Role': 'reader' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'write_file', arguments: { path: 'test.txt', content: 'hi' } },
          }),
        });
        expect(resReader.status).toBe(403);
        const bodyReader: any = await resReader.json();
        expect(bodyReader.error.message).toContain('writer');

        // writer should pass (not 403, may be 200 or other but not 403)
        const resWriter = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Role': 'writer' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
              name: 'write_file',
              arguments: { path: 'test-rbac.txt', content: 'hi writer' },
            },
          }),
        });
        expect(resWriter.status).not.toBe(403);

        // admin can do shell_execute (admin only) - reader should be 403
        const resReaderShell = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Role': 'reader' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'shell_execute', arguments: { command: 'echo hi' } },
          }),
        });
        expect(resReaderShell.status).toBe(403);

        // admin should pass
        const resAdmin = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Role': 'admin' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: { name: 'shell_execute', arguments: { command: 'echo hi' } },
          }),
        });
        expect(resAdmin.status).not.toBe(403);

        // reader can do read-only like echo
        const resReaderEcho = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Role': 'reader' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: { name: 'echo', arguments: { message: 'hi' } },
          }),
        });
        expect(resReaderEcho.status).not.toBe(403);
      } finally {
        await new Promise<void>(r => server.close(() => r()));
      }
    });

    it('default role reader no header', async () => {
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;
      try {
        // no X-Role header defaults to reader, so write should be 403
        const res = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'write_file', arguments: { path: 'no-role.txt', content: 'x' } },
          }),
        });
        expect(res.status).toBe(403);
      } finally {
        await new Promise<void>(r => server.close(() => r()));
      }
    });
  });

  describe('SLO health & metrics endpoints', () => {
    it('GET /health returns slo checks', async () => {
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;
      try {
        const res = await fetch(`${base}/health`);
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.status).toMatch(/ok|degraded/);
        expect(body.checks).toBeDefined();
        expect(body.version).toBe(config.server.version);
      } finally {
        await new Promise<void>(r => server.close(() => r()));
      }
    });

    it('GET /ready returns 200 when slo ok', async () => {
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;
      try {
        const res = await fetch(`${base}/ready`);
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.status).toBe('ready');
      } finally {
        await new Promise<void>(r => server.close(() => r()));
      }
    });

    it('GET /metrics returns prometheus text', async () => {
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;
      try {
        const res = await fetch(`${base}/metrics`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain('mcp_http_requests_total');
        expect(text).toContain('mcp_http_request_duration_ms');
      } finally {
        await new Promise<void>(r => server.close(() => r()));
      }
    });

    it('OTEL span created for request', async () => {
      clearTelemetry();
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;
      try {
        await fetch(`${base}/health`);
        // span should be recorded
        const metrics = getMetrics();
        expect(Object.keys(metrics).length).toBeGreaterThan(0);
        // createSpan directly
        const span = createSpan('test.v2_1');
        span.end('ok');
        expect(getMetrics()['span.test.v2_1.duration']).toBeDefined();
      } finally {
        await new Promise<void>(r => server.close(() => r()));
        clearTelemetry();
      }
    });
  });

  describe('Backup persistence', () => {
    const testRoot = '/tmp/mcp-v2_1-backup-test';

    beforeEach(async () => {
      (config as any).fs.allowedRoot = testRoot;
      await fs.mkdir(testRoot, { recursive: true });
      getMemoryStore().clear();
      clearVectorStore();
      // clear backup file
      try {
        await fs.unlink(path.join(testRoot, '.backup.json'));
      } catch {}
    });

    afterEach(async () => {
      try {
        await fs.rm(testRoot, { recursive: true, force: true });
      } catch {}
      getMemoryStore().clear();
      clearVectorStore();
    });

    it('save and load backup', async () => {
      getMemoryStore().set('k1', 'v1');
      getMemoryStore().set('k2', 'v2');
      // ingest a rag doc
      getVectorStore().set('doc1', {
        id: 'doc1',
        text: 'hello backup',
        vector: [0.1, 0.2],
        metadata: {},
        createdAt: new Date().toISOString(),
      } as any);

      await saveBackup();
      // verify file exists
      const content = await fs.readFile(path.join(testRoot, '.backup.json'), 'utf-8');
      const data = JSON.parse(content);
      expect(data.memory.length).toBe(2);
      expect(data.rag.length).toBe(1);

      // clear and load
      getMemoryStore().clear();
      clearVectorStore();
      expect(getMemoryStore().size).toBe(0);
      await loadBackup();
      expect(getMemoryStore().get('k1')).toBe('v1');
      expect(getVectorStore().get('doc1')?.text).toBe('hello backup');
    });

    it('backup via tools triggers scheduleSave', async () => {
      // Use rag_ingest which calls scheduleSave
      const { createMcpServer } = await import('../src/server.js');
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
      const server = createMcpServer();
      const client = new Client({ name: 'backup-test', version: '1.0.0' });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      await Promise.all([client.connect(ct), server.connect(st)]);

      await client.callTool({ name: 'memory_set', arguments: { key: 'bk', value: 'val' } });
      // wait for scheduled save (500ms debounce)
      await new Promise(r => setTimeout(r, 600));
      const content = await fs
        .readFile(path.join(testRoot, '.backup.json'), 'utf-8')
        .catch(() => null);
      expect(content).toBeTruthy();
      if (content) {
        const data = JSON.parse(content);
        expect(data.memory.some((m: any) => m[0] === 'bk')).toBe(true);
      }
    });
  });

  describe('OTEL real init', () => {
    it('initOtel returns null when disabled', async () => {
      const orig = (config as any).otel.enabled;
      (config as any).otel.enabled = false;
      const { initOtel } = await import('../src/observability/otel-real.js');
      const res = await initOtel();
      expect(res).toBeNull();
      (config as any).otel.enabled = orig;
    });

    it('initOtel fallback when enabled but deps maybe missing', async () => {
      const orig = (config as any).otel.enabled;
      (config as any).otel.enabled = true;
      const { initOtel } = await import('../src/observability/otel-real.js');
      // This will try to import OTEL deps which are installed, so it may succeed or fallback
      // We just check it doesn't throw
      const res = await initOtel();
      // Could be object with shutdown or null if fallback
      expect(res === null || typeof res === 'object').toBe(true);
      if (res && (res as any).shutdown) {
        await (res as any).shutdown().catch(() => {});
      }
      (config as any).otel.enabled = orig;
    });
  });
});
