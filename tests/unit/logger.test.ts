import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../../src/utils/logger.js';

describe('logger', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
    delete process.env.LOG_FORMAT;
    delete process.env.LOG_LEVEL;
  });

  it('logs info and warn/error to stderr', () => {
    logger.info('test info', { a: 1 });
    logger.warn('test warn');
    logger.error('test error', { err: 'x' });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls[0][0]).toContain('test info');
  });

  it('respects LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'error';
    // need to re-import? logger reads env dynamically via getLevel()
    logger.debug('debug should not log');
    expect(spy).not.toHaveBeenCalled();
    logger.error('error should log');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('redacts secrets', () => {
    process.env.LOG_FORMAT = 'text';
    logger.info('with secret', { apiKey: 'supersecret1234567890', user: 'alice' });
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('supersecret1234567890');
  });

  it('redacts Bearer string', () => {
    logger.info('auth', { authorization: 'Bearer abcdef12345' });
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain('[REDACTED]');
  });

  it('supports json format', () => {
    process.env.LOG_FORMAT = 'json';
    logger.info('json test', { foo: 'bar' });
    const output = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('json test');
    expect(parsed.meta).toBeDefined();
  });

  it('supports child logger with requestId', () => {
    process.env.LOG_FORMAT = 'json';
    const child = logger.child({ requestId: 'req-123' });
    child.info('child log');
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain('req-123');
  });

  it('redacts nested secrets', () => {
    logger.info('nested', { outer: { token: 'secretvalue1234567890' } });
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain('[REDACTED]');
  });
});
