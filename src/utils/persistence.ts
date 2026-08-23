/**
 * Simple persistence for RAG & memory (v2.1 Backup)
 * - If REDIS_URL set and ioredis available, would use Redis
 * - Fallback to file at ALLOWED_ROOT/.backup.json
 * For demo, uses file; Redis stub logs that it would be used
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from './logger.js';
import { getVectorStore } from '../tools/rag.tool.js';
import { getMemoryStore } from '../tools/memory.tool.js';

export function getBackupFile(): string {
  return path.join(path.resolve(config.fs.allowedRoot), '.backup.json');
}

async function ensureRoot(): Promise<void> {
  await fs.mkdir(path.dirname(getBackupFile()), { recursive: true });
}

export async function saveBackup(): Promise<void> {
  try {
    await ensureRoot();
    const data = {
      memory: [...getMemoryStore().entries()],
      rag: [...getVectorStore().entries()].map(([id, doc]) => ({ id, doc })),
      timestamp: new Date().toISOString(),
    };
    const file = getBackupFile();
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
    logger.debug('Backup saved', { file, memory: data.memory.length, rag: data.rag.length });

    if (config.cache.redisUrl) {
      logger.info('Backup would also sync to Redis', {
        redis: config.cache.redisUrl.replace(/:.*@/, ':***@'),
      });
      // In production: const redis = new Redis(config.cache.redisUrl); await redis.set('mcp:backup', JSON.stringify(data));
    }
  } catch (err) {
    logger.warn('Backup save failed', { error: String(err) });
  }
}

export async function loadBackup(): Promise<void> {
  try {
    await ensureRoot();
    const file = getBackupFile();
    const content = await fs.readFile(file, 'utf-8').catch(() => null);
    if (!content) {
      logger.debug('No backup file found', { file });
      return;
    }
    const data = JSON.parse(content);
    if (Array.isArray(data.memory)) {
      const store = getMemoryStore();
      store.clear();
      for (const [k, v] of data.memory as [string, string][]) {
        store.set(k, v);
      }
    }
    if (Array.isArray(data.rag)) {
      const store = getVectorStore();
      store.clear();
      for (const { id, doc } of data.rag as any[]) {
        store.set(id, doc);
      }
    }
    logger.info('Backup loaded', { file, memory: data.memory?.length, rag: data.rag?.length });
  } catch (err) {
    logger.warn('Backup load failed', { error: String(err) });
  }
}

// Auto-save on changes (called from tools)
let saveTimeout: NodeJS.Timeout | null = null;
export function scheduleSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveBackup().catch(() => {});
  }, 500);
}
