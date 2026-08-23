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
  MCP_SERVER_VERSION: z.string().default('2.2.0'),
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
  // Phase 4
  BRAVE_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  REDIS_URL: z.string().optional(),
  QDRANT_URL: z.string().optional(),
  CACHE_TTL_MS: z
    .string()
    .default('300000')
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().positive()),
  RAG_CHUNK_SIZE: z
    .string()
    .default('500')
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().positive()),
  RAG_CHUNK_OVERLAP: z
    .string()
    .default('50')
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().min(0)),
  // Phase 5
  OTEL_ENABLED: z
    .string()
    .default('false')
    .transform(v => v === 'true' || v === '1'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  ADMIN_ENABLED: z
    .string()
    .default('true')
    .transform(v => v === 'true' || v === '1'),
  ADMIN_TOKEN: z.string().optional(),
  TASKS_ENABLED: z
    .string()
    .default('false')
    .transform(v => v === 'true' || v === '1'),
  EVENT_STORE_TYPE: z.enum(['memory', 'redis']).default('memory'),
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
  rag: {
    chunkSize: env.RAG_CHUNK_SIZE,
    chunkOverlap: env.RAG_CHUNK_OVERLAP,
  },
  cache: {
    ttlMs: env.CACHE_TTL_MS,
    redisUrl: env.REDIS_URL,
  },
  integrations: {
    braveApiKey: env.BRAVE_API_KEY,
    tavilyApiKey: env.TAVILY_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    githubToken: env.GITHUB_TOKEN,
    qdrantUrl: env.QDRANT_URL,
  },
  otel: {
    enabled: env.OTEL_ENABLED,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  },
  admin: {
    enabled: env.ADMIN_ENABLED,
    token: env.ADMIN_TOKEN,
  },
  tasks: {
    enabled: env.TASKS_ENABLED,
  },
  eventStore: {
    type: env.EVENT_STORE_TYPE,
  },
  // expose raw env for advanced use
  _env: env,
} as const;

export { parseEnv, envSchema };
