#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import cors from 'cors';
import { createMcpServer } from './server.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

const args = process.argv.slice(2);
const useHttp = args.includes('--http') || process.env.TRANSPORT === 'http';

async function startStdio() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`✅ ${config.server.name} v${config.server.version} running on STDIO`);
  logger.info('Waiting for MCP client...');
}

async function startHttp() {
  const app = express();
  app.use(cors({ origin: config.http.corsOrigin }));
  app.use(express.json());

  // Health check (not part of MCP)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', name: config.server.name, version: config.server.version });
  });

  // MCP endpoint - Streamable HTTP (latest spec, replaces SSE) - stateless mode
  // Stateless: sessionIdGenerator: undefined enables simple per-request handling
  // For stateful with resumability, see ROADMAP Phase 2 & SDK simpleStreamableHttp example
  app.post('/mcp', async (req, res) => {
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
      logger.error('Error handling MCP request', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // Stateless mode: GET/DELETE not supported, return 405 (see SDK simpleStatelessStreamableHttp)
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

  app.listen(config.http.port, config.http.host, () => {
    logger.info(`✅ ${config.server.name} v${config.server.version} running on HTTP`);
    logger.info(`   → MCP endpoint: http://${config.http.host}:${config.http.port}/mcp`);
    logger.info(`   → Health: http://${config.http.host}:${config.http.port}/health`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  process.exit(0);
});

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
