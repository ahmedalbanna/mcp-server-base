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
import { RedisEventStore, eventStoreFactory } from './utils/redisEventStore.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { createMcpRateLimiter } from './middleware/rateLimit.js';
import { registerAdminRoutes } from './routes/admin.js';
import { createSpan, incrementCounter, recordHistogram } from './utils/otel.js';
import { initOtel } from './observability/otel-real.js';
import { checkSlo } from './observability/slo.js';
import { mcpRbacMiddleware } from './middleware/rbac.js';
import { loadBackup } from './utils/persistence.js';
import {
  getMetricsText,
  httpRequestsTotal,
  httpRequestDuration,
  mcpSessionsActive,
} from './utils/metrics.js';
import { registerControlPlaneRoutes } from './routes/controlplane.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { initCluster } from './utils/cluster.js';

const args = process.argv.slice(2);
const useHttp = args.includes('--http') || process.env.TRANSPORT === 'http';

// Load backup at startup (v2.1)
loadBackup().catch(err => logger.warn('Backup load at startup failed', { error: String(err) }));

// Init OTEL if enabled (v2.1)
if (config.otel.enabled) {
  initOtel().catch(err => logger.warn('OTEL init failed', { error: String(err) }));
}

async function startStdio() {
  const span = createSpan('stdio.start', { version: config.server.version });
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  incrementCounter('stdio.connections', 1);
  span.end('ok', { transport: 'stdio' });
  logger.info(`✅ ${config.server.name} v${config.server.version} running on STDIO`);
  logger.info('Waiting for MCP client...');
}

export function createHttpApp() {
  const app = express();

  // Security: Helmet
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

  // Body parser
  app.use(express.json({ limit: '1mb' }));

  // OTEL: request timing middleware
  app.use((req, _res, next) => {
    const start = Date.now();
    const span = createSpan(`http.${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      requestId: (req as any).requestId,
    });
    incrementCounter('http.requests', 1, { method: req.method, path: req.path });
    httpRequestsTotal.inc({ method: req.method, path: req.path, status: '0' });
    (req as any)._otelSpan = span;
    (req as any)._otelStart = start;
    next();
  });

  // Finish span on response + Prometheus metrics
  app.use((_req, res, next) => {
    const req = _req as any;
    const originalEnd = res.end;
    res.end = function (...args: any[]) {
      if (req._otelSpan) {
        const duration = Date.now() - req._otelStart;
        recordHistogram('http.duration', duration);
        httpRequestDuration.observe({ method: req.method, path: req.path }, duration);
        req._otelSpan.end(res.statusCode >= 400 ? 'error' : 'ok', {
          statusCode: res.statusCode,
          durationMs: duration,
        });
        httpRequestsTotal.inc({
          method: req.method,
          path: req.path,
          status: String(res.statusCode),
        });
      }
      return originalEnd.apply(res, args as any);
    };
    next();
  });

  // Rate limiting for MCP
  const rateLimiter = createMcpRateLimiter();
  app.use('/mcp', rateLimiter);

  // Auth middleware for MCP
  const authMiddleware = createAuthMiddleware();
  app.use('/mcp', authMiddleware);

  // RBAC for MCP tools (v2.1)
  app.use('/mcp', mcpRbacMiddleware);

  // Multi-tenant (v3.0): extract X-Tenant-Id, reject if TENANT_REQUIRED and missing
  app.use('/mcp', tenantMiddleware);

  // Health & readiness with SLO checks (v2.1)
  app.get('/health', async (_req, res) => {
    const slo = await checkSlo();
    res.json({
      status: slo.ok ? 'ok' : 'degraded',
      name: config.server.name,
      version: config.server.version,
      uptime: slo.uptime,
      checks: slo.checks,
      otel: config.otel.enabled ? 'enabled' : 'disabled',
      eventStore: config.eventStore.type,
    });
  });

  app.get('/ready', async (_req, res) => {
    const slo = await checkSlo();
    if (!slo.ok) {
      res.status(503).json({ status: 'not_ready', checks: slo.checks });
      return;
    }
    res.json({
      status: 'ready',
      uptime: slo.uptime,
      timestamp: new Date().toISOString(),
      checks: slo.checks,
    });
  });

  // Prometheus metrics (v2.1)
  app.get('/metrics', async (_req, res) => {
    try {
      const metrics = await getMetricsText();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      res.send(metrics);
    } catch (err) {
      res.status(500).send(String(err));
    }
  });

  // Admin routes (protected, before MCP)
  try {
    registerAdminRoutes(app, () => ({ server: createMcpServer(), transports: {} }));
    registerControlPlaneRoutes(app); // v3.0 tenants CRUD
  } catch (err) {
    logger.warn('Admin routes failed to register', { error: String(err) });
  }

  // Choose transport mode based on config
  if (config.resumability.enabled) {
    // STATEFUL with RedisEventStore for horizontal scale
    const transports: Record<string, StreamableHTTPServerTransport> = {};
    const eventStore =
      config.eventStore.type === 'redis'
        ? new RedisEventStore()
        : eventStoreFactory.create() || new InMemoryEventStore();

    logger.info('Resumability enabled', {
      eventStore: config.eventStore.type,
      redis: !!config.cache.redisUrl,
    });
    mcpSessionsActive.set(0);

    app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const reqLogger = logger.child({ requestId: (req as any).requestId || 'unknown' });
      const span = createSpan('mcp.post', { sessionId: sessionId || 'new' });

      try {
        let transport: StreamableHTTPServerTransport;
        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
          reqLogger.debug('Reusing transport for session', { sessionId });
          span.setAttribute('transport.reused', true);
        } else if (!sessionId && isInitializeRequest(req.body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            eventStore,
            enableJsonResponse: true,
            onsessioninitialized: sessionId => {
              transports[sessionId] = transport;
              reqLogger.info('Session initialized', { sessionId });
              incrementCounter('mcp.sessions.created', 1);
              mcpSessionsActive.set(Object.keys(transports).length);
            },
          });
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              reqLogger.info('Transport closed', { sessionId: sid });
              delete transports[sid];
              incrementCounter('mcp.sessions.closed', 1);
              mcpSessionsActive.set(Object.keys(transports).length);
            }
          };
          const server = createMcpServer();
          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);
          span.end('ok', { sessionId: transport.sessionId });
          return;
        } else {
          span.end('error', { reason: 'no valid session' });
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
            id: null,
          });
          return;
        }
        await transport.handleRequest(req, res, req.body);
        span.end('ok');
      } catch (err) {
        span.end('error', { error: String(err) });
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
        incrementCounter('mcp.reconnects', 1);
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

    return { app, transports, eventStore };
  }

  // STATELESS (default)
  app.post('/mcp', async (req, res) => {
    const reqLogger = logger.child({ requestId: (req as any).requestId || 'unknown' });
    const span = createSpan('mcp.post.stateless', { requestId: (req as any).requestId });
    const server = createMcpServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        transport.close();
        server.close();
        span.end('ok');
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      incrementCounter('mcp.requests.stateless', 1);
    } catch (err) {
      span.end('error', { error: String(err) });
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
    logger.info(`   → Metrics: http://${config.http.host}:${config.http.port}/metrics`);
    logger.info(
      `   → Admin: http://${config.http.host}:${config.http.port}/admin ${config.admin.enabled ? '(enabled)' : '(disabled)'}`
    );
    logger.info(
      `   → Auth mode: ${config.auth.mode}, Resumability: ${config.resumability.enabled ? 'enabled (' + config.eventStore.type + ')' : 'stateless'}, OTEL: ${config.otel.enabled ? 'enabled' : 'disabled'}, RBAC: enabled`
    );
    if (config.http.corsOrigin !== '*') {
      logger.info('   → CORS allowlist', { origins: config.http.corsOrigin });
    }
  });

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
  const boot = () => {
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
  };
  // v3.0: cluster mode — primary forks workers (each boots via startWorker);
  // when disabled, boot directly in this process
  const handled = initCluster(boot);
  if (!handled) {
    boot();
  }
}
