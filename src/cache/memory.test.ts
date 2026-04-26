import { describe, it, expect } from 'vitest';
import { MemoryLRU } from '@/cache/memory';
import type { CacheKey } from '@/cache/types';

function key(start: number, end: number): CacheKey {
  return { url: 'https://example.com/a.parquet', start, end, contentLength: end - start + 1 };
}

// 3-byte entries; maxBytes=3 means capacity for exactly 3 bytes (one 3-byte entry or three 1-byte entries)
describe('MemoryLRU', () => {
  it('returns null for a key that was never set', async () => {
    const cache = new MemoryLRU();
    expect(await cache.get(key(0, 99))).toBeNull();
  });

  it('returns data that was set', async () => {
    const cache = new MemoryLRU();
    const data = new Uint8Array([1, 2, 3]);
    cache.set(key(0, 2), data);
    expect(await cache.get(key(0, 2))).toEqual(data);
  });

  it('evicts least-recently-used entry when byte budget exceeded', async () => {
    // 3-byte budget; each entry is 1 byte → cap of 3 entries
    const cache = new MemoryLRU(3);
    cache.set(key(0, 0), new Uint8Array([1])); // entry A (LRU)
    cache.set(key(1, 1), new Uint8Array([2])); // entry B
    cache.set(key(2, 2), new Uint8Array([3])); // entry C — fits; still at 3 bytes
    cache.set(key(3, 3), new Uint8Array([4])); // entry D — evicts A
    expect(await cache.get(key(0, 0))).toBeNull(); // A evicted
    expect(await cache.get(key(1, 1))).not.toBeNull();
    expect(await cache.get(key(2, 2))).not.toBeNull();
    expect(await cache.get(key(3, 3))).not.toBeNull();
  });

  it('get promotes entry so it is not evicted next', async () => {
    const cache = new MemoryLRU(2);
    cache.set(key(0, 0), new Uint8Array([1])); // entry A — 1 byte
    cache.set(key(1, 1), new Uint8Array([2])); // entry B — 1 byte; total=2=budget
    await cache.get(key(0, 0)); // promote A — B is now LRU
    cache.set(key(2, 2), new Uint8Array([3])); // entry C — evicts B
    expect(await cache.get(key(0, 0))).not.toBeNull(); // A survived
    expect(await cache.get(key(1, 1))).toBeNull(); // B evicted
  });

  it('clear removes all entries and resets byte counter', async () => {
    const cache = new MemoryLRU(10);
    cache.set(key(0, 9), new Uint8Array([42]));
    await cache.clear();
    expect(await cache.get(key(0, 9))).toBeNull();
  });

  it('differentiates keys with same range but different URLs', async () => {
    const cache = new MemoryLRU();
    const k1: CacheKey = { url: 'https://a.com/a.parquet', start: 0, end: 9, contentLength: 10 };
    const k2: CacheKey = { url: 'https://b.com/b.parquet', start: 0, end: 9, contentLength: 10 };
    cache.set(k1, new Uint8Array([1]));
    cache.set(k2, new Uint8Array([2]));
    expect(await cache.get(k1)).toEqual(new Uint8Array([1]));
    expect(await cache.get(k2)).toEqual(new Uint8Array([2]));
  });

  it('overwriting an entry does not double-count its bytes', async () => {
    const cache = new MemoryLRU(10);
    cache.set(key(0, 4), new Uint8Array(5).fill(1));
    cache.set(key(0, 4), new Uint8Array(5).fill(2)); // overwrite same key
    // If bytes weren't deducted on overwrite, 10 bytes would be counted and
    // a 1-byte entry would evict the value we just wrote.
    cache.set(key(5, 9), new Uint8Array(5).fill(3)); // second entry — total=10=budget, both should fit
    expect(await cache.get(key(0, 4))).toEqual(new Uint8Array(5).fill(2));
    expect(await cache.get(key(5, 9))).toEqual(new Uint8Array(5).fill(3));
  });
});
