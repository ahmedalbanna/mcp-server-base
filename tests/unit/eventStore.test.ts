import { describe, it, expect } from 'vitest';
import { InMemoryEventStore } from '../../src/utils/eventStore.js';

describe('InMemoryEventStore', () => {
  it('stores and replays events', async () => {
    const store = new InMemoryEventStore();
    const streamId = 'test-stream';
    const msg1 = { jsonrpc: '2.0' as const, method: 'test', id: 1, params: {} };
    const msg2 = { jsonrpc: '2.0' as const, method: 'test2', id: 2, params: {} };

    const id1 = await store.storeEvent(streamId, msg1 as any);
    const id2 = await store.storeEvent(streamId, msg2 as any);
    expect(store.size).toBe(2);
    expect(id1).toContain(streamId);
    expect(id2).toContain(streamId);

    const sent: any[] = [];
    const returnedStreamId = await store.replayEventsAfter(id1, {
      send: async (eventId, message) => {
        sent.push({ eventId, message });
      },
    });
    expect(returnedStreamId).toBe(streamId);
    expect(sent.length).toBe(1);
    expect(sent[0].message).toEqual(msg2);
  });

  it('returns empty for unknown eventId', async () => {
    const store = new InMemoryEventStore();
    const result = await store.replayEventsAfter('unknown_123', { send: async () => {} });
    expect(result).toBe('');
  });

  it('handles empty lastEventId', async () => {
    const store = new InMemoryEventStore();
    await store.storeEvent('s1', { jsonrpc: '2.0' } as any);
    const result = await store.replayEventsAfter('', { send: async () => {} });
    expect(result).toBe('');
  });

  it('clear works', async () => {
    const store = new InMemoryEventStore();
    await store.storeEvent('s1', { jsonrpc: '2.0' } as any);
    expect(store.size).toBe(1);
    store.clear();
    expect(store.size).toBe(0);
  });
});
