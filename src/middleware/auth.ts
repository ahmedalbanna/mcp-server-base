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

    if (mode === 'oidc') {
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized: Missing Bearer token (OIDC)' },
          id: null,
        });
        return;
      }
      const token = auth.slice(7);
      const claims = verifyOidcToken(token);
      if (!claims) {
        res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized: Invalid OIDC token' },
          id: null,
        });
        return;
      }
      (req as any).oidcClaims = claims;
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

/**
 * OIDC JWT verification (v3.0)
 * Structural validation without signature check (demo):
 * - 3-part JWT, valid base64 payload
 * - exp not expired
 * - iss matches OIDC_ISSUER when configured
 * - aud matches OIDC_AUDIENCE when configured
 * Production: verify signature via JWKS from `${issuer}/.well-known/openid-configuration`
 */
export type OidcClaims = {
  sub?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  [k: string]: unknown;
};

export function verifyOidcToken(token: string): OidcClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as OidcClaims;
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    if (config.auth.oidcIssuer && payload.iss !== config.auth.oidcIssuer) return null;
    if (config.auth.oidcAudience && payload.aud !== config.auth.oidcAudience) return null;
    return payload;
  } catch {
    return null;
  }
}
