/**
 * Linear integration plugin example (v2.2)
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { definePlugin } from '../plugin/index.js';
import { logger } from '../utils/logger.js';

export const linearPlugin = definePlugin({
  name: 'linear',
  version: '1.0.0',
  description: 'Linear integration: list issues, create issue (mock)',
  tools: ['linear_list_issues', 'linear_create_issue', 'linear_get_issue'],
  register(server: McpServer) {
    server.registerTool(
      'linear_list_issues',
      {
        title: 'Linear List Issues',
        description: 'List Linear issues (mock)',
        inputSchema: {
          team: z.string().optional().describe('Team ID, e.g. ENG'),
          limit: z.number().int().min(1).max(10).optional().default(5),
        },
      },
      async ({ team, limit }) => {
        logger.info('linear_list_issues mock', { team });
        const mock = Array.from({ length: limit || 3 }, (_, i) => ({
          id: `issue_${i + 1}`,
          title: `Mock Linear Issue ${i + 1} for team ${team || 'ALL'}`,
          state: 'Todo',
          priority: i + 1,
          url: `https://linear.app/mock/issue/${i + 1}`,
        }));
        return { content: [{ type: 'text', text: JSON.stringify(mock, null, 2) }] };
      }
    );

    server.registerTool(
      'linear_create_issue',
      {
        title: 'Linear Create Issue',
        description: 'Create Linear issue (mock)',
        inputSchema: {
          title: z.string().describe('Issue title'),
          description: z.string().optional().describe('Issue description'),
          team: z.string().optional().describe('Team ID'),
        },
      },
      async ({ title, description, team }) => {
        const id = `issue_${Date.now()}`;
        return {
          content: [
            {
              type: 'text',
              text: `Mock created Linear issue "${title}" (${id}) for team ${team || 'ALL'}: ${description || ''}`,
            },
          ],
        };
      }
    );

    server.registerTool(
      'linear_get_issue',
      {
        title: 'Linear Get Issue',
        description: 'Get Linear issue by ID (mock)',
        inputSchema: {
          id: z.string().describe('Issue ID'),
        },
      },
      async ({ id }) => {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { id, title: `Mock Issue ${id}`, state: 'In Progress', assignee: 'alice' },
                null,
                2
              ),
            },
          ],
        };
      }
    );
  },
});
