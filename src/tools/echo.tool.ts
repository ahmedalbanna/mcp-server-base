import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../utils/logger.js';

export function registerEchoTool(server: McpServer) {
  server.registerTool(
    'echo',
    {
      title: 'Echo Tool',
      description: 'Echoes back the input message, optionally uppercased. Use for testing connectivity.',
      inputSchema: {
        message: z.string().min(1).describe('Message to echo'),
        uppercase: z.boolean().optional().describe('Uppercase output'),
      },
    },
    async ({ message, uppercase }) => {
      logger.info('echo called', { message });
      const output = uppercase ? message.toUpperCase() : message;
      return {
        content: [{ type: 'text', text: output }],
      };
    }
  );
}

export function registerCalculatorTool(server: McpServer) {
  server.registerTool(
    'calculator',
    {
      title: 'Calculator',
      description: 'Perform basic arithmetic operations',
      inputSchema: {
        operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
        a: z.number(),
        b: z.number(),
      },
    },
    async ({ operation, a, b }) => {
      let result: number;
      switch (operation) {
        case 'add':
          result = a + b;
          break;
        case 'subtract':
          result = a - b;
          break;
        case 'multiply':
          result = a * b;
          break;
        case 'divide':
          if (b === 0) {
            return {
              content: [{ type: 'text', text: 'Error: Division by zero' }],
              isError: true,
            };
          }
          result = a / b;
          break;
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ operation, a, b, result }, null, 2),
          },
        ],
      };
    }
  );
}

export function registerTimeTool(server: McpServer) {
  server.registerTool(
    'get_time',
    {
      title: 'Get Current Time',
      description: 'Returns current ISO timestamp and timezone info',
      inputSchema: {
        timezone: z.string().optional().describe('IANA timezone e.g. Europe/Paris'),
      },
    },
    async ({ timezone }) => {
      const now = new Date();
      const data = {
        iso: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
        timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        formatted: timezone
          ? now.toLocaleString('en-US', { timeZone: timezone })
          : now.toLocaleString(),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}
