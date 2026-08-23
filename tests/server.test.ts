import { describe, it, expect } from 'vitest';
import { createMcpServer } from '../src/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

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
    const names = tools.map((t) => t.name);
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

  it('calculator add', async () => {
    const { client } = await createConnectedClient();
    const res = await client.callTool({
      name: 'calculator',
      arguments: { operation: 'add', a: 2, b: 3 },
    });
    const text = (res.content as any)[0].text;
    expect(JSON.parse(text).result).toBe(5);
  });

  it('lists resources', async () => {
    const { client } = await createConnectedClient();
    const { resources } = await client.listResources();
    expect(resources.length).toBeGreaterThan(0);
  });

  it('lists prompts', async () => {
    const { client } = await createConnectedClient();
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name);
    expect(names).toContain('code-review');
  });
});
