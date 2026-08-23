import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMcpServer } from '../src/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { logger } from '../src/utils/logger.js';

describe('MCP Server', () => {
  async function createConnectedClient() {
    const server = createMcpServer();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return { client, server };
  }

  it('lists tools', async () => {
    const { client } = await createConnectedClient();
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('echo');
    expect(names).toContain('calculator');
    expect(names).toContain('get_time');
    expect(names).toContain('fetch_url');
  });

  it('echo tool works', async () => {
    const { client } = await createConnectedClient();
    const res = await client.callTool({ name: 'echo', arguments: { message: 'hello' } });
    expect((res.content as any)[0].text).toBe('hello');
  });

  it('echo tool uppercase', async () => {
    const { client } = await createConnectedClient();
    const res = await client.callTool({
      name: 'echo',
      arguments: { message: 'hello', uppercase: true },
    });
    expect((res.content as any)[0].text).toBe('HELLO');
  });

  it('calculator add', async () => {
    const { client } = await createConnectedClient();
    const res = await client.callTool({
      name: 'calculator',
      arguments: { operation: 'add', a: 2, b: 3 },
    });
    const text = (res.content as any)[0].text;
    expect(JSON.parse(text).result).toBe(5);
  });

  it('calculator subtract/multiply/divide', async () => {
    const { client } = await createConnectedClient();
    let res = await client.callTool({
      name: 'calculator',
      arguments: { operation: 'subtract', a: 10, b: 4 },
    });
    expect(JSON.parse((res.content as any)[0].text).result).toBe(6);

    res = await client.callTool({
      name: 'calculator',
      arguments: { operation: 'multiply', a: 3, b: 7 },
    });
    expect(JSON.parse((res.content as any)[0].text).result).toBe(21);

    res = await client.callTool({
      name: 'calculator',
      arguments: { operation: 'divide', a: 20, b: 4 },
    });
    expect(JSON.parse((res.content as any)[0].text).result).toBe(5);
  });

  it('calculator divide by zero', async () => {
    const { client } = await createConnectedClient();
    const res = await client.callTool({
      name: 'calculator',
      arguments: { operation: 'divide', a: 5, b: 0 },
    });
    expect(res.isError).toBe(true);
    expect((res.content as any)[0].text).toContain('Division by zero');
  });

  it('get_time without and with timezone', async () => {
    const { client } = await createConnectedClient();
    let res = await client.callTool({ name: 'get_time', arguments: {} });
    let data = JSON.parse((res.content as any)[0].text);
    expect(data.iso).toBeDefined();
    expect(data.unix).toBeDefined();

    res = await client.callTool({
      name: 'get_time',
      arguments: { timezone: 'Europe/Paris' },
    });
    data = JSON.parse((res.content as any)[0].text);
    expect(data.timezone).toBe('Europe/Paris');
  });

  it('lists resources', async () => {
    const { client } = await createConnectedClient();
    const { resources } = await client.listResources();
    expect(resources.length).toBeGreaterThan(0);
  });

  it('reads server-info resource', async () => {
    const { client } = await createConnectedClient();
    const res = await client.readResource({ uri: 'config://server-info' });
    expect(res.contents.length).toBeGreaterThan(0);
    const data = JSON.parse((res.contents[0] as any).text);
    expect(data.name).toBeDefined();
    expect(data.version).toBeDefined();
  });

  it('reads greeting template resource', async () => {
    const { client } = await createConnectedClient();
    const res = await client.readResource({ uri: 'greeting://Alice' });
    const text = (res.contents[0] as any).text as string;
    expect(text).toContain('Alice');
  });

  it('lists prompts', async () => {
    const { client } = await createConnectedClient();
    const { prompts } = await client.listPrompts();
    const names = prompts.map(p => p.name);
    expect(names).toContain('code-review');
    expect(names).toContain('explain-concept');
  });

  it('gets code-review prompt', async () => {
    const { client } = await createConnectedClient();
    const res = await client.getPrompt({
      name: 'code-review',
      arguments: { language: 'typescript', code: 'const x=1' },
    });
    expect(res.messages[0].content.type).toBe('text');
    expect((res.messages[0].content as any).text).toContain('typescript');
  });

  it('gets explain-concept prompt', async () => {
    const { client } = await createConnectedClient();
    const res = await client.getPrompt({
      name: 'explain-concept',
      arguments: { concept: 'MCP', level: 'beginner' },
    });
    expect((res.messages[0].content as any).text).toContain('MCP');
  });

  describe('fetch_url tool', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it('fetches and truncates', async () => {
      const { client } = await createConnectedClient();
      const mockText = 'a'.repeat(500);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => mockText,
        } as any)
      );
      const res = await client.callTool({
        name: 'fetch_url',
        arguments: { url: 'https://example.com', maxLength: 100 },
      });
      const text = (res.content as any)[0].text as string;
      expect(text).toContain('truncated');
      expect(text.length).toBeLessThan(500);
    });

    it('handles http error', async () => {
      const { client } = await createConnectedClient();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => 'not found',
        } as any)
      );
      const res = await client.callTool({
        name: 'fetch_url',
        arguments: { url: 'https://example.com/missing' },
      });
      expect(res.isError).toBe(true);
      expect((res.content as any)[0].text).toContain('404');
    });

    it('handles fetch exception', async () => {
      const { client } = await createConnectedClient();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));
      const res = await client.callTool({
        name: 'fetch_url',
        arguments: { url: 'https://example.com' },
      });
      expect(res.isError).toBe(true);
      expect((res.content as any)[0].text).toContain('network failure');
    });
  });

  it('logger does not throw', () => {
    expect(() => {
      logger.debug('debug test', { a: 1 });
      logger.info('info test');
      logger.warn('warn test');
      logger.error('error test', { err: 'x' });
    }).not.toThrow();
  });
});
