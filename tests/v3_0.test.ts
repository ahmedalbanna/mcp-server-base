import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHttpApp } from '../src/index.js';
import { config, parseEnv } from '../src/config.js';
import {
  getTenantMemory,
  getTenantRegistry,
  clearTenantMemories,
  tenantCacheKey,
  extractTenantId,
} from '../src/middleware/tenant.js';
import { verifyOidcToken } from '../src/middleware/auth.js';
import type { Request } from 'express';

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function makeJwt(claims: Record<string, unknown>): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.sig`;
}

async function startApp() {
  const { app } = createHttpApp();
  const server = await new Promise<any>(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://localhost:${(server.address() as any).port}`;
  return { server, base, close: () => new Promise<void>(r => server.close(() => r())) };
}

describe('v3.0 Scale & Enterprise', () => {
  describe('Multi-tenant middleware', () => {
    it('extractTenantId from header and query', () => {
      expect(extractTenantId({ headers: { 'x-tenant-id': 'acme' } } as unknown as Request)).toBe(
        'acme'
      );
      expect(
        extractTenantId({ headers: {}, query: { tenant: 'beta' } } as unknown as Request)
      ).toBe('beta');
      expect(extractTenantId({ headers: {} } as unknown as Request)).toBe('');
    });

    it('tenant-scoped memory isolation', () => {
      clearTenantMemories();
      getTenantMemory('acme').set('key', 'from-acme');
      getTenantMemory('beta').set('key', 'from-beta');
      expect(getTenantMemory('acme').get('key')).toBe('from-acme');
      expect(getTenantMemory('beta').get('key')).toBe('from-beta');
      expect(getTenantMemory('acme').size).toBe(1);
      // default tenant separate
      getTenantMemory(undefined).set('k', 'default-val');
      expect(getTenantMemory('default').get('k')).toBe('default-val');
      clearTenantMemories();
    });

    it('tenantCacheKey namespacing', () => {
      expect(tenantCacheKey('acme', 'fetch:url')).toBe('tenant:acme:fetch:url');
      expect(tenantCacheKey(undefined, 'k')).toBe('tenant:default:k');
    });

    it('X-Tenant-Id required when TENANT_REQUIRED=true', async () => {
      const orig = (config as any).tenant.required;
      (config as any).tenant.required = true;
      const { close, base } = await startApp();
      try {
        const noTenant = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        expect(noTenant.status).toBe(400);
        const body: any = await noTenant.json();
        expect(body.error.message).toContain('X-Tenant-Id');

        const withTenant = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'acme' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
        });
        expect(withTenant.status).not.toBe(400);
      } finally {
        (config as any).tenant.required = orig;
        await close();
      }
    });

    it('tenant not required by default', async () => {
      const orig = (config as any).tenant.required;
      (config as any).tenant.required = false;
      const { close, base } = await startApp();
      try {
        const res = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        expect(res.status).not.toBe(400);
      } finally {
        (config as any).tenant.required = orig;
        await close();
      }
    });
  });

  describe('OIDC SSO auth', () => {
    const origMode = (config as any).auth.mode;

    afterEach(() => {
      (config as any).auth.mode = origMode;
      (config as any).auth.oidcIssuer = undefined;
      (config as any).auth.oidcAudience = undefined;
    });

    it('verifyOidcToken structural validation', () => {
      const now = Math.floor(Date.now() / 1000);
      const valid = makeJwt({ sub: 'user1', exp: now + 3600 });
      expect(verifyOidcToken(valid)?.sub).toBe('user1');

      // expired
      const expired = makeJwt({ sub: 'u', exp: now - 100 });
      expect(verifyOidcToken(expired)).toBeNull();

      // malformed
      expect(verifyOidcToken('not-a-jwt')).toBeNull();
      expect(verifyOidcToken('a.b')).toBeNull();
    });

    it('issuer/audience checks', () => {
      const now = Math.floor(Date.now() / 1000);
      (config as any).auth.oidcIssuer = 'https://sso.example.com';
      (config as any).auth.oidcAudience = 'mcp-server';

      const good = makeJwt({ iss: 'https://sso.example.com', aud: 'mcp-server', exp: now + 600 });
      expect(verifyOidcToken(good)).not.toBeNull();

      const badIss = makeJwt({ iss: 'https://evil.com', aud: 'mcp-server', exp: now + 600 });
      expect(verifyOidcToken(badIss)).toBeNull();

      const badAud = makeJwt({ iss: 'https://sso.example.com', aud: 'other', exp: now + 600 });
      expect(verifyOidcToken(badAud)).toBeNull();
    });

    it('AUTH_MODE=oidc via HTTP', async () => {
      (config as any).auth.mode = 'oidc';
      const now = Math.floor(Date.now() / 1000);
      const goodToken = makeJwt({
        sub: 'alice',
        iss: config.auth.oidcIssuer || '',
        exp: now + 600,
      });
      const badToken = makeJwt({ sub: 'bob', exp: now - 100 });

      const { close, base } = await startApp();
      try {
        const noAuth = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        expect(noAuth.status).toBe(401);

        const withBad = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${badToken}` },
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
        });
        expect(withBad.status).toBe(401);

        const withGood = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${goodToken}` },
          body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }),
        });
        expect(withGood.status).not.toBe(401);
      } finally {
        await close();
      }
    });

    it('oidc accepted in env validation', () => {
      const env = parseEnv({ AUTH_MODE: 'oidc' });
      expect(env.AUTH_MODE).toBe('oidc');
    });
  });

  describe('Control plane CRUD', () => {
    beforeEach(() => {
      getTenantRegistry().clear();
      clearTenantMemories();
    });
    afterEach(() => {
      getTenantRegistry().clear();
      clearTenantMemories();
    });

    it('create/list/get/delete tenant lifecycle', async () => {
      const { close, base } = await startApp();
      try {
        // create
        let res = await fetch(`${base}/admin/tenants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'acme', name: 'Acme Corp', plan: 'pro' }),
        });
        expect(res.status).toBe(201);
        const created: any = await res.json();
        expect(created.id).toBe('acme');
        expect(created.plan).toBe('pro');

        // duplicate -> 409
        res = await fetch(`${base}/admin/tenants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'acme', name: 'dup' }),
        });
        expect(res.status).toBe(409);

        // invalid id -> 400
        res = await fetch(`${base}/admin/tenants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'bad id!', name: 'x' }),
        });
        expect(res.status).toBe(400);

        // list
        res = await fetch(`${base}/admin/tenants`);
        let list: any = await res.json();
        expect(list.count).toBe(1);

        // get
        res = await fetch(`${base}/admin/tenants/acme`);
        expect(res.status).toBe(200);
        const got: any = await res.json();
        expect(got.name).toBe('Acme Corp');

        // update
        res = await fetch(`${base}/admin/tenants/acme`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: 'enterprise' }),
        });
        const updated: any = await res.json();
        expect(updated.plan).toBe('enterprise');

        // delete
        res = await fetch(`${base}/admin/tenants/acme`, { method: 'DELETE' });
        expect(res.status).toBe(200);
        list = await (await fetch(`${base}/admin/tenants`)).json();
        expect(list.count).toBe(0);

        // get missing -> 404
        res = await fetch(`${base}/admin/tenants/acme`);
        expect(res.status).toBe(404);
      } finally {
        await close();
      }
    });

    it('rotate-key', async () => {
      const { close, base } = await startApp();
      try {
        await fetch(`${base}/admin/tenants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'rot' }),
        });
        const res = await fetch(`${base}/admin/tenants/rot/rotate-key`, { method: 'POST' });
        const body: any = await res.json();
        expect(body.apiKey).toMatch(/^ak_/);
      } finally {
        await close();
      }
    });

    it('tenant store inspection endpoint', async () => {
      const { close, base } = await startApp();
      try {
        await fetch(`${base}/admin/tenants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'storetest' }),
        });
        getTenantMemory('storetest').set('k', 'v');
        const res = await fetch(`${base}/admin/tenants/storetest/store`);
        const body: any = await res.json();
        expect(body.tenant).toBe('storetest');
        expect(body.keys).toContain('k');
      } finally {
        await close();
      }
    });

    it('control plane disabled returns 404', async () => {
      const origEnabled = (config as any).admin.enabled;
      (config as any).admin.enabled = false;
      const { close, base } = await startApp();
      try {
        const res = await fetch(`${base}/admin/tenants`);
        expect(res.status).toBe(404);
      } finally {
        (config as any).admin.enabled = origEnabled;
        await close();
      }
    });
  });

  describe('Runtime scale (cluster)', () => {
    it('cluster module exists, initCluster no-ops when CLUSTER_MODE=false', async () => {
      const orig = (config as any).cluster.enabled;
      (config as any).cluster.enabled = false;
      const { initCluster } = await import('../src/utils/cluster.js');
      let booted = false;
      // When disabled: returns false (caller boots itself), callback NOT invoked here
      const handled = initCluster(() => {
        booted = true;
      });
      expect(handled).toBe(false);
      expect(booted).toBe(false);
      (config as any).cluster.enabled = orig;
    });

    it('compose has prometheus/grafana services', async () => {
      const fs = await import('node:fs/promises');
      const content = await fs.readFile('docker-compose.override.yml', 'utf-8');
      expect(content).toContain('prometheus');
      expect(content).toContain('grafana');
      const promCfg = await fs.readFile('prometheus.yml', 'utf-8');
      expect(promCfg).toContain('/metrics');
    });
  });
});
