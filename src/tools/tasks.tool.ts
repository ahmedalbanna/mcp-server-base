import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../utils/logger.js';
import { createSpan } from '../utils/otel.js';

// Simple in-memory task store for demo (if experimental not available)
type TaskStatus = 'working' | 'completed' | 'failed';
type Task = {
  taskId: string;
  status: TaskStatus;
  createdAt: string;
  result?: any;
};

const tasks = new Map<string, Task>();

function genTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getTasks(): Map<string, Task> {
  return tasks;
}

export function registerTasksTools(server: McpServer) {
  // Try experimental tasks API if available
  try {
    if ((server as any).experimental?.tasks?.registerToolTask) {
      logger.info('Registering experimental tasks via SDK');

      // Delay task using experimental API
      // We need to dynamically handle taskStore; if not configured, this may fail gracefully
      try {
        (server as any).experimental.tasks.registerToolTask(
          'delay_task',
          {
            title: 'Delay Task',
            description:
              'Experimental task that delays for given duration (demonstrates task polling)',
            inputSchema: {
              duration: z.number().int().min(100).max(10000).default(1000).describe('Delay ms'),
            },
          },
          {
            createTask: async ({ duration }: any, ctx: any) => {
              const taskStore = ctx.taskStore;
              const task = await taskStore.createTask({ ttl: ctx.taskRequestedTtl });
              const store = ctx.taskStore;
              // Simulate async work
              (async () => {
                await new Promise(r => setTimeout(r, duration));
                await store.storeTaskResult(task.taskId, 'completed', {
                  content: [{ type: 'text', text: `Completed ${duration}ms delay` }],
                });
              })();
              return { task };
            },
            getTask: async (_args: any, ctx: any) => ctx.taskStore.getTask(ctx.taskId),
            getTaskResult: async (_args: any, ctx: any) => ctx.taskStore.getTaskResult(ctx.taskId),
          } as any
        );
        logger.info('Experimental delay_task registered');
      } catch (err) {
        logger.warn(
          'Experimental tasks not configured (need taskStore), falling back to regular tool',
          { error: String(err) }
        );
      }
    }
  } catch (err) {
    logger.debug('Experimental tasks check failed', { error: String(err) });
  }

  // Fallback / additional regular task-like tools (always available)

  server.registerTool(
    'create_task',
    {
      title: 'Create Task',
      description:
        'Create a background task that completes after delay (simple task demo without experimental API)',
      inputSchema: {
        duration: z.number().int().min(100).max(10000).default(1000).describe('Delay ms'),
        payload: z.string().optional().describe('Optional payload'),
      },
    },
    async ({ duration, payload }) => {
      const span = createSpan('create_task', { duration });
      const taskId = genTaskId();
      const task: Task = { taskId, status: 'working', createdAt: new Date().toISOString() };
      tasks.set(taskId, task);
      logger.info('create_task', { taskId, duration });

      // Simulate async
      setTimeout(() => {
        task.status = 'completed';
        task.result = { content: `Task ${taskId} completed after ${duration}ms`, payload };
        tasks.set(taskId, task);
        span.end('ok', { taskId });
      }, duration);

      span.addEvent('task.created', { taskId });
      // Return immediately with taskId (client can poll)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { taskId, status: 'working', message: `Task created, poll with get_task status` },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    'get_task',
    {
      title: 'Get Task',
      description: 'Get task status by ID',
      inputSchema: {
        taskId: z.string().describe('Task ID from create_task'),
      },
    },
    async ({ taskId }) => {
      const task = tasks.get(taskId);
      if (!task) {
        return { content: [{ type: 'text', text: `Task ${taskId} not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    }
  );

  server.registerTool(
    'get_task_result',
    {
      title: 'Get Task Result',
      description: 'Get task result if completed',
      inputSchema: {
        taskId: z.string().describe('Task ID'),
      },
    },
    async ({ taskId }) => {
      const task = tasks.get(taskId);
      if (!task) {
        return { content: [{ type: 'text', text: `Task ${taskId} not found` }], isError: true };
      }
      if (task.status !== 'completed') {
        return { content: [{ type: 'text', text: `Task ${taskId} status: ${task.status}` }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(task.result, null, 2) }] };
    }
  );
}
