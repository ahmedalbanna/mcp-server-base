import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../utils/logger.js';

export function registerSamplingTool(server: McpServer) {
  server.registerTool(
    'generate_with_sampling',
    {
      title: 'Generate with Sampling',
      description:
        'Demonstrates sampling: asks client LLM to generate text via sampling/createMessage. Falls back if not supported.',
      inputSchema: {
        prompt: z.string().min(1).describe('Prompt to send to LLM via sampling'),
        maxTokens: z
          .number()
          .int()
          .min(10)
          .max(1000)
          .optional()
          .default(100)
          .describe('Max tokens'),
      },
    },
    async ({ prompt, maxTokens }, extra) => {
      try {
        logger.info('generate_with_sampling start', { prompt: prompt.slice(0, 50) });
        const result = await (extra as any).sendRequest(
          {
            method: 'sampling/createMessage',
            params: {
              messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
              maxTokens: maxTokens || 100,
            },
          },
          // Use generic schema - SDK will validate; we pass zod-like but we use passthrough
          undefined as any
        );

        // result should contain content
        const text =
          (result as any)?.content?.text ||
          (result as any)?.content ||
          JSON.stringify(result, null, 2);
        return { content: [{ type: 'text', text: `Sampling result: ${text}` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('sampling not supported or failed', { error: msg });
        return {
          content: [
            {
              type: 'text',
              text: `Sampling not supported by client or failed: ${msg}. This is a demo for sampling capability. Provide prompt was: "${prompt.slice(0, 100)}"`,
            },
          ],
        };
      }
    }
  );
}
