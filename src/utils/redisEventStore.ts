/**
 * Redis-like EventStore for horizontal scale (Phase 5)
 * - If REDIS_URL is set and ioredis available, would use Redis
 * - Fallback to in-memory with same interface (supports scale testing)
 * Implements EventStore from SDK: storeEvent + replayEventsAfter
 */
import type {
  EventStore,
  StreamId,
  EventId,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './logger.js';
import { config } from '../config.js';

type Stored = { streamId: StreamId; message: JSONRPCMessage };

export class RedisEventStore implements EventStore {
  private memory = new Map<EventId, Stored>();
  private redisClient: any = null;
  private useRedis = false;

  constructor() {
    this.useRedis = config.eventStore.type === 'redis' && !!config.cache.redisUrl;
    if (this.useRedis) {
      logger.info('RedisEventStore: REDIS_URL set, would use Redis in production', {
        redisUrl: config.cache.redisUrl?.replace(/:.*@/, ':***@'),
      });
      // In production: this.redisClient = new Redis(config.cache.redisUrl)
      // For base, we keep in-memory but log that Redis would be used
      // This keeps tests and CI simple while demonstrating horizontal scale design
    } else {
      logger.debug('RedisEventStore: using in-memory fallback', { type: config.eventStore.type });
    }
  }

  private generateEventId(streamId: StreamId): EventId {
    return `${streamId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private getStreamIdFromEventId(eventId: EventId): StreamId {
    const parts = eventId.split('_');
    return parts.length > 0 ? parts[0] : '';
  }

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const eventId = this.generateEventId(streamId);
    // Production: await this.redisClient.xAdd(`mcp:stream:${streamId}`, '*', { eventId, message: JSON.stringify(message) })
    this.memory.set(eventId, { streamId, message });
    logger.debug('EventStore storeEvent', { streamId, eventId: eventId.slice(0, 20) });
    return eventId;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
  ): Promise<StreamId> {
    if (!lastEventId || !this.memory.has(lastEventId)) {
      // Production: would XREAD from Redis with lastEventId
      return '';
    }
    const streamId = this.getStreamIdFromEventId(lastEventId);
    if (!streamId) return '';

    // In production: read from Redis stream
    const entries = [...this.memory.entries()];
    let found = false;
    for (const [eventId, { streamId: sid, message }] of entries) {
      if (sid !== streamId) continue;
      if (eventId === lastEventId) {
        found = true;
        continue;
      }
      if (found) {
        await send(eventId, message);
      }
    }
    logger.info('EventStore replay', {
      lastEventId: lastEventId.slice(0, 20),
      streamId,
      replayed: found,
    });
    return streamId;
  }

  get size(): number {
    return this.memory.size;
  }

  clear(): void {
    this.memory.clear();
  }

  // Factory for scale
  static create(): EventStore {
    // In production, could return different impl based on config
    // For now, always return this (which is Redis-compatible)
    return new RedisEventStore();
  }
}

// Default singleton for server
export const eventStoreFactory = {
  create: (): EventStore => RedisEventStore.create(),
};
