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

// Per-tool RBAC mapping
const TOOL_ROLES: Record<string, Role> = {
  // reader (read-only)
  echo: 'reader',
  calculator: 'reader',
  get_time: 'reader',
  fetch_url: 'reader',
  list_files: 'reader',
  read_file: 'reader',
  search_files: 'reader',
  memory_get: 'reader',
  memory_list: 'reader',
  database_tables: 'reader',
  rag_search: 'reader',
  rag_list: 'reader',
  brave_search: 'reader',
  tavily_search: 'reader',
  web_fetch: 'reader',
  github_search_repos: 'reader',
  github_get_repo: 'reader',
  github_get_issue: 'reader',
  get_task: 'reader',
  get_task_result: 'reader',
  // writer (read + write)
  write_file: 'writer',
  memory_set: 'writer',
  memory_delete: 'writer',
  memory_clear: 'writer',
  database_query: 'writer',
  rag_ingest: 'writer',
  rag_clear: 'writer',
  create_task: 'writer',
  collect_user_info: 'writer',
  generate_with_sampling: 'writer',
  // admin only
  shell_execute: 'admin',
};

export function getRequiredRoleForTool(toolName: string): Role {
  return TOOL_ROLES[toolName] || 'writer';
}

export function mcpRbacMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only enforce for tools/call
  const body: any = (req as any).body;
  if (body?.method === 'tools/call' && body?.params?.name) {
    const toolName: string = body.params.name;
    const required = getRequiredRoleForTool(toolName);
    const role = getRoleFromRequest(req);
    if (ROLE_RANK[role] < ROLE_RANK[required]) {
      res.status(403).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: `Forbidden: tool ${toolName} requires ${required}, got ${role}`,
        },
        id: body.id ?? null,
      });
      return;
    }
  }
  next();
}

// For tests
export function hasRole(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}
