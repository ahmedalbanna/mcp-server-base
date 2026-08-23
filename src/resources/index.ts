import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getMemoryStore } from '../tools/memory.tool.js';

function getAllowedRoot(): string {
  return path.resolve(config.fs.allowedRoot);
}

function resolveSafe(relativePath: string): string {
  const root = getAllowedRoot();
  const resolved = path.resolve(root, relativePath || '.');
  if (!resolved.startsWith(root)) throw new Error('Path traversal outside allowed root');
  return resolved;
}

export function registerAllResources(server: McpServer) {
  // Static resource: server info
  server.registerResource(
    'server-info',
    'config://server-info',
    {
      title: 'Server Information',
      description: 'Static information about this MCP server',
      mimeType: 'application/json',
    },
    async uri => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              name: config.server.name,
              version: config.server.version,
              description: config.server.description,
              capabilities: ['tools', 'resources', 'prompts'],
              runtime: `Node ${process.version}`,
              uptime: process.uptime(),
              features: ['filesystem', 'memory', 'database', 'auth', 'rateLimit', 'resumability'],
            },
            null,
            2
          ),
        },
      ],
    })
  );

  // Dynamic resource template: greeting
  server.registerResource(
    'greeting',
    new ResourceTemplate('greeting://{name}', { list: undefined }),
    {
      title: 'Personalized Greeting',
      description: 'Generate a greeting for a given name',
      mimeType: 'text/plain',
    },
    async (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/plain',
          text: `Hello, ${variables.name}! Welcome to ${config.server.name} v${config.server.version}. Time: ${new Date().toISOString()}`,
        },
      ],
    })
  );

  // File resource template: file:///{+path} (standard file URI with host empty)
  server.registerResource(
    'file',
    new ResourceTemplate('file:///{+path}', {
      list: async () => {
        const root = getAllowedRoot();
        await fs.mkdir(root, { recursive: true });
        const resources: any[] = [];
        async function walk(dir: string) {
          const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
          for (const item of items) {
            const full = path.join(dir, item.name);
            if (item.isDirectory()) {
              await walk(full);
            } else {
              const rel = path.relative(root, full);
              resources.push({
                uri: `file:///${rel}`,
                name: rel,
                mimeType: 'text/plain',
                description: `File under ${config.fs.allowedRoot}`,
              });
            }
          }
        }
        await walk(root);
        return { resources };
      },
      complete: {
        path: async (value: string) => {
          // autocomplete: list files matching prefix
          const root = getAllowedRoot();
          try {
            const cleanValue = value.replace(/^\/+/, '');
            const items = await fs
              .readdir(path.resolve(root, path.dirname(cleanValue)))
              .catch(() => []);
            return items.filter(n => n.startsWith(path.basename(cleanValue))).slice(0, 10);
          } catch {
            return [];
          }
        },
      },
    }),
    {
      title: 'File System',
      description: `Sandboxed file under ALLOWED_ROOT (${config.fs.allowedRoot})`,
      mimeType: 'text/plain',
    },
    async (uri, variables) => {
      const rawPath = (variables as any).path as string;
      const relPath = rawPath.replace(/^\/+/, '');
      const target = resolveSafe(relPath);
      try {
        const stat = await fs.stat(target);
        if (stat.isDirectory()) {
          const items = await fs.readdir(target, { withFileTypes: true });
          const listing = items
            .map(i => `${i.isDirectory() ? 'dir' : 'file'}: ${i.name}`)
            .join('\n');
          return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: listing }] };
        }
        const content = await fs.readFile(target, 'utf-8');
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: content }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Error: ${msg}` }] };
      }
    }
  );

  // Memory resource template: memory://{key}
  server.registerResource(
    'memory',
    new ResourceTemplate('memory://{key}', {
      list: async () => {
        const store = getMemoryStore();
        const resources = [...store.entries()].map(([k, v]) => ({
          uri: `memory://${k}`,
          name: k,
          mimeType: 'text/plain',
          description: `Memory key: ${k} (${v.slice(0, 50)})`,
        }));
        return { resources };
      },
      complete: {
        key: async (value: string) => {
          const store = getMemoryStore();
          return [...store.keys()].filter(k => k.startsWith(value)).slice(0, 10);
        },
      },
    }),
    {
      title: 'Memory Store',
      description: 'Ephemeral in-memory key/value',
      mimeType: 'text/plain',
    },
    async (uri, variables) => {
      const key = (variables as any).key as string;
      const store = getMemoryStore();
      const value = store.get(key);
      if (value === undefined) {
        return {
          contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Key "${key}" not found` }],
        };
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: value }] };
    }
  );

  // DB resource template: db://{table}/{id}
  server.registerResource(
    'db',
    new ResourceTemplate('db://{table}/{id}', {
      list: async () => {
        // list users + notes
        try {
          const { executeQuery } = await import('../tools/database.tool.js');
          const resources: any[] = [];
          for (const table of ['users', 'notes']) {
            try {
              const { rows } = await executeQuery(`SELECT * FROM ${table}`);
              for (const row of rows as any[]) {
                const id = (row as any).id ?? JSON.stringify(row).slice(0, 10);
                resources.push({
                  uri: `db://${table}/${id}`,
                  name: `${table}/${id}`,
                  mimeType: 'application/json',
                  description: `Row ${id} from ${table}`,
                });
              }
            } catch {}
          }
          return { resources };
        } catch {
          return { resources: [] };
        }
      },
      complete: {
        table: async (value: string) => ['users', 'notes'].filter(t => t.startsWith(value)),
        id: async (value: string, context) => {
          const table = (context?.arguments as any)?.table || 'users';
          try {
            const { executeQuery } = await import('../tools/database.tool.js');
            const { rows } = await executeQuery(`SELECT id FROM ${table}`);
            return (rows as any[])
              .map(r => String(r.id))
              .filter(id => id.startsWith(value))
              .slice(0, 10);
          } catch {
            return [];
          }
        },
      },
    }),
    {
      title: 'Database Row',
      description: 'Row from demo DB (users, notes)',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const { table, id } = variables as any;
      try {
        const { executeQuery } = await import('../tools/database.tool.js');
        const { rows } = await executeQuery(`SELECT * FROM ${table} WHERE id = ${Number(id)}`);
        if (rows.length === 0) {
          return {
            contents: [{ uri: uri.href, mimeType: 'text/plain', text: `No row ${id} in ${table}` }],
          };
        }
        return {
          contents: [
            { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(rows[0], null, 2) },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Error: ${msg}` }] };
      }
    }
  );

  // RAG docs resource: docs://{id}
  server.registerResource(
    'docs',
    new ResourceTemplate('docs://{id}', {
      list: async () => {
        try {
          const { getVectorStore } = await import('../tools/rag.tool.js');
          const store = getVectorStore();
          const resources = [...store.entries()].map(([id, doc]) => ({
            uri: `docs://${id}`,
            name: id,
            mimeType: 'text/plain',
            description: `RAG chunk: ${doc.text.slice(0, 60)}...`,
          }));
          return { resources };
        } catch {
          return { resources: [] };
        }
      },
      complete: {
        id: async (value: string) => {
          try {
            const { getVectorStore } = await import('../tools/rag.tool.js');
            return [...getVectorStore().keys()].filter(k => k.startsWith(value)).slice(0, 10);
          } catch {
            return [];
          }
        },
      },
    }),
    {
      title: 'RAG Document',
      description: 'Chunk from vector store (ingested via rag_ingest)',
      mimeType: 'text/plain',
    },
    async (uri, variables) => {
      const id = (variables as any).id as string;
      try {
        const { getVectorStore } = await import('../tools/rag.tool.js');
        const doc = getVectorStore().get(id);
        if (!doc) {
          return {
            contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Doc "${id}" not found` }],
          };
        }
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: doc.text,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Error: ${msg}` }] };
      }
    }
  );
}
