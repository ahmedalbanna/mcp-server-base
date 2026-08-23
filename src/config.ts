import 'dotenv/config';

export const config = {
  server: {
    name: process.env.MCP_SERVER_NAME || 'mcp-server-base',
    version: process.env.MCP_SERVER_VERSION || '1.0.0',
    description: 'Strong base MCP Server - Production ready',
  },
  http: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },
  env: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
  isDev: process.env.NODE_ENV !== 'production',
} as const;
