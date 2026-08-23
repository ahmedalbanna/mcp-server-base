import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHttpApp } from '../../src/index.js';
import { config } from '../../src/config.js';
import { createTestRateLimiter } from '../../src/middleware/rateLimit.js';
import express from 'express';

describe('Security HTTP (Phase 2)', () => {
  describe('helmet & requestId & health', () => {
    let server: any;
    let baseUrl: string;

    beforeAll(async () => {
      const { app } = createHttpApp();
      await new Promise<void>(resolve => {
        server = app.listen(0, () => resolve());
      });
      const addr = server.address() as { port: number };
      baseUrl = `http://localhost:${addr.port}`;
    });

    afterAll(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
    });

    it('health returns ok and helmet headers', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      // Helmet headers
      expect(res.headers.get('x-dns-prefetch-control')).toBeTruthy();
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBeTruthy();
      // RequestId
      expect(res.headers.get('x-request-id')).toBeTruthy();
    });

    it('ready returns ready', async () => {
      const res = await fetch(`${baseUrl}/ready`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ready');
    });

    it('GET /mcp returns 405 in stateless mode', async () => {
      const res = await fetch(`${baseUrl}/mcp`);
      expect(res.status).toBe(405);
    });

    it('has X-Request-Id on MCP responses', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      // Even though body invalid for init, we get JSON response with requestId header
      expect(res.headers.get('x-request-id')).toBeTruthy();
    });
  });

  describe('auth middleware via HTTP (apiKey)', () => {
    let server: any;
    let baseUrl: string;
    const originalMode = (config as any).auth.mode;
    const originalKey = (config as any).auth.apiKey;

    beforeAll(async () => {
      (config as any).auth.mode = 'apiKey';
      (config as any).auth.apiKey = 'test-api-key-123';
      const { app } = createHttpApp();
      await new Promise<void>(resolve => {
        server = app.listen(0, () => resolve());
      });
      baseUrl = `http://localhost:${(server.address() as any).port}`;
    });

    afterAll(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
      (config as any).auth.mode = originalMode;
      (config as any).auth.apiKey = originalKey;
    });

    it('health still allowed without key', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
    });

    it('POST /mcp without api key -> 401', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.message).toContain('API key');
    });

    it('POST /mcp with wrong key -> 401', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'wrong' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      });
      expect(res.status).toBe(401);
    });

    it('POST /mcp with correct key -> not 401 (may be 200 or 400 for bad body)', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-api-key-123' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      });
      // Not 401; stateless returns JSON response (might be error for invalid method but not auth)
      expect(res.status).not.toBe(401);
    });
  });

  describe('auth bearer', () => {
    let server: any;
    let baseUrl: string;
    const origMode = (config as any).auth.mode;
    const origToken = (config as any).auth.bearerToken;

    beforeAll(async () => {
      (config as any).auth.mode = 'bearer';
      (config as any).auth.bearerToken = 'bearer-secret-xyz';
      const { app } = createHttpApp();
      await new Promise<void>(resolve => {
        server = app.listen(0, () => resolve());
      });
      baseUrl = `http://localhost:${(server.address() as any).port}`;
    });

    afterAll(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
      (config as any).auth.mode = origMode;
      (config as any).auth.bearerToken = origToken;
    });

    it('without Bearer -> 401', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    it('with wrong Bearer -> 401', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    it('with correct Bearer -> not 401', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bearer-secret-xyz' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
      expect(res.status).not.toBe(401);
    });
  });

  describe('rate limiting', () => {
    it('custom limiter blocks after max', async () => {
      const app = express();
      app.use(express.json());
      app.use('/test', createTestRateLimiter(1000, 2)); // 2 per second
      app.post('/test', (_req, res) => res.json({ ok: true }));

      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;

      const r1 = await fetch(`${base}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const r2 = await fetch(`${base}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const r3 = await fetch(`${base}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(429);

      await new Promise<void>(resolve => server.close(() => resolve()));
    });
  });

  describe('resumability (stateful) mode', () => {
    let server: any;
    let baseUrl: string;
    const origEnabled = (config as any).resumability.enabled;

    beforeAll(async () => {
      (config as any).resumability.enabled = true;
      // ensure auth none for this test
      (config as any).auth.mode = 'none';
      const { app } = createHttpApp();
      await new Promise<void>(resolve => {
        server = app.listen(0, () => resolve());
      });
      baseUrl = `http://localhost:${(server.address() as any).port}`;
    });

    afterAll(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
      (config as any).resumability.enabled = origEnabled;
    });

    it('stateful: POST without session and not initialize -> 400', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });
      expect(res.status).toBe(400);
    });

    it('stateful: GET without session -> 400', async () => {
      const res = await fetch(`${baseUrl}/mcp`);
      expect(res.status).toBe(400);
    });
  });
});
