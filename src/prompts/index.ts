import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerAllPrompts(server: McpServer) {
  server.registerPrompt(
    'code-review',
    {
      title: 'Code Review',
      description: 'Generate a code review prompt for given code',
      argsSchema: {
        language: z.string().describe('Programming language'),
        code: z.string().describe('Code to review'),
      },
    },
    async ({ language, code }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please review this ${language} code. Focus on correctness, performance, security, and style.\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide:\n1. Summary\n2. Issues found\n3. Suggestions\n4. Improved version if needed`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'explain-concept',
    {
      title: 'Explain Concept',
      description: 'Explain a technical concept at a given level',
      argsSchema: {
        concept: z.string(),
        level: z.enum(['beginner', 'intermediate', 'expert']).default('beginner'),
      },
    },
    async ({ concept, level }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Explain "${concept}" for a ${level} audience. Use clear examples, analogies, and avoid jargon beyond the level. End with 3 follow-up questions.`,
          },
        },
      ],
    })
  );
}
