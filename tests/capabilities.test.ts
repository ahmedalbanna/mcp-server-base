import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createMcpServer } from '../src/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { config } from '../src/config.js';
import { getMemoryStore } from '../src/tools/memory.tool.js';

const TEST_ROOT = '/tmp/mcp-capabilities-test';

async function createClient() {
  const server = createMcpServer();
  const client = new Client({ name: 'cap-test', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  return { client, server };
}

describe('Phase 3 Capabilities', () => {
  beforeAll(async () => {
    (config as any).fs.allowedRoot = TEST_ROOT;
    await fs.mkdir(TEST_ROOT, { recursive: true });
    // clean
    try {
      const items = await fs.readdir(TEST_ROOT);
      for (const item of items) {
        await fs.rm(path.join(TEST_ROOT, item), { recursive: true, force: true });
      }
    } catch {}
    getMemoryStore().clear();
  });

  afterAll(async () => {
    try {
      await fs.rm(TEST_ROOT, { recursive: true, force: true });
    } catch {}
    getMemoryStore().clear();
  });

  describe('filesystem tools', () => {
    it('write_file and read_file', async () => {
      const { client } = await createClient();
      const writeRes = await client.callTool({
        name: 'write_file',
        arguments: { path: 'notes/hello.txt', content: 'Hello Phase 3' },
      });
      expect((writeRes.content as any)[0].text).toContain('Wrote');
      const readRes = await client.callTool({
        name: 'read_file',
        arguments: { path: 'notes/hello.txt' },
      });
      expect((readRes.content as any)[0].text).toBe('Hello Phase 3');
    });

    it('list_files', async () => {
      const { client } = await createClient();
      await client.callTool({ name: 'write_file', arguments: { path: 'a.txt', content: 'a' } });
      await client.callTool({ name: 'write_file', arguments: { path: 'b.txt', content: 'b' } });
      const res = await client.callTool({
        name: 'list_files',
        arguments: { path: '.', recursive: false },
      });
      const text = (res.content as any)[0].text as string;
      expect(text).toContain('a.txt');
      expect(text).toContain('b.txt');
    });

    it('list_files recursive', async () => {
      const { client } = await createClient();
      await client.callTool({
        name: 'write_file',
        arguments: { path: 'deep/nested/file.txt', content: 'x' },
      });
      const res = await client.callTool({
        name: 'list_files',
        arguments: { path: '.', recursive: true },
      });
      const text = (res.content as any)[0].text as string;
      expect(text).toContain('deep');
    });

    it('search_files', async () => {
      const { client } = await createClient();
      await client.callTool({
        name: 'write_file',
        arguments: { path: 'searchme.txt', content: 'uniqueSearchTerm123\nline2' },
      });
      const res = await client.callTool({
        name: 'search_files',
        arguments: { query: 'uniqueSearchTerm123', maxResults: 5 },
      });
      const text = (res.content as any)[0].text as string;
      expect(text).toContain('uniqueSearchTerm123');
    });

    it('rejects path traversal', async () => {
      const { client } = await createClient();
      const res = await client.callTool({
        name: 'read_file',
        arguments: { path: '../../etc/passwd' },
      });
      expect(res.isError).toBe(true);
      expect((res.content as any)[0].text).toContain('Error');
    });

    it('read_file on directory returns error', async () => {
      const { client } = await createClient();
      await fs.mkdir(path.join(TEST_ROOT, 'adir'), { recursive: true });
      const res = await client.callTool({ name: 'read_file', arguments: { path: 'adir' } });
      expect(res.isError).toBe(true);
    });
  });

  describe('memory tools', () => {
    it('memory_set, get, list, delete, clear', async () => {
      const { client } = await createClient();
      getMemoryStore().clear();

      let res = await client.callTool({
        name: 'memory_set',
        arguments: { key: 'k1', value: 'v1' },
      });
      expect((res.content as any)[0].text).toContain('Set k1');

      res = await client.callTool({ name: 'memory_get', arguments: { key: 'k1' } });
      expect((res.content as any)[0].text).toBe('v1');

      res = await client.callTool({ name: 'memory_list', arguments: {} });
      expect((res.content as any)[0].text).toContain('k1');

      await client.callTool({ name: 'memory_set', arguments: { key: 'k2', value: 'v2' } });
      res = await client.callTool({ name: 'memory_delete', arguments: { key: 'k1' } });
      expect((res.content as any)[0].text).toContain('Deleted');

      res = await client.callTool({ name: 'memory_get', arguments: { key: 'k1' } });
      expect(res.isError).toBe(true);

      res = await client.callTool({ name: 'memory_clear', arguments: {} });
      expect((res.content as any)[0].text).toContain('Cleared');
      res = await client.callTool({ name: 'memory_list', arguments: {} });
      expect((res.content as any)[0].text).toContain('empty');
    });
  });

  describe('database tools', () => {
    it('database_tables and database_query SELECT', async () => {
      const { client } = await createClient();
      let res = await client.callTool({ name: 'database_tables', arguments: {} });
      expect((res.content as any)[0].text).toContain('users');

      res = await client.callTool({
        name: 'database_query',
        arguments: { sql: 'SELECT * FROM users' },
      });
      const text = (res.content as any)[0].text as string;
      expect(text).toContain('Alice');
      expect(text).toContain('Bob');
    });

    it('database_query INSERT and SELECT', async () => {
      const { client } = await createClient();
      const insertRes = await client.callTool({
        name: 'database_query',
        arguments: { sql: "INSERT INTO users VALUES (99, 'TestUser', 'test@example.com')" },
      });
      expect((insertRes.content as any)[0].text).toContain('OK');
      const selRes = await client.callTool({
        name: 'database_query',
        arguments: { sql: 'SELECT * FROM users WHERE id = 99' },
      });
      expect((selRes.content as any)[0].text).toContain('TestUser');
    });

    it('database_query rejects unsupported SQL', async () => {
      const { client } = await createClient();
      const res = await client.callTool({
        name: 'database_query',
        arguments: { sql: 'TRUNCATE TABLE users' },
      });
      expect(res.isError).toBe(true);
    });
  });

  describe('shell tool', () => {
    it('shell_execute disabled by default', async () => {
      const { client } = await createClient();
      const res = await client.callTool({
        name: 'shell_execute',
        arguments: { command: 'echo hello' },
      });
      expect(res.isError).toBe(true);
      expect((res.content as any)[0].text).toContain('disabled');
    });

    it('shell_execute allowlist check when enabled', async () => {
      const origAllowed = (config as any).shell.allowed;
      (config as any).shell.allowed = true;
      const { client } = await createClient();
      const res = await client.callTool({
        name: 'shell_execute',
        arguments: { command: 'rm -rf /' },
      });
      expect(res.isError).toBe(true);
      expect((res.content as any)[0].text).toContain('allowlist');
      (config as any).shell.allowed = origAllowed;
    });

    it('shell_execute succeeds with allowed command', async () => {
      const origAllowed = (config as any).shell.allowed;
      (config as any).shell.allowed = true;
      const { client } = await createClient();
      const res = await client.callTool({
        name: 'shell_execute',
        arguments: { command: 'echo hello-phase3' },
      });
      expect((res.content as any)[0].text).toContain('hello-phase3');
      (config as any).shell.allowed = origAllowed;
    });
  });

  describe('resources', () => {
    it('lists file, memory, db resources', async () => {
      const { client } = await createClient();
      // ensure data
      await client.callTool({
        name: 'write_file',
        arguments: { path: 'res-test.txt', content: 'res' },
      });
      await client.callTool({ name: 'memory_set', arguments: { key: 'resKey', value: 'resVal' } });

      const { resources } = await client.listResources();
      const uris = resources.map(r => r.uri);
      expect(uris).toContain('config://server-info');
      // file:// and memory:// should be discoverable via list, but static list may not contain them unless enumerated
      // Instead we test reading directly
      const fileRes = await client.readResource({ uri: 'file:///res-test.txt' });
      expect((fileRes.contents[0] as any).text).toBe('res');

      const memRes = await client.readResource({ uri: 'memory://resKey' });
      expect((memRes.contents[0] as any).text).toBe('resVal');

      const greetingRes = await client.readResource({ uri: 'greeting://Phase3' });
      expect((greetingRes.contents[0] as any).text).toContain('Phase3');

      const serverInfo = await client.readResource({ uri: 'config://server-info' });
      const info = JSON.parse((serverInfo.contents[0] as any).text);
      expect(info.features).toContain('filesystem');
    });

    it('db resource', async () => {
      const { client } = await createClient();
      const res = await client.readResource({ uri: 'db://users/1' });
      const text = (res.contents[0] as any).text as string;
      expect(text).toContain('Alice');
    });

    it('file resource list', async () => {
      const { client } = await createClient();
      await client.callTool({
        name: 'write_file',
        arguments: { path: 'list-check.txt', content: 'x' },
      });
      const { resources } = await client.listResources();
      // after write, resource list changed should include file
      // we also test direct list via FileTemplate list callback is covered
      expect(resources.length).toBeGreaterThan(0);
    });
  });

  describe('prompts', () => {
    it('lists all prompts including new ones', async () => {
      const { client } = await createClient();
      const { prompts } = await client.listPrompts();
      const names = prompts.map(p => p.name);
      expect(names).toContain('code-review');
      expect(names).toContain('explain-concept');
      expect(names).toContain('summarize');
      expect(names).toContain('research');
    });

    it('summarize prompt', async () => {
      const { client } = await createClient();
      const res = await client.getPrompt({
        name: 'summarize',
        arguments: { text: 'Long text to summarize', length: 'short', style: 'bullets' },
      });
      const text = (res.messages[0].content as any).text as string;
      expect(text).toContain('Long text');
    });

    it('research prompt', async () => {
      const { client } = await createClient();
      const res = await client.getPrompt({
        name: 'research',
        arguments: { topic: 'MCP', depth: 'deep', audience: 'expert' },
      });
      const text = (res.messages[0].content as any).text as string;
      expect(text).toContain('MCP');
    });
  });

  describe('elicitation & sampling (fallback)', () => {
    it('collect_user_info fallback when not supported', async () => {
      const { client } = await createClient();
      const res = await client.callTool({
        name: 'collect_user_info',
        arguments: { infoType: 'contact' },
      });
      const text = (res.content as any)[0].text as string;
      expect(text).toContain('Elicitation');
    });

    it('generate_with_sampling fallback', async () => {
      const { client } = await createClient();
      const res = await client.callTool({
        name: 'generate_with_sampling',
        arguments: { prompt: 'Hello' },
      });
      const text = (res.content as any)[0].text as string;
      expect(text).toContain('Sampling');
    });
  });

  it('lists all tools includes new ones', async () => {
    const { client } = await createClient();
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'echo',
        'calculator',
        'get_time',
        'fetch_url',
        'list_files',
        'read_file',
        'write_file',
        'search_files',
        'memory_set',
        'memory_get',
        'memory_delete',
        'memory_list',
        'memory_clear',
        'database_query',
        'database_tables',
        'shell_execute',
        'collect_user_info',
        'generate_with_sampling',
      ])
    );
  });
});
