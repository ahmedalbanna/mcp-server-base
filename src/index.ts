#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { createMcpServer } from './server.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { InMemoryEventStore } from './utils/eventStore.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { createMcpRateLimiter } from './middleware/rateLimit.js';

const args = process.argv.slice(2);
const useHttp = args.includes('--http') || process.env.TRANSPORT === 'http';

async function startStdio() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`✅ ${config.server.name} v${config.server.version} running on STDIO`);
  logger.info('Waiting for MCP client...');
}

export function createHttpApp() {
  const app = express();

  // Security: Helmet (hidePoweredBy, hsts, noSniff, etc.)
  app.use(helmet());

  // CORS allowlist
  const corsOrigin = config.http.corsOrigin;
  app.use(
    cors({
      origin: corsOrigin === '*' ? '*' : (corsOrigin as string[]),
      credentials: corsOrigin !== '*',
      exposedHeaders: ['X-Request-Id', 'mcp-session-id'],
    })
  );

  // Request ID
  app.use(requestIdMiddleware);

  // Body parser with limit to prevent large payload abuse
  app.use(express.json({ limit: '1mb' }));

  // Rate limiting for MCP endpoint (skip health)
  const rateLimiter = createMcpRateLimiter();
  app.use('/mcp', rateLimiter);

  // Auth middleware for MCP (health/ready are excluded inside)
  const authMiddleware = createAuthMiddleware();
  app.use('/mcp', authMiddleware);

  // Health & readiness (no auth, no rate-limit counted)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', name: config.server.name, version: config.server.version });
  });
  app.get('/ready', (_req, res) => {
    res.json({ status: 'ready', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // Choose transport mode based on config
  if (config.resumability.enabled) {
    // STATEFUL with resumability (eventStore + session map)
    const transports: Record<string, StreamableHTTPServerTransport> = {};
    const eventStore = new InMemoryEventStore();

    app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const reqLogger = logger.child({ requestId: req.requestId || 'unknown' });

      try {
        let transport: StreamableHTTPServerTransport;
        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
          reqLogger.debug('Reusing transport for session', { sessionId });
        } else if (!sessionId && isInitializeRequest(req.body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            eventStore,
            enableJsonResponse: true,
            onsessioninitialized: sessionId => {
              transports[sessionId] = transport;
              reqLogger.info('Session initialized', { sessionId });
            },
          });
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              reqLogger.info('Transport closed', { sessionId: sid });
              delete transports[sid];
            }
          };
          const server = createMcpServer();
          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return;
        } else {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
            id: null,
          });
          return;
        }
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        reqLogger.error('Error handling MCP request', err);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
    });

    app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      const lastEventId = req.headers['last-event-id'] as string | undefined;
      if (lastEventId) {
        logger.info('Client reconnecting with Last-Event-ID', { lastEventId, sessionId });
      }
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    });

    app.delete('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    });

    // Expose for testing/cleanup
    return { app, transports, eventStore };
  }

  // STATELESS (default) - simple per-request, no session storage, 405 for GET/DELETE
  app.post('/mcp', async (req, res) => {
    const reqLogger = logger.child({ requestId: req.requestId || 'unknown' });
    const server = createMcpServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      reqLogger.error('Error handling MCP request', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', async (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  });

  app.delete('/mcp', async (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  });

  return { app, transports: {}, eventStore: null };
}

async function startHttp() {
  const { app } = createHttpApp();

  const server = app.listen(config.http.port, config.http.host, () => {
    logger.info(`✅ ${config.server.name} v${config.server.version} running on HTTP`);
    logger.info(`   → MCP endpoint: http://${config.http.host}:${config.http.port}/mcp`);
    logger.info(`   → Health: http://${config.http.host}:${config.http.port}/health`);
    logger.info(`   → Ready: http://${config.http.host}:${config.http.port}/ready`);
    logger.info(
      `   → Auth mode: ${config.auth.mode}, Resumability: ${config.resumability.enabled ? 'enabled' : 'stateless'}`
    );
    if (config.http.corsOrigin !== '*') {
      logger.info('   → CORS allowlist', { origins: config.http.corsOrigin });
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down HTTP server...');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Auto-start only when run directly, not when imported (tests)
if (process.env.NODE_ENV !== 'test') {
  if (useHttp) {
    startHttp().catch(err => {
      logger.error('Failed to start HTTP server', err);
      process.exit(1);
    });
  } else {
    startStdio().catch(err => {
      logger.error('Failed to start STDIO server', err);
      process.exit(1);
    });
  }
}
