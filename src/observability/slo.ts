/**
 * SLO checks for /health /ready (v2.1)
 */
import { getMemoryStore } from '../tools/memory.tool.js';
import { getVectorStore } from '../tools/rag.tool.js';
import { defaultCache } from '../utils/cache.js';

export type SloCheck = { name: string; ok: boolean; latencyMs?: number; error?: string };

export async function checkSlo(): Promise<{ ok: boolean; checks: SloCheck[]; uptime: number }> {
  const checks: SloCheck[] = [];
  const start = Date.now();

  // 1. Memory store accessible
  try {
    const s = Date.now();
    void getMemoryStore().size;
    checks.push({ name: 'memory_store', ok: true, latencyMs: Date.now() - s });
  } catch (err) {
    checks.push({ name: 'memory_store', ok: false, error: String(err) });
  }

  // 2. RAG store
  try {
    const s = Date.now();
    void getVectorStore().size;
    checks.push({ name: 'rag_store', ok: true, latencyMs: Date.now() - s });
  } catch (err) {
    checks.push({ name: 'rag_store', ok: false, error: String(err) });
  }

  // 3. Cache
  try {
    const s = Date.now();
    void defaultCache.size;
    checks.push({ name: 'cache', ok: true, latencyMs: Date.now() - s });
  } catch (err) {
    checks.push({ name: 'cache', ok: false, error: String(err) });
  }

  // 4. Uptime
  const uptime = process.uptime();
  checks.push({ name: 'uptime', ok: uptime > 0, latencyMs: Date.now() - start });

  const ok = checks.every(c => c.ok);
  return { ok, checks, uptime };
}
