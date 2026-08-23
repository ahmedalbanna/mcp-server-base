import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../utils/logger.js';
import { scheduleSave } from '../utils/persistence.js';

// Singleton in-memory KV (process lifetime)
const memoryStore = new Map<string, string>();

export function getMemoryStore(): Map<string, string> {
  return memoryStore;
}

export function registerMemoryTools(server: McpServer) {
  server.registerTool(
    'memory_set',
    {
      title: 'Memory Set',
      description: 'Store a key-value in server memory (ephemeral, per-process)',
      inputSchema: {
        key: z.string().min(1).describe('Key name'),
        value: z.string().describe('Value to store'),
      },
    },
    async ({ key, value }) => {
      memoryStore.set(key, value);
      logger.info('memory_set', { key });
      try {
        server.sendResourceListChanged();
      } catch {}
      scheduleSave();
      return { content: [{ type: 'text', text: `Set ${key}` }] };
    }
  );

  server.registerTool(
    'memory_get',
    {
      title: 'Memory Get',
      description: 'Retrieve a value by key from server memory',
      inputSchema: {
        key: z.string().min(1).describe('Key name'),
      },
    },
    async ({ key }) => {
      const value = memoryStore.get(key);
      if (value === undefined) {
        return { content: [{ type: 'text', text: `Key "${key}" not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: value }] };
    }
  );

  server.registerTool(
    'memory_delete',
    {
      title: 'Memory Delete',
      description: 'Delete a key from memory',
      inputSchema: {
        key: z.string().min(1).describe('Key name'),
      },
    },
    async ({ key }) => {
      const existed = memoryStore.delete(key);
      try {
        server.sendResourceListChanged();
      } catch {}
      if (existed) scheduleSave();
      return {
        content: [{ type: 'text', text: existed ? `Deleted ${key}` : `Key "${key}" not found` }],
        isError: !existed,
      };
    }
  );

  server.registerTool(
    'memory_list',
    {
      title: 'Memory List',
      description: 'List all keys in memory (values truncated to 100 chars)',
      inputSchema: {},
    },
    async () => {
      if (memoryStore.size === 0) {
        return { content: [{ type: 'text', text: 'Memory empty' }] };
      }
      const entries = [...memoryStore.entries()].map(
        ([k, v]) => `${k}: ${v.slice(0, 100)}${v.length > 100 ? '...' : ''}`
      );
      return { content: [{ type: 'text', text: entries.join('\n') }] };
    }
  );

  server.registerTool(
    'memory_clear',
    {
      title: 'Memory Clear',
      description: 'Clear all keys from memory',
      inputSchema: {},
    },
    async () => {
      const count = memoryStore.size;
      memoryStore.clear();
      try {
        server.sendResourceListChanged();
      } catch {}
      scheduleSave();
      return { content: [{ type: 'text', text: `Cleared ${count} keys` }] };
    }
  );
}
