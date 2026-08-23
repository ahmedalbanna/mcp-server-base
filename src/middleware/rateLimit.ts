import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

export function createMcpRateLimiter() {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Too many requests, please try again later.' },
      id: null,
    },
    // Do not count health checks
    skip: req => req.path === '/health' || req.path === '/ready',
  });
}

// Stricter limiter for testing / demonstrate per-route
export function createTestRateLimiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Too many requests' },
      id: null,
    },
  });
}
