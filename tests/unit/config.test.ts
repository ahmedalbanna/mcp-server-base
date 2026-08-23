import { describe, it, expect } from 'vitest';
import { parseEnv, config } from '../../src/config.js';

describe('config zod validation', () => {
  it('parses defaults', () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.AUTH_MODE).toBe('none');
    expect(env.RATE_LIMIT_MAX).toBe(100);
    expect(env.LOG_FORMAT).toBe('text');
  });

  it('parses custom values', () => {
    const env = parseEnv({
      PORT: '4000',
      AUTH_MODE: 'apiKey',
      API_KEY: 'secret123',
      CORS_ORIGIN: 'https://example.com,https://foo.com',
      RATE_LIMIT_MAX: '50',
      RESUMABILITY_ENABLED: 'true',
    });
    expect(env.PORT).toBe(4000);
    expect(env.AUTH_MODE).toBe('apiKey');
    expect(env.API_KEY).toBe('secret123');
    expect(env.RESUMABILITY_ENABLED).toBe(true);
  });

  it('throws on invalid PORT', () => {
    expect(() => parseEnv({ PORT: 'not-a-number' } as any)).toThrow();
  });

  it('throws on invalid AUTH_MODE', () => {
    expect(() => parseEnv({ AUTH_MODE: 'invalid' } as any)).toThrow();
  });

  it('throws when apiKey mode without API_KEY', () => {
    expect(() => parseEnv({ AUTH_MODE: 'apiKey' })).toThrow(/API_KEY/);
  });

  it('throws when bearer mode without token', () => {
    expect(() => parseEnv({ AUTH_MODE: 'bearer' })).toThrow(/BEARER_TOKEN/);
  });

  it('accepts bearer with AUTH_TOKEN alias', () => {
    const env = parseEnv({ AUTH_MODE: 'bearer', AUTH_TOKEN: 'tok123' });
    expect(env.BEARER_TOKEN || env.AUTH_TOKEN).toBeDefined();
  });

  it('parses CORS_ORIGIN', () => {
    expect(config.http.corsOrigin).toBeDefined();
    // also test parse with custom origin
    const env = parseEnv({ CORS_ORIGIN: 'https://a.com,https://b.com' });
    expect(env.CORS_ORIGIN).toBe('https://a.com,https://b.com');
  });
});
