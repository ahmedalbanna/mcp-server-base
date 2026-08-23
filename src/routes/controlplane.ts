/**
 * Control Plane API (v3.0)
 * CRUD for tenants + API keys, mounted at /admin/tenants (admin-protected)
 */
import type { Express, Request, Response } from 'express';
import {
  getTenantRegistry,
  createTenant,
  deleteTenant,
  listTenants,
  getTenantMemory,
} from '../middleware/tenant.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

function requireAdminAuth(req: Request, res: Response, next: () => void) {
  if (!config.admin.enabled) {
    res.status(404).json({ error: 'Control plane disabled' });
    return;
  }
  const token = config.admin.token;
  if (token) {
    const provided = (req.headers['x-admin-token'] as string) || (req.query.token as string);
    if (provided !== token) {
      res.status(401).json({ error: 'Unauthorized: invalid admin token' });
      return;
    }
  }
  next();
}

export function registerControlPlaneRoutes(app: Express): void {
  if (!config.admin.enabled) return;

  // List tenants
  app.get('/admin/tenants', requireAdminAuth, (_req: Request, res: Response) => {
    const registry = getTenantRegistry();
    res.json({
      tenants: [...registry.values()],
      count: registry.size,
      activeStores: listTenants(),
    });
  });

  // Create tenant
  app.post('/admin/tenants', requireAdminAuth, (req: Request, res: Response) => {
    try {
      const { id, name, plan, apiKey } = req.body || {};
      if (!id) {
        res.status(400).json({ error: 'id is required' });
        return;
      }
      const tenant = createTenant({ id, name, plan, apiKey });
      res.status(201).json(tenant);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(msg.includes('already exists') ? 409 : 400).json({ error: msg });
    }
  });

  // Get tenant
  app.get('/admin/tenants/:id', requireAdminAuth, (req: Request, res: Response) => {
    const tenant = getTenantRegistry().get(req.params.id as string);
    if (!tenant) {
      res.status(404).json({ error: `Tenant ${req.params.id} not found` });
      return;
    }
    res.json(tenant);
  });

  // Update tenant (name/plan/apiKey)
  app.patch('/admin/tenants/:id', requireAdminAuth, (req: Request, res: Response) => {
    const tenant = getTenantRegistry().get(req.params.id as string);
    if (!tenant) {
      res.status(404).json({ error: `Tenant ${req.params.id} not found` });
      return;
    }
    const { name, plan, apiKey } = req.body || {};
    if (name !== undefined) tenant.name = name;
    if (plan !== undefined) tenant.plan = plan;
    if (apiKey !== undefined) tenant.apiKey = apiKey; // rotate key
    res.json(tenant);
  });

  // Delete tenant
  app.delete('/admin/tenants/:id', requireAdminAuth, (req: Request, res: Response) => {
    const deleted = deleteTenant(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: `Tenant ${req.params.id} not found` });
      return;
    }
    res.json({ deleted: true, id: req.params.id });
  });

  // Tenant store inspection (isolation proof)
  app.get('/admin/tenants/:id/store', requireAdminAuth, (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!getTenantRegistry().has(id) && id !== 'default') {
      res.status(404).json({ error: `Tenant ${id} not found` });
      return;
    }
    const store = getTenantMemory(id);
    res.json({ tenant: id, keys: [...store.keys()].slice(0, 50), size: store.size });
  });

  // Rotate API key
  app.post('/admin/tenants/:id/rotate-key', requireAdminAuth, (req: Request, res: Response) => {
    const tenant = getTenantRegistry().get(req.params.id as string);
    if (!tenant) {
      res.status(404).json({ error: `Tenant ${req.params.id} not found` });
      return;
    }
    tenant.apiKey = `ak_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    logger.info('api key rotated', { tenant: tenant.id });
    res.json({ id: tenant.id, apiKey: tenant.apiKey });
  });

  logger.info('Control plane routes registered at /admin/tenants');
}
