/**
 * Multi-tenant middleware + namespaced stores (v3.0)
 * - X-Tenant-Id header (or ?tenant= query) identifies tenant
 * - TENANT_REQUIRED=true rejects requests without tenant
 * - Tenant-scoped memory store: getTenantMemory(tenantId)
 */
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

export const DEFAULT_TENANT = 'default';

export function extractTenantId(req: Request): string {
  return ((req.headers['x-tenant-id'] as string) || (req.query?.tenant as string) || '').trim();
}

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const tenantId = extractTenantId(req) || DEFAULT_TENANT;
  if (config.tenant.required && !extractTenantId(req)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: X-Tenant-Id header required' },
      id: null,
    });
    return;
  }
  req.tenantId = tenantId;
  next();
}

// Tenant-scoped memory stores: Map<tenantId, Map<key, value>>
const tenantMemories = new Map<string, Map<string, string>>();

export function getTenantMemory(tenantId: string | undefined): Map<string, string> {
  const tid = tenantId || DEFAULT_TENANT;
  let store = tenantMemories.get(tid);
  if (!store) {
    store = new Map<string, string>();
    tenantMemories.set(tid, store);
  }
  return store;
}

export function listTenants(): string[] {
  return [...tenantMemories.keys()];
}

export function clearTenantMemories(): void {
  tenantMemories.clear();
}

// Namespaced cache keys for shared cache (Redis in prod)
export function tenantCacheKey(tenantId: string | undefined, key: string): string {
  return `tenant:${tenantId || DEFAULT_TENANT}:${key}`;
}

// Tenant registry (control plane backing store)
export type Tenant = {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  apiKey?: string;
  createdAt: string;
  rateLimitMax?: number;
};

const tenants = new Map<string, Tenant>();

export function getTenantRegistry(): Map<string, Tenant> {
  return tenants;
}

export function createTenant(input: {
  id: string;
  name: string;
  plan?: Tenant['plan'];
  apiKey?: string;
}): Tenant {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(input.id)) {
    throw new Error('Invalid tenant id: must match [a-zA-Z0-9_-]{1,64}');
  }
  if (tenants.has(input.id)) {
    throw new Error(`Tenant ${input.id} already exists`);
  }
  const tenant: Tenant = {
    id: input.id,
    name: input.name || input.id,
    plan: input.plan || 'free',
    apiKey: input.apiKey,
    createdAt: new Date().toISOString(),
  };
  tenants.set(input.id, tenant);
  logger.info('tenant created', { id: tenant.id, plan: tenant.plan });
  return tenant;
}

export function deleteTenant(id: string): boolean {
  const existed = tenants.delete(id);
  if (existed) {
    tenantMemories.delete(id);
    logger.info('tenant deleted', { id });
  }
  return existed;
}
