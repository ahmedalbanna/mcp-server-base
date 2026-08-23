import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform(val => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(65535)),
  HOST: z.string().default('0.0.0.0'),
  MCP_SERVER_NAME: z.string().default('mcp-server-base'),
  MCP_SERVER_VERSION: z.string().default('1.0.0'),
  CORS_ORIGIN: z.string().default('*'),
  AUTH_MODE: z.enum(['none', 'apiKey', 'bearer']).default('none'),
  API_KEY: z.string().optional(),
  BEARER_TOKEN: z.string().optional(),
  AUTH_TOKEN: z.string().optional(), // alias for BEARER_TOKEN
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('900000') // 15 min
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().positive()),
  RATE_LIMIT_MAX: z
    .string()
    .default('100')
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().positive()),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['text', 'json']).default('text'),
  RESUMABILITY_ENABLED: z
    .string()
    .default('false')
    .transform(v => v === 'true' || v === '1'),
  // Phase 3
  ALLOWED_ROOT: z.string().default('/tmp/mcp-data'),
  ALLOW_SHELL: z
    .string()
    .default('false')
    .transform(v => v === 'true' || v === '1'),
  SHELL_ALLOWLIST: z.string().default('ls,cat,echo,pwd,head,tail,grep'),
  DATABASE_PATH: z.string().default(':memory:'),
});

function parseEnv(
  raw: Record<string, string | undefined> = process.env as Record<string, string | undefined>
) {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  const env = parsed.data;

  // Cross-field validation
  if (env.AUTH_MODE === 'apiKey' && !env.API_KEY) {
    throw new Error('API_KEY is required when AUTH_MODE=apiKey');
  }
  if (env.AUTH_MODE === 'bearer' && !env.BEARER_TOKEN && !env.AUTH_TOKEN) {
    throw new Error('BEARER_TOKEN or AUTH_TOKEN is required when AUTH_MODE=bearer');
  }

  return env;
}

// Parsed once at import; for tests that need custom env, use parseEnv directly
const env = parseEnv();

function parseCorsOrigin(origin: string): string | string[] {
  if (origin === '*') return '*';
  return origin
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export const config = {
  env: env.NODE_ENV,
  isDev: env.NODE_ENV !== 'production',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  server: {
    name: env.MCP_SERVER_NAME,
    version: env.MCP_SERVER_VERSION,
    description: 'Strong base MCP Server - Production ready',
  },
  http: {
    port: env.PORT,
    host: env.HOST,
    corsOrigin: parseCorsOrigin(env.CORS_ORIGIN) as string | string[],
    corsOriginRaw: env.CORS_ORIGIN,
  },
  auth: {
    mode: env.AUTH_MODE,
    apiKey: env.API_KEY,
    bearerToken: env.BEARER_TOKEN || env.AUTH_TOKEN,
  },
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
  },
  logging: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT,
  },
  resumability: {
    enabled: env.RESUMABILITY_ENABLED,
  },
  fs: {
    allowedRoot: env.ALLOWED_ROOT,
  },
  shell: {
    allowed: env.ALLOW_SHELL,
    allowlist: env.SHELL_ALLOWLIST.split(',')
      .map(s => s.trim())
      .filter(Boolean),
  },
  database: {
    path: env.DATABASE_PATH,
  },
  // expose raw env for advanced use
  _env: env,
} as const;

export { parseEnv, envSchema };
