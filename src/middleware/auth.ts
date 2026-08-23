import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export function createAuthMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Allow health checks without auth
    if (req.path === '/health' || req.path === '/ready') {
      next();
      return;
    }

    // Skip auth for OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    const mode = config.auth.mode;

    if (mode === 'none') {
      next();
      return;
    }

    if (mode === 'apiKey') {
      const apiKey = (req.headers['x-api-key'] as string) || (req.query.api_key as string);
      if (!apiKey || apiKey !== config.auth.apiKey) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized: Invalid API key' },
          id: null,
        });
        return;
      }
      next();
      return;
    }

    if (mode === 'bearer') {
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized: Missing Bearer token' },
          id: null,
        });
        return;
      }
      const token = auth.slice(7);
      const expected = config.auth.bearerToken;
      // Use timing-safe comparison if possible
      if (!expected || token !== expected) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized: Invalid token' },
          id: null,
        });
        return;
      }
      next();
      return;
    }

    // Unknown mode — deny
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Server auth misconfigured' },
      id: null,
    });
  };
}
