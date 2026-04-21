import { describe, it, expect } from 'vitest';
import { createDb } from '@/cache/db';
import { IndexedDBCache } from '@/cache/indexeddb';
import type { CacheKey } from '@/cache/types';

function makeCache() {
  const db = createDb(`test-${crypto.randomUUID()}`);
  return { cache: new IndexedDBCache(db), db };
}

function key(start: number, end: number): CacheKey {
  return { url: 'https://example.com/a.parquet', start, end, contentLength: end - start + 1 };
}

describe('IndexedDBCache', () => {
  it('returns null for a key never stored', async () => {
    const { cache } = makeCache();
    expect(await cache.get(key(0, 99))).toBeNull();
  });

  it('stores and retrieves data', async () => {
    const { cache } = makeCache();
    const data = new Uint8Array([10, 20, 30]);
    cache.set(key(0, 2), data);
    await new Promise((r) => setTimeout(r, 20));
    expect(await cache.get(key(0, 2))).toEqual(data);
  });

  it('round-trips data larger than 2 MB (chunked storage)', async () => {
    const { cache } = makeCache();
    const BIG = 3 * 1024 * 1024;
    const data = new Uint8Array(BIG).fill(0xab);
    cache.set(key(0, BIG - 1), data);
    await new Promise((r) => setTimeout(r, 50));
    const result = await cache.get(key(0, BIG - 1));
    expect(result).not.toBeNull();
    expect(result!.byteLength).toBe(BIG);
    expect(result![0]).toBe(0xab);
    expect(result![BIG - 1]).toBe(0xab);
  });

  it('overwrites an existing entry cleanly (no chunk leaks)', async () => {
    const { cache, db } = makeCache();
    const k = key(0, 99);
    cache.set(k, new Uint8Array(100).fill(1));
    await new Promise((r) => setTimeout(r, 20));
    cache.set(k, new Uint8Array(100).fill(2));
    await new Promise((r) => setTimeout(r, 20));
    const result = await cache.get(k);
    expect(result).not.toBeNull();
    expect(result![0]).toBe(2);
    const cacheKey = `https://example.com/a.parquet::0-99::::`;
    const chunks = await db.chunks.where('cacheKey').equals(cacheKey).count();
    expect(chunks).toBe(1);
  });

  it('clear removes all stored entries', async () => {
    const { cache } = makeCache();
    cache.set(key(0, 9), new Uint8Array(10).fill(5));
    await new Promise((r) => setTimeout(r, 20));
    await cache.clear();
    expect(await cache.get(key(0, 9))).toBeNull();
  });
});
