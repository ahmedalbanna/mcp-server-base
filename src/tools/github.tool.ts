import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { defaultCache } from '../utils/cache.js';

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'mcp-server-base/1.0',
  };
  if (config.integrations.githubToken) {
    headers.Authorization = `Bearer ${config.integrations.githubToken}`;
  }
  return headers;
}

export function registerGithubTools(server: McpServer) {
  server.registerTool(
    'github_search_repos',
    {
      title: 'GitHub Search Repos',
      description: 'Search GitHub repositories (uses GITHUB_TOKEN if set for higher rate limit)',
      inputSchema: {
        query: z.string().min(1).describe('Search query, e.g. "mcp typescript"'),
        perPage: z.number().int().min(1).max(10).optional().default(5).describe('Results per page'),
      },
    },
    async ({ query, perPage }) => {
      const cacheKey = `github:search:${query}:${perPage}`;
      const cached = defaultCache.get(cacheKey);
      if (cached) return { content: [{ type: 'text', text: cached + '\n(cached)' }] };

      try {
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${perPage}`;
        const res = await fetch(url, {
          headers: githubHeaders(),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`GitHub ${res.status}: ${txt.slice(0, 500)}`);
        }
        const data = (await res.json()) as any;
        const repos = (data.items || []).map((r: any) => ({
          full_name: r.full_name,
          description: r.description,
          stars: r.stargazers_count,
          url: r.html_url,
          language: r.language,
        }));
        const text = JSON.stringify(repos, null, 2);
        defaultCache.set(cacheKey, text);
        logger.info('github_search_repos', { query, count: repos.length });
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'github_get_repo',
    {
      title: 'GitHub Get Repo',
      description: 'Get details for a GitHub repo (owner/repo)',
      inputSchema: {
        repo: z
          .string()
          .min(1)
          .describe('Repo full name, e.g. "modelcontextprotocol/typescript-sdk"'),
      },
    },
    async ({ repo }) => {
      const cacheKey = `github:repo:${repo}`;
      const cached = defaultCache.get(cacheKey);
      if (cached) return { content: [{ type: 'text', text: cached + '\n(cached)' }] };

      try {
        const url = `https://api.github.com/repos/${repo}`;
        const res = await fetch(url, {
          headers: githubHeaders(),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`GitHub ${res.status} ${await res.text()}`);
        const data = (await res.json()) as any;
        const summary = {
          full_name: data.full_name,
          description: data.description,
          stars: data.stargazers_count,
          forks: data.forks_count,
          open_issues: data.open_issues_count,
          language: data.language,
          url: data.html_url,
          updated_at: data.updated_at,
        };
        const text = JSON.stringify(summary, null, 2);
        defaultCache.set(cacheKey, text);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'github_get_issue',
    {
      title: 'GitHub Get Issue',
      description: 'Get a GitHub issue by repo and number',
      inputSchema: {
        repo: z.string().min(1).describe('Repo full name'),
        issueNumber: z.number().int().positive().describe('Issue number'),
      },
    },
    async ({ repo, issueNumber }) => {
      try {
        const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}`;
        const res = await fetch(url, {
          headers: githubHeaders(),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`GitHub ${res.status} ${await res.text()}`);
        const data = (await res.json()) as any;
        const summary = {
          title: data.title,
          state: data.state,
          user: data.user?.login,
          created_at: data.created_at,
          body: (data.body || '').slice(0, 2000),
          url: data.html_url,
        };
        return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );
}
