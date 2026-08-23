/**
 * RBAC stub for v2.1 (Phase 5 next)
 * Roles: reader < writer < admin
 * Usage in future: app.use('/mcp', rbacMiddleware('writer'))
 */
import type { Request, Response, NextFunction } from 'express';

export type Role = 'reader' | 'writer' | 'admin';

const ROLE_RANK: Record<Role, number> = { reader: 1, writer: 2, admin: 3 };

export function getRoleFromRequest(req: Request): Role {
  // Stub: derive from header X-Role or JWT claim; default reader
  const headerRole = req.headers['x-role'] as string as Role | undefined;
  if (headerRole && ROLE_RANK[headerRole]) return headerRole;
  // In production: decode JWT from Authorization bearer and read claim
  return 'reader';
}

export function rbacMiddleware(required: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = getRoleFromRequest(req);
    if (ROLE_RANK[role] < ROLE_RANK[required]) {
      res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: `Forbidden: requires ${required}, got ${role}` },
        id: null,
      });
      return;
    }
    next();
  };
}

// For tests
export function hasRole(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}
