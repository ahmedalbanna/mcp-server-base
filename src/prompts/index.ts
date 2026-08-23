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

  server.registerPrompt(
    'summarize',
    {
      title: 'Summarize',
      description: 'Summarize text with controllable length and style',
      argsSchema: {
        text: z.string().describe('Text to summarize'),
        length: z.enum(['short', 'medium', 'long']).default('medium').describe('Summary length'),
        style: z.enum(['bullets', 'paragraph', 'tldr']).default('bullets').describe('Output style'),
      },
    },
    async ({ text, length, style }) => {
      const lengthHint =
        length === 'short'
          ? 'in 2-3 sentences'
          : length === 'long'
            ? 'in detail (5-8 bullets)'
            : 'in 3-5 bullets';
      const styleHint =
        style === 'bullets'
          ? 'Use bullet points'
          : style === 'tldr'
            ? 'Start with TL;DR'
            : 'Use a single paragraph';
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Summarize the following text ${lengthHint}. ${styleHint}.\n\n---\n${text}\n---\n\nProvide the summary and key takeaways.`,
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'research',
    {
      title: 'Research Brief',
      description: 'Create a research brief for a topic',
      argsSchema: {
        topic: z.string().describe('Research topic'),
        depth: z.enum(['overview', 'deep']).default('overview').describe('Depth of research'),
        audience: z.enum(['beginner', 'expert', 'executive']).default('expert'),
      },
    },
    async ({ topic, depth, audience }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Create a ${depth} research brief on "${topic}" for a ${audience} audience.\n\nInclude:\n1. Executive summary\n2. Key findings (with citations placeholders)\n3. Risks / open questions\n4. Next steps / recommendations\n\nUse structured headings, be concise but thorough.`,
          },
        },
      ],
    })
  );
}
