import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ElicitResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';

export function registerElicitationTool(server: McpServer) {
  server.registerTool(
    'collect_user_info',
    {
      title: 'Collect User Info (Elicitation)',
      description:
        'Demonstrates elicitation: asks client to collect user info via form (contact/preferences). Falls back gracefully if not supported.',
      inputSchema: {
        infoType: z
          .enum(['contact', 'preferences'])
          .default('contact')
          .describe('Type of info to collect'),
      },
    },
    async ({ infoType }, extra) => {
      const schemas = {
        contact: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const, title: 'Full Name', description: 'Your name' },
            email: {
              type: 'string' as const,
              title: 'Email',
              description: 'Your email',
              format: 'email',
            },
          },
          required: ['name', 'email'],
        },
        preferences: {
          type: 'object' as const,
          properties: {
            theme: {
              type: 'string' as const,
              title: 'Theme',
              enum: ['light', 'dark', 'auto'],
              description: 'Preferred theme',
            },
            notifications: { type: 'boolean' as const, title: 'Notifications', default: true },
          },
          required: ['theme'],
        },
      };

      const requestedSchema = infoType === 'contact' ? schemas.contact : schemas.preferences;
      const message =
        infoType === 'contact'
          ? 'Please provide your contact information'
          : 'Please set your preferences';

      try {
        logger.info('collect_user_info elicitation start', { infoType });
        const result = await (extra as any).sendRequest(
          {
            method: 'elicitation/create',
            params: { mode: 'form', message, requestedSchema },
          },
          ElicitResultSchema
        );

        if (result.action === 'accept') {
          return {
            content: [
              {
                type: 'text',
                text: `Collected ${infoType}: ${JSON.stringify(result.content, null, 2)}`,
              },
            ],
          };
        }
        if (result.action === 'decline') {
          return { content: [{ type: 'text', text: 'User declined to provide info' }] };
        }
        return { content: [{ type: 'text', text: 'User cancelled' }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('elicitation not supported or failed', { error: msg });
        return {
          content: [
            {
              type: 'text',
              text: `Elicitation not supported by client or failed: ${msg}. This is a demo tool for elicitation capability.`,
            },
          ],
        };
      }
    }
  );
}
