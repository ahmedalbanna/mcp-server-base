import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createMcpServer } from '../../src/server.js';

describe('HTTP Transport (Streamable HTTP) e2e', () => {
  let app: express.Express;
  let server: ReturnType<express.Express['listen']> extends never ? any : any;
  let baseUrl: string;
  let client: Client;

  beforeAll(async () => {
    app = express();
    app.use(cors());
    app.use(express.json());

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // MCP endpoint — stateless, mirrors src/index.ts:22
    app.post('/mcp', async (req, res) => {
      const mcpServer = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        transport.close();
        mcpServer.close();
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
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

    await new Promise<void>(resolve => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://localhost:${addr.port}`;

    // Connect client
    client = new Client({ name: 'e2e-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    await client.connect(transport);
  });

  afterAll(async () => {
    try {
      await client.close();
    } catch {}
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('health endpoint returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('client lists tools via HTTP', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);
    expect(names).toEqual(expect.arrayContaining(['echo', 'calculator', 'get_time', 'fetch_url']));
  });

  it('client calls echo via HTTP', async () => {
    const result = await client.callTool({
      name: 'echo',
      arguments: { message: 'hello via http' },
    });
    const text = (result.content as any)[0].text;
    expect(text).toBe('hello via http');
  });

  it('client calls calculator via HTTP', async () => {
    const result = await client.callTool({
      name: 'calculator',
      arguments: { operation: 'multiply', a: 6, b: 7 },
    });
    const text = (result.content as any)[0].text;
    const data = JSON.parse(text);
    expect(data.result).toBe(42);
  });

  it('client lists resources via HTTP', async () => {
    const { resources } = await client.listResources();
    expect(resources.length).toBeGreaterThan(0);
    const uris = resources.map(r => r.uri);
    expect(uris).toContain('config://server-info');
  });

  it('client reads resource via HTTP', async () => {
    const result = await client.readResource({ uri: 'config://server-info' });
    expect(result.contents.length).toBeGreaterThan(0);
    const text = (result.contents[0] as any).text;
    const data = JSON.parse(text);
    expect(data.name).toBeDefined();
    expect(data.version).toBeDefined();
  });

  it('client lists prompts via HTTP', async () => {
    const { prompts } = await client.listPrompts();
    const names = prompts.map(p => p.name);
    expect(names).toContain('code-review');
    expect(names).toContain('explain-concept');
  });

  it('client gets prompt via HTTP', async () => {
    const result = await client.getPrompt({
      name: 'explain-concept',
      arguments: { concept: 'MCP', level: 'beginner' },
    });
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages[0].content.type).toBe('text');
  });
});
