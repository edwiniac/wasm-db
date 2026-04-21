import { describe, it, expect } from 'vitest';
import { MemoryLRU } from '@/cache/memory';
import type { CacheKey } from '@/cache/types';

function key(start: number, end: number): CacheKey {
  return { url: 'https://example.com/a.parquet', start, end, contentLength: end - start + 1 };
}

describe('MemoryLRU', () => {
  it('returns null for a key that was never set', async () => {
    const cache = new MemoryLRU(10);
    expect(await cache.get(key(0, 99))).toBeNull();
  });

  it('returns data that was set', async () => {
    const cache = new MemoryLRU(10);
    const data = new Uint8Array([1, 2, 3]);
    cache.set(key(0, 2), data);
    expect(await cache.get(key(0, 2))).toEqual(data);
  });

  it('evicts least-recently-used entry when capacity exceeded', async () => {
    const cache = new MemoryLRU(2);
    cache.set(key(0, 0), new Uint8Array([1])); // entry A (LRU)
    cache.set(key(1, 1), new Uint8Array([2])); // entry B
    cache.set(key(2, 2), new Uint8Array([3])); // entry C — evicts A
    expect(await cache.get(key(0, 0))).toBeNull(); // A evicted
    expect(await cache.get(key(1, 1))).not.toBeNull();
    expect(await cache.get(key(2, 2))).not.toBeNull();
  });

  it('get promotes entry so it is not evicted next', async () => {
    const cache = new MemoryLRU(2);
    cache.set(key(0, 0), new Uint8Array([1])); // entry A
    cache.set(key(1, 1), new Uint8Array([2])); // entry B
    await cache.get(key(0, 0)); // promote A — now B is LRU
    cache.set(key(2, 2), new Uint8Array([3])); // entry C — evicts B
    expect(await cache.get(key(0, 0))).not.toBeNull(); // A survived
    expect(await cache.get(key(1, 1))).toBeNull(); // B evicted
  });

  it('clear removes all entries', async () => {
    const cache = new MemoryLRU(10);
    cache.set(key(0, 9), new Uint8Array([42]));
    await cache.clear();
    expect(await cache.get(key(0, 9))).toBeNull();
  });

  it('differentiates keys with same range but different URLs', async () => {
    const cache = new MemoryLRU(10);
    const k1: CacheKey = { url: 'https://a.com/a.parquet', start: 0, end: 9, contentLength: 10 };
    const k2: CacheKey = { url: 'https://b.com/b.parquet', start: 0, end: 9, contentLength: 10 };
    cache.set(k1, new Uint8Array([1]));
    cache.set(k2, new Uint8Array([2]));
    expect(await cache.get(k1)).toEqual(new Uint8Array([1]));
    expect(await cache.get(k2)).toEqual(new Uint8Array([2]));
  });
});
