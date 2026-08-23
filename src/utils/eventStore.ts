/**
 * In-memory EventStore for resumability (Last-Event-ID)
 * Implements EventStore from SDK: storeEvent + replayEventsAfter
 * For production use a persistent store (Redis, DB)
 */
import type {
  EventStore,
  StreamId,
  EventId,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

type StoredEvent = {
  streamId: StreamId;
  message: JSONRPCMessage;
};

export class InMemoryEventStore implements EventStore {
  private events = new Map<EventId, StoredEvent>();

  private generateEventId(streamId: StreamId): EventId {
    return `${streamId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  private getStreamIdFromEventId(eventId: EventId): StreamId {
    const parts = eventId.split('_');
    return parts.length > 0 ? parts[0] : '';
  }

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const eventId = this.generateEventId(streamId);
    this.events.set(eventId, { streamId, message });
    return eventId;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
  ): Promise<StreamId> {
    if (!lastEventId || !this.events.has(lastEventId)) {
      return '';
    }
    const streamId = this.getStreamIdFromEventId(lastEventId);
    if (!streamId) return '';

    // Use insertion order (Map preserves order) — more reliable than sorting by eventId
    const entries = [...this.events.entries()];
    let found = false;
    for (const [eventId, { streamId: eventStreamId, message }] of entries) {
      if (eventStreamId !== streamId) continue;
      if (eventId === lastEventId) {
        found = true;
        continue;
      }
      if (found) {
        await send(eventId, message);
      }
    }
    return streamId;
  }

  // Helper for tests
  get size() {
    return this.events.size;
  }

  clear() {
    this.events.clear();
  }
}
