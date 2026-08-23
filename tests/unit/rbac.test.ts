import { describe, it, expect } from 'vitest';
import { hasRole, getRoleFromRequest } from '../../src/middleware/rbac.js';
import type { Request } from 'express';

describe('RBAC stub (v2.1)', () => {
  it('hasRole ranking', () => {
    expect(hasRole('admin', 'reader')).toBe(true);
    expect(hasRole('writer', 'reader')).toBe(true);
    expect(hasRole('reader', 'writer')).toBe(false);
    expect(hasRole('reader', 'admin')).toBe(false);
    expect(hasRole('admin', 'admin')).toBe(true);
  });

  it('getRoleFromRequest defaults to reader', () => {
    const req = { headers: {} } as unknown as Request;
    expect(getRoleFromRequest(req)).toBe('reader');
  });

  it('getRoleFromRequest reads X-Role', () => {
    const req = { headers: { 'x-role': 'admin' } } as unknown as Request;
    expect(getRoleFromRequest(req)).toBe('admin');
  });

  it('getRoleFromRequest invalid falls back', () => {
    const req = { headers: { 'x-role': 'superuser' } } as unknown as Request;
    expect(getRoleFromRequest(req)).toBe('reader');
  });
});
