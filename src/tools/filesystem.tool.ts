import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

function getAllowedRoot(): string {
  return path.resolve(config.fs.allowedRoot);
}

async function ensureRoot(): Promise<void> {
  const root = getAllowedRoot();
  await fs.mkdir(root, { recursive: true });
}

function resolveSafe(relativePath: string): string {
  const root = getAllowedRoot();
  // Normalize and prevent traversal
  const resolved = path.resolve(root, relativePath || '.');
  if (!resolved.startsWith(root)) {
    throw new Error(`Path traversal detected: ${relativePath} is outside allowed root (${root})`);
  }
  return resolved;
}

export function registerFilesystemTools(server: McpServer) {
  server.registerTool(
    'list_files',
    {
      title: 'List Files',
      description: `List files and directories under ALLOWED_ROOT (${config.fs.allowedRoot}). Sandboxed.`,
      inputSchema: {
        path: z
          .string()
          .optional()
          .default('.')
          .describe('Relative path inside ALLOWED_ROOT, e.g. "." or "subdir"'),
        recursive: z.boolean().optional().default(false).describe('Recursively list all files'),
      },
    },
    async ({ path: relPath, recursive }) => {
      await ensureRoot();
      try {
        const target = resolveSafe(relPath || '.');
        const entries: string[] = [];
        if (recursive) {
          async function walk(dir: string, base: string) {
            const items = await fs.readdir(dir, { withFileTypes: true });
            for (const item of items) {
              const full = path.join(dir, item.name);
              const rel = path.relative(getAllowedRoot(), full);
              entries.push(`${item.isDirectory() ? 'dir' : 'file'}: ${rel}`);
              if (item.isDirectory()) await walk(full, base);
            }
          }
          await walk(target, getAllowedRoot());
        } else {
          const items = await fs.readdir(target, { withFileTypes: true });
          for (const item of items) {
            const rel = path.join(relPath || '.', item.name);
            entries.push(
              `${item.isDirectory() ? 'dir' : 'file'}: ${rel} (${item.isDirectory() ? 'directory' : 'file'})`
            );
          }
        }
        if (entries.length === 0) {
          return { content: [{ type: 'text', text: 'Empty directory' }] };
        }
        return { content: [{ type: 'text', text: entries.join('\n') }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('list_files failed', { relPath, error: msg });
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'read_file',
    {
      title: 'Read File',
      description: `Read a file under ALLOWED_ROOT (${config.fs.allowedRoot})`,
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('Relative path to file, e.g. "notes.txt" or "subdir/file.json"'),
      },
    },
    async ({ path: relPath }) => {
      await ensureRoot();
      try {
        const target = resolveSafe(relPath);
        const stat = await fs.stat(target);
        if (stat.isDirectory()) {
          return {
            content: [{ type: 'text', text: `Error: ${relPath} is a directory` }],
            isError: true,
          };
        }
        if (stat.size > 1024 * 1024) {
          return {
            content: [{ type: 'text', text: 'Error: File too large (>1MB)' }],
            isError: true,
          };
        }
        const content = await fs.readFile(target, 'utf-8');
        return { content: [{ type: 'text', text: content }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'write_file',
    {
      title: 'Write File',
      description: `Write content to a file under ALLOWED_ROOT (${config.fs.allowedRoot}). Creates directories as needed. Triggers resource list changed.`,
      inputSchema: {
        path: z.string().min(1).describe('Relative path to file'),
        content: z.string().describe('Content to write'),
      },
    },
    async ({ path: relPath, content }) => {
      await ensureRoot();
      try {
        const target = resolveSafe(relPath);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content, 'utf-8');
        logger.info('write_file success', { relPath, size: content.length });
        // Notify clients that resources changed
        try {
          server.sendResourceListChanged();
        } catch {}
        return {
          content: [{ type: 'text', text: `Wrote ${content.length} bytes to ${relPath}` }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'search_files',
    {
      title: 'Search Files',
      description: `Search for text inside files under ALLOWED_ROOT. Case-insensitive.`,
      inputSchema: {
        query: z.string().min(1).describe('Text to search for'),
        path: z.string().optional().default('.').describe('Relative directory to search in'),
        maxResults: z.number().int().min(1).max(50).optional().default(10).describe('Max results'),
      },
    },
    async ({ query, path: relPath, maxResults }) => {
      await ensureRoot();
      try {
        const target = resolveSafe(relPath || '.');
        const results: string[] = [];
        const lowerQuery = query.toLowerCase();

        async function walk(dir: string) {
          if (results.length >= (maxResults || 10)) return;
          const items = await fs.readdir(dir, { withFileTypes: true });
          for (const item of items) {
            if (results.length >= (maxResults || 10)) break;
            const full = path.join(dir, item.name);
            if (item.isDirectory()) {
              await walk(full);
            } else {
              try {
                const stat = await fs.stat(full);
                if (stat.size > 512 * 1024) continue; // skip large
                const content = await fs.readFile(full, 'utf-8');
                const lines = content.split('\n');
                lines.forEach((line, idx) => {
                  if (
                    line.toLowerCase().includes(lowerQuery) &&
                    results.length < (maxResults || 10)
                  ) {
                    const rel = path.relative(getAllowedRoot(), full);
                    results.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 200)}`);
                  }
                });
              } catch {}
            }
          }
        }

        await walk(target);
        if (results.length === 0) {
          return { content: [{ type: 'text', text: `No results for "${query}"` }] };
        }
        return { content: [{ type: 'text', text: results.join('\n') }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );
}
