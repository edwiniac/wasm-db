import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('useHistoryStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('starts with an empty entries list', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it('addEntry inserts a new entry at the front', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    useHistoryStore.getState().addEntry('SELECT 1', 1);
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].sql).toBe('SELECT 1');
    expect(entries[0].rowCount).toBe(1);
    expect(typeof entries[0].id).toBe('string');
    expect(entries[0].id.length).toBeGreaterThan(0);
    expect(typeof entries[0].timestamp).toBe('number');
  });

  it('does not add a duplicate consecutive entry (same trimmed SQL)', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    useHistoryStore.getState().addEntry('SELECT 1', 1);
    useHistoryStore.getState().addEntry('SELECT 1', 1);
    expect(useHistoryStore.getState().entries).toHaveLength(1);
  });

  it('does add the same SQL if it is not consecutive', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    useHistoryStore.getState().addEntry('SELECT 1', 1);
    useHistoryStore.getState().addEntry('SELECT 2', 2);
    useHistoryStore.getState().addEntry('SELECT 1', 1);
    expect(useHistoryStore.getState().entries).toHaveLength(3);
  });

  it('caps entries at 50, dropping the oldest', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    for (let i = 0; i < 55; i++) {
      useHistoryStore.getState().addEntry(`SELECT ${i}`, i);
    }
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(50);
    expect(entries[0].sql).toBe('SELECT 54');
  });

  it('clearHistory empties the list', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    useHistoryStore.getState().addEntry('SELECT 1', 1);
    useHistoryStore.getState().clearHistory();
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it('persists entries to localStorage under wasm-db-history', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    useHistoryStore.getState().addEntry('SELECT persisted', 42);
    const stored = JSON.parse(localStorage.getItem('wasm-db-history') ?? '{}');
    expect(stored.state.entries[0].sql).toBe('SELECT persisted');
  });
});
