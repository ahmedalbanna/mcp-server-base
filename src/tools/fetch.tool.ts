import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../utils/logger.js';

export function registerFetchTool(server: McpServer) {
  server.registerTool(
    'fetch_url',
    {
      title: 'Fetch URL',
      description: 'Fetch content from a URL (GET). Returns text truncated to 5000 chars.',
      inputSchema: {
        url: z.string().url(),
        maxLength: z.number().min(100).max(20000).optional().default(5000),
      },
    },
    async ({ url, maxLength }) => {
      logger.info('fetch_url called', { url });
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'mcp-server-base/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          return {
            content: [{ type: 'text' as const, text: `HTTP ${res.status} ${res.statusText}` }],
            isError: true,
          };
        }
        const text = await res.text();
        const truncated = text.slice(0, maxLength);
        const wasTruncated = text.length > maxLength;
        return {
          content: [
            {
              type: 'text' as const,
              text: wasTruncated
                ? `${truncated}\n\n...[truncated ${text.length - maxLength} chars]`
                : truncated,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('fetch failed', { url, error: msg });
        return {
          content: [{ type: 'text' as const, text: `Fetch failed: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
