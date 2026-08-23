/**
 * Structured logger - writes to stderr so it doesn't interfere with stdio transport (stdout)
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function format(level: LogLevel, message: string, meta?: unknown) {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  return meta ? `${base} ${JSON.stringify(meta)}` : base;
}

export const logger = {
  debug: (msg: string, meta?: unknown) => {
    if (shouldLog('debug')) console.error(format('debug', msg, meta));
  },
  info: (msg: string, meta?: unknown) => {
    if (shouldLog('info')) console.error(format('info', msg, meta));
  },
  warn: (msg: string, meta?: unknown) => {
    if (shouldLog('warn')) console.error(format('warn', msg, meta));
  },
  error: (msg: string, meta?: unknown) => {
    console.error(format('error', msg, meta));
  },
};
