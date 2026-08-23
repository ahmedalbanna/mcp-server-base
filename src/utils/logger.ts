/**
 * Structured logger - writes to stderr so it doesn't interfere with stdio transport (stdout)
 * Phase 2: JSON mode, requestId correlation, secrets redaction
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLevel(): LogLevel {
  const lvl = (process.env.LOG_LEVEL as LogLevel) || 'info';
  return LOG_LEVELS[lvl] !== undefined ? lvl : 'info';
}

function getFormat(): 'text' | 'json' {
  const f = process.env.LOG_FORMAT as string;
  return f === 'json' ? 'json' : 'text';
}

const SECRET_KEYS = new Set([
  'authorization',
  'api_key',
  'apikey',
  'apiKey',
  'token',
  'bearer',
  'password',
  'secret',
  'x-api-key',
]);

function redact(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // redact Bearer tokens in strings
    if (/bearer\s+/i.test(obj)) return '[REDACTED]';
    if (obj.length > 20 && /^[A-Za-z0-9_-]{20,}$/.test(obj)) return '[REDACTED]';
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(redact);
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (SECRET_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return obj;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getLevel()];
}

function format(level: LogLevel, message: string, meta?: unknown, requestId?: string) {
  const timestamp = new Date().toISOString();
  if (getFormat() === 'json') {
    const payload: Record<string, unknown> = {
      timestamp,
      level,
      message,
      ...(requestId ? { requestId } : {}),
      ...(meta !== undefined ? { meta: redact(meta) } : {}),
    };
    return JSON.stringify(payload);
  }
  const base = `[${timestamp}] [${level.toUpperCase()}]${requestId ? ` [${requestId}]` : ''} ${message}`;
  return meta !== undefined ? `${base} ${JSON.stringify(redact(meta))}` : base;
}

export type Logger = {
  debug: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
  child: (opts: { requestId: string }) => Logger;
};

function createLogger(requestId?: string): Logger {
  return {
    debug: (msg: string, meta?: unknown) => {
      if (shouldLog('debug')) console.error(format('debug', msg, meta, requestId));
    },
    info: (msg: string, meta?: unknown) => {
      if (shouldLog('info')) console.error(format('info', msg, meta, requestId));
    },
    warn: (msg: string, meta?: unknown) => {
      if (shouldLog('warn')) console.error(format('warn', msg, meta, requestId));
    },
    error: (msg: string, meta?: unknown) => {
      console.error(format('error', msg, meta, requestId));
    },
    child: (opts: { requestId: string }) => createLogger(opts.requestId),
  };
}

export const logger = createLogger();
