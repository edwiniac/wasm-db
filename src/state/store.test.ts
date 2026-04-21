import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('useQueryStore persist', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('dispatching SET_URL persists parquetURL to localStorage', async () => {
    const { useQueryStore } = await import('@/state/store');
    useQueryStore.getState().dispatch({ type: 'SET_URL', url: 'https://example.com/a.parquet' });
    const stored = JSON.parse(localStorage.getItem('wasm-db-query') ?? '{}');
    expect(stored.state.parquetURL).toBe('https://example.com/a.parquet');
  });

  it('dispatching SET_QUERY persists queryText to localStorage', async () => {
    const { useQueryStore } = await import('@/state/store');
    useQueryStore.getState().dispatch({ type: 'SET_QUERY', sql: 'SELECT id FROM parquet_scan()' });
    const stored = JSON.parse(localStorage.getItem('wasm-db-query') ?? '{}');
    expect(stored.state.queryText).toBe('SELECT id FROM parquet_scan()');
  });

  it('status is not persisted (partialize excludes it)', async () => {
    const { useQueryStore } = await import('@/state/store');
    useQueryStore.setState({ status: 'executing' });
    const stored = JSON.parse(localStorage.getItem('wasm-db-query') ?? '{}');
    expect(stored.state?.status).toBeUndefined();
  });

  it('fresh store hydrates parquetURL from previous session', async () => {
    localStorage.setItem(
      'wasm-db-query',
      JSON.stringify({
        state: { parquetURL: 'https://example.com/a.parquet', queryText: 'SELECT 1' },
        version: 0,
      }),
    );
    const { useQueryStore } = await import('@/state/store');
    await useQueryStore.persist.rehydrate();
    expect(useQueryStore.getState().parquetURL).toBe('https://example.com/a.parquet');
  });
});
