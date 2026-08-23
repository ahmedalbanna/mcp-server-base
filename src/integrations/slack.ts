/**
 * Slack integration plugin example (v2.2)
 * Demonstrates Plugin SDK: definePlugin + registerPlugin
 * Tools are mocked if SLACK_TOKEN not set, otherwise would call Slack Web API
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { definePlugin } from '../plugin/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

export const slackPlugin = definePlugin({
  name: 'slack',
  version: '1.0.0',
  description: 'Slack integration: list channels, post message (mock if no token)',
  author: 'mcp-server-base',
  tools: ['slack_list_channels', 'slack_post_message', 'slack_search'],
  register(server: McpServer) {
    server.registerTool(
      'slack_list_channels',
      {
        title: 'Slack List Channels',
        description: 'List Slack channels (mock if SLACK_TOKEN not set)',
        inputSchema: {},
      },
      async () => {
        const token = (config as any)._env?.SLACK_TOKEN || process.env.SLACK_TOKEN;
        if (!token) {
          logger.info('slack_list_channels mock');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  [
                    { id: 'C012AB3CD', name: 'general', topic: 'Company-wide' },
                    { id: 'C012AB3EF', name: 'random', topic: 'Off-topic' },
                  ],
                  null,
                  2
                ),
              },
            ],
          };
        }
        // Real: fetch('https://slack.com/api/conversations.list', { headers: { Authorization: `Bearer ${token}` } })
        return {
          content: [
            { type: 'text', text: `Would call Slack API with token ${token.slice(0, 5)}...` },
          ],
        };
      }
    );

    server.registerTool(
      'slack_post_message',
      {
        title: 'Slack Post Message',
        description: 'Post message to Slack channel (mock if no token)',
        inputSchema: {
          channel: z.string().describe('Channel ID or name, e.g. C012AB3CD or #general'),
          text: z.string().describe('Message text'),
        },
      },
      async ({ channel, text }) => {
        const token = (config as any)._env?.SLACK_TOKEN || process.env.SLACK_TOKEN;
        logger.info('slack_post_message', { channel });
        if (!token) {
          return {
            content: [
              {
                type: 'text',
                text: `Mock posted to ${channel}: "${text}" (set SLACK_TOKEN for real)`,
              },
            ],
          };
        }
        return { content: [{ type: 'text', text: `Posted to ${channel} via Slack API` }] };
      }
    );

    server.registerTool(
      'slack_search',
      {
        title: 'Slack Search',
        description: 'Search Slack messages (mock)',
        inputSchema: {
          query: z.string().describe('Search query'),
          count: z.number().int().min(1).max(10).optional().default(5),
        },
      },
      async ({ query, count }) => {
        const mock = Array.from({ length: count || 3 }, (_, i) => ({
          channel: 'general',
          user: `user${i + 1}`,
          text: `Mock result ${i + 1} for "${query}"`,
          ts: new Date().toISOString(),
        }));
        return { content: [{ type: 'text', text: JSON.stringify(mock, null, 2) }] };
      }
    );
  },
});
