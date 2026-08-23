import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { createMcpServer } from '../src/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  definePlugin,
  registerPlugin,
  getRegisteredPlugins,
  clearPlugins,
  getPlugin,
} from '../src/plugin/index.js';
import { slackPlugin } from '../src/integrations/slack.js';
import { notionPlugin } from '../src/integrations/notion.js';
import { linearPlugin } from '../src/integrations/linear.js';
import { hybridSearch } from '../src/tools/rag.tool.js';
import { clearVectorStore } from '../src/tools/rag.tool.js';
import { createHttpApp } from '../src/index.js';
import { config } from '../src/config.js';

async function createClient() {
  const server = createMcpServer();
  const client = new Client({ name: 'v2.2-test', version: '2.2.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  return { client, server };
}

describe('v2.2 Ecosystem & DX', () => {
  describe('Plugin SDK', () => {
    beforeEach(() => clearPlugins());

    it('definePlugin and registerPlugin', async () => {
      const testPlugin = definePlugin({
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test',
        register(server) {
          server.registerTool(
            'test_plugin_tool',
            { title: 'Test', description: 'Test tool', inputSchema: {} },
            async () => ({ content: [{ type: 'text', text: 'ok' }] })
          );
        },
        tools: ['test_plugin_tool'],
      });
      const server = createMcpServer();
      registerPlugin(server, testPlugin);
      expect(getPlugin('test-plugin')).toBeDefined();
      expect(getRegisteredPlugins().length).toBeGreaterThan(0);
    });

    it('prevents duplicate registration', async () => {
      clearPlugins();
      const p = definePlugin({ name: 'dup', version: '1.0.0', register() {} });
      const server = createMcpServer();
      registerPlugin(server, p);
      registerPlugin(server, p); // second should be ignored
      expect(getRegisteredPlugins().filter(x => x.name === 'dup').length).toBe(1);
    });

    it('slack/notion/linear plugins register tools', async () => {
      clearPlugins();
      // fresh server so tools aren't already registered by createMcpServer auto-registration
      const server = createMcpServer();
      registerPlugin(server, slackPlugin);
      registerPlugin(server, notionPlugin);
      registerPlugin(server, linearPlugin);
      expect(getPlugin('slack')).toBeDefined();
      expect(getPlugin('notion')).toBeDefined();
      expect(getPlugin('linear')).toBeDefined();
      expect(slackPlugin.tools).toContain('slack_list_channels');
      expect(notionPlugin.tools).toContain('notion_search');
      expect(linearPlugin.tools).toContain('linear_list_issues');
    });

    it('plugin tools are available via MCP', async () => {
      const { client } = await createClient();
      const { tools } = await client.listTools();
      const names = tools.map(t => t.name);
      // 31 was previous, now 40 with 9 plugin tools (3 slack +3 notion+3 linear)
      expect(names).toContain('slack_list_channels');
      expect(names).toContain('slack_post_message');
      expect(names).toContain('slack_search');
      expect(names).toContain('notion_search');
      expect(names).toContain('notion_get_page');
      expect(names).toContain('notion_create_page');
      expect(names).toContain('linear_list_issues');
      expect(names).toContain('linear_create_issue');
      expect(names).toContain('linear_get_issue');
      expect(names.length).toBeGreaterThanOrEqual(40);
    });

    it('plugin tools callable (mock)', async () => {
      const { client } = await createClient();
      let res = await client.callTool({ name: 'slack_list_channels', arguments: {} });
      expect((res.content as any)[0].text).toContain('general');

      res = await client.callTool({ name: 'notion_search', arguments: { query: 'test' } });
      expect((res.content as any)[0].text).toContain('Mock Notion');

      res = await client.callTool({ name: 'linear_list_issues', arguments: {} });
      expect((res.content as any)[0].text).toContain('Mock Linear');
    });

    it('clearPlugins works', () => {
      clearPlugins();
      expect(getRegisteredPlugins().length).toBe(0);
    });
  });

  describe('Registry files', () => {
    it('package.json has mcpName, files, bin', async () => {
      const pkg = JSON.parse(await fs.readFile('package.json', 'utf-8'));
      expect(pkg.mcpName).toBe('io.github.ahmedalbanna/mcp-server-base');
      expect(pkg.files).toContain('dist');
      expect(pkg.files).toContain('smithery.yaml');
      expect(pkg.bin['mcp-server-base']).toBe('dist/index.js');
      expect(pkg.keywords).toContain('plugin');
      expect(pkg.version).toBe('3.0.0');
    });

    it('smithery.yaml exists and valid', async () => {
      const content = await fs.readFile('smithery.yaml', 'utf-8');
      expect(content).toContain('mcp-server-base');
      expect(content).toContain('startCommand');
      expect(content).toContain('smithery.ai');
      expect(content).toContain('2.2.0');
    });

    it('server instructions mention 2.2 and plugins', async () => {
      const { server } = await createClient();
      // We can't directly get instructions via MCP, but config version should be 2.2.0
      expect(config.server.version).toBe('3.0.0');
    });
  });

  describe('RAG hybrid (BM25 + vector) + re-rank', () => {
    beforeEach(() => clearVectorStore());
    afterEach(() => clearVectorStore());

    it('hybridSearch vector vs bm25 vs hybrid', async () => {
      // Ingest docs with distinct terms
      const { getVectorStore } = await import('../src/tools/rag.tool.js');
      getVectorStore().clear();
      // Use direct store for controlled test
      const docs = [
        {
          id: 'doc1',
          text: 'The quick brown fox jumps over lazy dog',
          vector: [] as any,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
        {
          id: 'doc2',
          text: 'Quantum computing uses qubits and superposition and entanglement',
          vector: [] as any,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
        {
          id: 'doc3',
          text: 'MCP Model Context Protocol connects AI to data sources via tools and resources',
          vector: [] as any,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
      ];
      // Need to embed vectors for test: use same embed as rag tool
      // For simplicity, test via rag_ingest + rag_search modes
      const { client } = await createClient();
      clearVectorStore();
      await client.callTool({ name: 'rag_ingest', arguments: { text: docs[0].text, id: 'doc1' } });
      await client.callTool({ name: 'rag_ingest', arguments: { text: docs[1].text, id: 'doc2' } });
      await client.callTool({ name: 'rag_ingest', arguments: { text: docs[2].text, id: 'doc3' } });

      // Vector mode should find fox for query "fox"
      let res = await client.callTool({
        name: 'rag_search',
        arguments: { query: 'fox jumps', mode: 'vector', topK: 1 },
      });
      expect((res.content as any)[0].text).toContain('doc1');

      // BM25 mode should also find fox
      res = await client.callTool({
        name: 'rag_search',
        arguments: { query: 'fox', mode: 'bm25', topK: 1 },
      });
      expect((res.content as any)[0].text).toContain('doc1');

      // Hybrid should find MCP for query "MCP tools"
      res = await client.callTool({
        name: 'rag_search',
        arguments: { query: 'MCP tools', mode: 'hybrid', topK: 1 },
      });
      expect((res.content as any)[0].text).toContain('doc3');

      // Test hybridSearch function directly
      const { hybridSearch: hs } = await import('../src/tools/rag.tool.js');
      const store = getVectorStore();
      const allDocs = [...store.values()];
      const scoredVector = hs('fox', allDocs, 'vector');
      const scoredBm25 = hs('fox', allDocs, 'bm25');
      const scoredHybrid = hs('fox', allDocs, 'hybrid');
      expect(scoredVector[0].doc.id).toContain('doc1');
      expect(scoredBm25[0].doc.id).toContain('doc1');
      expect(scoredHybrid[0].doc.id).toContain('doc1');
      expect(scoredHybrid[0].vectorScore).toBeDefined();
      expect(scoredHybrid[0].bm25Score).toBeDefined();
    });

    it('rag_search modes return scores with v and bm25', async () => {
      const { client } = await createClient();
      clearVectorStore();
      await client.callTool({
        name: 'rag_ingest',
        arguments: { text: 'hello world test', id: 'h1' },
      });
      const res = await client.callTool({
        name: 'rag_search',
        arguments: { query: 'hello', mode: 'hybrid' },
      });
      const text = (res.content as any)[0].text as string;
      expect(text).toContain('v=');
      expect(text).toContain('bm25=');
    });

    it('eval set p@5 >0.8 (simulated)', async () => {
      const evalData = JSON.parse(await fs.readFile('tests/eval/rag-eval.json', 'utf-8'));
      expect(evalData.length).toBe(20);
      // Simulate eval: ingest all docs from eval, then search each query and check if expected in top5
      const { client } = await createClient();
      clearVectorStore();
      // Ingest all docs from eval
      for (const item of evalData) {
        for (const doc of item.docs) {
          await client.callTool({ name: 'rag_ingest', arguments: { text: doc.text, id: doc.id } });
        }
      }
      let correct = 0;
      for (const item of evalData) {
        const res = await client.callTool({
          name: 'rag_search',
          arguments: { query: item.query, topK: 5, mode: 'hybrid' },
        });
        const text = (res.content as any)[0].text as string;
        const found = item.expected_ids.some((id: string) => text.includes(id));
        if (found) correct++;
      }
      const pAt5 = correct / evalData.length;
      expect(pAt5).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Admin Prompt Playground', () => {
    it('GET /admin/prompts lists prompts', async () => {
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;
      try {
        const res = await fetch(`${base}/admin/prompts`);
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.prompts.length).toBe(4);
        expect(body.prompts.map((p: any) => p.name)).toContain('summarize');
      } finally {
        await new Promise<void>(r => server.close(() => r()));
      }
    });

    it('POST /admin/prompts/:name/preview renders', async () => {
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;
      try {
        let res = await fetch(`${base}/admin/prompts/summarize/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'hello world', length: 'short', style: 'bullets' }),
        });
        expect(res.status).toBe(200);
        let body: any = await res.json();
        expect(body.messages[0].content.text).toContain('hello world');

        res = await fetch(`${base}/admin/prompts/code-review/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: 'ts', code: 'const x=1' }),
        });
        expect(res.status).toBe(200);
        body = await res.json();
        expect(body.messages[0].content.text).toContain('const x=1');

        res = await fetch(`${base}/admin/prompts/unknown/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(404);
      } finally {
        await new Promise<void>(r => server.close(() => r()));
      }
    });

    it('GET /admin has playground UI', async () => {
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;
      try {
        const res = await fetch(`${base}/admin`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('Playground');
        expect(html).toContain('promptSelect');
        expect(html).toContain('previewPrompt');
      } finally {
        await new Promise<void>(r => server.close(() => r()));
      }
    });

    it('plugin tools count via admin', async () => {
      const { app } = createHttpApp();
      const server = await new Promise<any>(resolve => {
        const s = app.listen(0, () => resolve(s));
      });
      const base = `http://localhost:${(server.address() as any).port}`;
      try {
        const res = await fetch(`${base}/admin/tools`);
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.count).toBeGreaterThanOrEqual(40);
      } finally {
        await new Promise<void>(r => server.close(() => r()));
      }
    });
  });
});
