/**
 * Notion integration plugin example (v2.2)
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { definePlugin } from '../plugin/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

export const notionPlugin = definePlugin({
  name: 'notion',
  version: '1.0.0',
  description: 'Notion integration: search, get page, create page (mock if no token)',
  tools: ['notion_search', 'notion_get_page', 'notion_create_page'],
  register(server: McpServer) {
    server.registerTool(
      'notion_search',
      {
        title: 'Notion Search',
        description: 'Search Notion (mock if NOTION_TOKEN not set)',
        inputSchema: {
          query: z.string().describe('Search query'),
          page_size: z.number().int().min(1).max(10).optional().default(5),
        },
      },
      async ({ query, page_size }) => {
        const token = (config as any)._env?.NOTION_TOKEN || process.env.NOTION_TOKEN;
        if (!token) {
          logger.info('notion_search mock');
          const mock = Array.from({ length: page_size || 3 }, (_, i) => ({
            object: 'page',
            id: `page_${i + 1}`,
            title: `Mock Notion Page ${i + 1} for "${query}"`,
            url: `https://notion.so/mock-${i + 1}`,
          }));
          return { content: [{ type: 'text', text: JSON.stringify(mock, null, 2) }] };
        }
        return {
          content: [
            { type: 'text', text: `Would search Notion with token ${token.slice(0, 5)}...` },
          ],
        };
      }
    );

    server.registerTool(
      'notion_get_page',
      {
        title: 'Notion Get Page',
        description: 'Get Notion page by ID (mock)',
        inputSchema: {
          page_id: z.string().describe('Page ID'),
        },
      },
      async ({ page_id }) => {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: page_id,
                  title: `Mock Page ${page_id}`,
                  properties: { Status: 'Done' },
                  url: `https://notion.so/${page_id}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    server.registerTool(
      'notion_create_page',
      {
        title: 'Notion Create Page',
        description: 'Create Notion page (mock)',
        inputSchema: {
          title: z.string().describe('Page title'),
          content: z.string().optional().describe('Page content'),
        },
      },
      async ({ title, content }) => {
        const id = `page_${Date.now()}`;
        return {
          content: [
            {
              type: 'text',
              text: `Mock created page "${title}" with id ${id}${content ? `: ${content.slice(0, 50)}` : ''}`,
            },
          ],
        };
      }
    );
  },
});
