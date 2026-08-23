import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { config } from '../../src/config.js';

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    path: '/mcp',
    method: 'POST',
    headers: {},
    query: {},
    ...overrides,
  } as unknown as Request;
  let statusCode: number | null = null;
  let jsonBody: any = null;
  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (body: any) => {
      jsonBody = body;
      return res;
    },
    getStatus: () => statusCode,
    getJson: () => jsonBody,
  } as unknown as Response & { getStatus: () => number | null; getJson: () => any };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };
  return { req, res, next, getNextCalled: () => nextCalled };
}

describe('auth middleware', () => {
  let originalMode: string;
  let originalApiKey: string | undefined;
  let originalToken: string | undefined;

  beforeEach(() => {
    originalMode = (config as any).auth.mode;
    originalApiKey = (config as any).auth.apiKey;
    originalToken = (config as any).auth.bearerToken;
  });
  afterEach(() => {
    (config as any).auth.mode = originalMode;
    (config as any).auth.apiKey = originalApiKey;
    (config as any).auth.bearerToken = originalToken;
  });

  it('allows health without auth', () => {
    (config as any).auth.mode = 'apiKey';
    (config as any).auth.apiKey = 'secret';
    const { req, res, next, getNextCalled } = mockReqRes({ path: '/health' });
    const mw = createAuthMiddleware();
    mw(req, res, next);
    expect(getNextCalled()).toBe(true);
  });

  it('allows when mode none', () => {
    (config as any).auth.mode = 'none';
    const { req, res, next, getNextCalled } = mockReqRes();
    createAuthMiddleware()(req, res, next);
    expect(getNextCalled()).toBe(true);
  });

  it('rejects apiKey missing', () => {
    (config as any).auth.mode = 'apiKey';
    (config as any).auth.apiKey = 'correct-key';
    const mRes = mockReqRes({ headers: {} });
    createAuthMiddleware()(mRes.req, mRes.res, mRes.next);
    expect(mRes.res.getStatus()).toBe(401);
    expect(mRes.getNextCalled()).toBe(false);
  });

  it('accepts valid x-api-key', () => {
    (config as any).auth.mode = 'apiKey';
    (config as any).auth.apiKey = 'valid123';
    const { req, res, next, getNextCalled } = mockReqRes({
      headers: { 'x-api-key': 'valid123' },
    });
    createAuthMiddleware()(req, res, next);
    expect(getNextCalled()).toBe(true);
  });

  it('rejects invalid x-api-key', () => {
    (config as any).auth.mode = 'apiKey';
    (config as any).auth.apiKey = 'valid123';
    const { req, res, next, getNextCalled } = mockReqRes({
      headers: { 'x-api-key': 'wrong' },
    });
    createAuthMiddleware()(req, res, next);
    expect((res as any).getStatus()).toBe(401);
    expect(getNextCalled()).toBe(false);
  });

  it('bearer mode rejects missing header', () => {
    (config as any).auth.mode = 'bearer';
    (config as any).auth.bearerToken = 'tok123';
    const { req, res, next } = mockReqRes({ headers: {} });
    createAuthMiddleware()(req, res, next);
    expect((res as any).getStatus()).toBe(401);
  });

  it('bearer mode accepts valid token', () => {
    (config as any).auth.mode = 'bearer';
    (config as any).auth.bearerToken = 'mytoken';
    const { req, res, next, getNextCalled } = mockReqRes({
      headers: { authorization: 'Bearer mytoken' },
    });
    createAuthMiddleware()(req, res, next);
    expect(getNextCalled()).toBe(true);
  });

  it('bearer mode rejects invalid token', () => {
    (config as any).auth.mode = 'bearer';
    (config as any).auth.bearerToken = 'mytoken';
    const { req, res, next } = mockReqRes({
      headers: { authorization: 'Bearer wrong' },
    });
    createAuthMiddleware()(req, res, next);
    expect((res as any).getStatus()).toBe(401);
  });

  it('allows OPTIONS preflight without auth', () => {
    (config as any).auth.mode = 'bearer';
    (config as any).auth.bearerToken = 'tok';
    const { req, res, next, getNextCalled } = mockReqRes({ method: 'OPTIONS' });
    createAuthMiddleware()(req, res, next);
    expect(getNextCalled()).toBe(true);
  });
});
