import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { defaultCache } from '../utils/cache.js';

async function cachedFetch(url: string, cacheKey: string, ttlMs?: number): Promise<string> {
  const cached = defaultCache.get(cacheKey);
  if (cached) {
    logger.debug('cache hit', { cacheKey });
    return cached;
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': 'mcp-server-base/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  defaultCache.set(cacheKey, text, ttlMs);
  return text;
}

export function registerWebTools(server: McpServer) {
  server.registerTool(
    'brave_search',
    {
      title: 'Brave Search',
      description:
        'Search via Brave API (needs BRAVE_API_KEY) — falls back to mock results if no key.',
      inputSchema: {
        query: z.string().min(1).describe('Search query'),
        count: z.number().int().min(1).max(10).optional().default(5).describe('Result count'),
      },
    },
    async ({ query, count }) => {
      const apiKey = config.integrations.braveApiKey;
      if (!apiKey) {
        logger.warn('brave_search mock (no BRAVE_API_KEY)');
        const mock = Array.from({ length: count || 3 }, (_, i) => ({
          title: `Mock Brave Result ${i + 1} for "${query}"`,
          url: `https://example.com/brave/${i + 1}?q=${encodeURIComponent(query)}`,
          description: `Mock description ${i + 1} — set BRAVE_API_KEY for real results.`,
        }));
        return { content: [{ type: 'text', text: JSON.stringify(mock, null, 2) }] };
      }
      try {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
        const cacheKey = `brave:${query}:${count}`;
        const cached = defaultCache.get(cacheKey);
        if (cached) return { content: [{ type: 'text', text: cached }] };

        const res = await fetch(url, {
          headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
        const data = await res.json();
        const text = JSON.stringify(data, null, 2);
        defaultCache.set(cacheKey, text);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('brave_search failed', { query, error: msg });
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'tavily_search',
    {
      title: 'Tavily Search',
      description: 'Search via Tavily API (needs TAVILY_API_KEY) — mock if no key.',
      inputSchema: {
        query: z.string().min(1).describe('Search query'),
        maxResults: z.number().int().min(1).max(10).optional().default(5).describe('Max results'),
        includeAnswer: z.boolean().optional().default(false).describe('Include answer'),
      },
    },
    async ({ query, maxResults, includeAnswer }) => {
      const apiKey = config.integrations.tavilyApiKey;
      if (!apiKey) {
        logger.warn('tavily_search mock (no TAVILY_API_KEY)');
        const mock = {
          query,
          answer: includeAnswer ? `Mock answer for "${query}"` : undefined,
          results: Array.from({ length: maxResults || 3 }, (_, i) => ({
            title: `Mock Tavily ${i + 1}`,
            url: `https://example.com/tavily/${i + 1}`,
            content: `Mock content ${i + 1} for ${query}`,
            score: 0.9 - i * 0.1,
          })),
        };
        return { content: [{ type: 'text', text: JSON.stringify(mock, null, 2) }] };
      }
      try {
        const cacheKey = `tavily:${query}:${maxResults}:${includeAnswer}`;
        const cached = defaultCache.get(cacheKey);
        if (cached) return { content: [{ type: 'text', text: cached }] };

        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: maxResults,
            include_answer: includeAnswer,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
        const data = await res.json();
        const text = JSON.stringify(data, null, 2);
        defaultCache.set(cacheKey, text);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'web_fetch',
    {
      title: 'Web Fetch (cached)',
      description:
        'Fetch URL with in-memory cache (TTL from CACHE_TTL_MS). Uses cachedFetch fallback.',
      inputSchema: {
        url: z.string().url().describe('URL to fetch'),
        useCache: z.boolean().optional().default(true).describe('Use cache if available'),
        maxLength: z
          .number()
          .int()
          .min(100)
          .max(20000)
          .optional()
          .default(5000)
          .describe('Truncate length'),
      },
    },
    async ({ url, useCache, maxLength }) => {
      try {
        const cacheKey = `fetch:${url}`;
        if (useCache) {
          const cached = defaultCache.get(cacheKey);
          if (cached) {
            logger.info('web_fetch cache hit', { url });
            const truncated = cached.slice(0, maxLength || 5000);
            return {
              content: [
                {
                  type: 'text',
                  text:
                    truncated +
                    (cached.length > (maxLength || 5000) ? '\n...[cached truncated]' : ' (cached)'),
                },
              ],
            };
          }
        }
        logger.info('web_fetch fetching', { url });
        const text = await cachedFetch(url, cacheKey);
        const truncated = text.slice(0, maxLength || 5000);
        return {
          content: [
            {
              type: 'text',
              text:
                truncated +
                (text.length > (maxLength || 5000)
                  ? `\n...[truncated ${text.length - (maxLength || 5000)} chars]`
                  : ''),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );
}
