import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

function isAllowed(command: string): boolean {
  if (!config.shell.allowed) return false;
  const base = command.trim().split(/\s+/)[0];
  // also handle paths like /bin/ls
  const name = base.split('/').pop() || base;
  return config.shell.allowlist.includes(name);
}

export function registerShellTool(server: McpServer) {
  server.registerTool(
    'shell_execute',
    {
      title: 'Shell Execute',
      description: `Execute a shell command (allowlist: ${config.shell.allowlist.join(', ')}). Disabled by default (ALLOW_SHELL=false).`,
      inputSchema: {
        command: z.string().min(1).describe('Command to execute, e.g. "echo hello" or "ls -la"'),
        timeout: z
          .number()
          .int()
          .min(100)
          .max(10000)
          .optional()
          .default(5000)
          .describe('Timeout ms'),
      },
    },
    async ({ command, timeout }) => {
      if (!config.shell.allowed) {
        return {
          content: [
            { type: 'text', text: 'Error: Shell execution disabled (set ALLOW_SHELL=true)' },
          ],
          isError: true,
        };
      }
      if (!isAllowed(command)) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Command not in allowlist (${config.shell.allowlist.join(', ')}): ${command.split(/\s+/)[0]}`,
            },
          ],
          isError: true,
        };
      }
      logger.info('shell_execute', { command: command.slice(0, 100) });
      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: timeout || 5000,
          maxBuffer: 256 * 1024,
        });
        const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n--- stderr ---\n');
        return { content: [{ type: 'text', text: output || '(no output)' }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );
}
