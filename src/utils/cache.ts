/**
 * Simple in-memory cache with TTL (Phase 4)
 * For production, replace with Redis via REDIS_URL in config
 */
import { config } from '../config.js';

type Entry<V> = { value: V; expiresAt: number };

export class MemoryCache<K, V> {
  private store = new Map<K, Entry<V>>();
  private ttlMs: number;

  constructor(ttlMs: number = config.cache.ttlMs) {
    this.ttlMs = ttlMs;
  }

  set(key: K, value: V, ttlMs?: number): void {
    const ttl = ttlMs ?? this.ttlMs;
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    // purge expired
    for (const [k, v] of this.store.entries()) {
      if (Date.now() > v.expiresAt) this.store.delete(k);
    }
    return this.store.size;
  }

  keys(): K[] {
    // purge
    for (const [k, v] of this.store.entries()) {
      if (Date.now() > v.expiresAt) this.store.delete(k);
    }
    return [...this.store.keys()];
  }
}

// Singleton default cache (web fetch, etc.)
export const defaultCache = new MemoryCache<string, string>();
