import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../utils/logger.js';

// Singleton DB via alasql (pure JS, in-memory)
let alasql: any = null;
let dbInitialized = false;

async function getAlaSql() {
  if (alasql) return alasql;
  try {
    const mod = await import('alasql');
    alasql = (mod as any).default || mod;
    return alasql;
  } catch (err) {
    logger.error('Failed to load alasql', err);
    throw new Error('Database not available: alasql not installed');
  }
}

async function ensureDb() {
  if (dbInitialized) return;
  const db = await getAlaSql();
  try {
    // Create demo tables if not exists
    db('CREATE TABLE IF NOT EXISTS users (id INT, name STRING, email STRING)');
    db(
      'CREATE TABLE IF NOT EXISTS notes (id INT, title STRING, content STRING, created_at STRING)'
    );
    // Seed if empty
    const count = db('SELECT COUNT(*) as c FROM users');
    if (count[0].c === 0) {
      db(
        'INSERT INTO users VALUES (1, "Alice", "alice@example.com"), (2, "Bob", "bob@example.com")'
      );
      db(
        'INSERT INTO notes VALUES (1, "Welcome", "Hello MCP", "2026-01-01"), (2, "Demo", "Phase 3 DB", "2026-08-23")'
      );
    }
    dbInitialized = true;
  } catch (err) {
    logger.error('DB init failed', err);
  }
}

export async function executeQuery(sql: string): Promise<{ rows: any[]; rowCount: number }> {
  await ensureDb();
  const db = await getAlaSql();
  // Basic injection guard: block dangerous statements if needed
  const upper = sql.trim().toUpperCase();
  // Allow SELECT, INSERT, UPDATE, DELETE, CREATE, DROP
  const allowed = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'SHOW'];
  if (!allowed.some(p => upper.startsWith(p))) {
    throw new Error(`Unsupported SQL: must start with ${allowed.join(', ')}`);
  }
  // Use alasql to execute
  const result = db(sql);
  if (typeof result === 'number') {
    return { rows: [], rowCount: result };
  }
  const rows = Array.isArray(result) ? result : result ? [result] : [];
  return { rows, rowCount: rows.length };
}

export function registerDatabaseTools(server: McpServer) {
  server.registerTool(
    'database_query',
    {
      title: 'Database Query',
      description:
        'Execute SQL against in-memory demo DB (alasql). Tables: users(id, name, email), notes(id, title, content, created_at). Supports SELECT/INSERT/UPDATE/DELETE/CREATE/DROP.',
      inputSchema: {
        sql: z.string().min(1).describe('SQL query, e.g. "SELECT * FROM users"'),
      },
    },
    async ({ sql }) => {
      logger.info('database_query', { sql: sql.slice(0, 200) });
      try {
        const { rows, rowCount } = await executeQuery(sql);
        if (rows.length === 0) {
          return { content: [{ type: 'text', text: `OK (${rowCount} rows)` }] };
        }
        // Cap output
        const preview = rows.slice(0, 50);
        const text = JSON.stringify(preview, null, 2);
        const truncated = rows.length > 50 ? `\n... (${rows.length - 50} more rows)` : '';
        return { content: [{ type: 'text', text: text + truncated }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('database_query failed', { sql: sql.slice(0, 200), error: msg });
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'database_tables',
    {
      title: 'List Tables',
      description: 'List tables and row counts in demo DB',
      inputSchema: {},
    },
    async () => {
      await ensureDb();
      const db = await getAlaSql();
      try {
        const tables = ['users', 'notes'];
        const lines: string[] = [];
        for (const t of tables) {
          try {
            const res = db(`SELECT COUNT(*) as c FROM ${t}`);
            lines.push(`${t}: ${res[0].c} rows`);
          } catch {
            lines.push(`${t}: (error)`);
          }
        }
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    }
  );
}
