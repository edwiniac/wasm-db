import { describe, it, expect, vi } from 'vitest';
import { TieredCache } from '@/cache/tiered';
import type { ICache, CacheKey } from '@/cache/types';

function key(n: number): CacheKey {
  return { url: 'https://x.com/f.parquet', start: n, end: n + 9, contentLength: 10 };
}

function mockCache(initial: Map<string, Uint8Array> = new Map()): ICache & { setCount: number } {
  let setCount = 0;
  return {
    async get(k) {
      return initial.get(`${k.start}`) ?? null;
    },
    set(k, v) {
      setCount++;
      initial.set(`${k.start}`, v);
    },
    async clear() {
      initial.clear();
    },
    get setCount() {
      return setCount;
    },
  };
}

describe('TieredCache', () => {
  it('returns null when both L1 and L2 miss', async () => {
    const t = new TieredCache(mockCache(), mockCache());
    expect(await t.get(key(0))).toBeNull();
  });

  it('L1 hit: returns data without consulting L2', async () => {
    const data = new Uint8Array([1]);
    const l1 = mockCache(new Map([['0', data]]));
    const l2 = mockCache();
    const getSpy = vi.spyOn(l2, 'get');
    const t = new TieredCache(l1, l2);
    expect(await t.get(key(0))).toEqual(data);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('L2 hit: warms L1 and returns data', async () => {
    const data = new Uint8Array([2]);
    const l1 = mockCache();
    const l2 = mockCache(new Map([['0', data]]));
    const t = new TieredCache(l1, l2);
    const result = await t.get(key(0));
    expect(result).toEqual(data);
    expect(await l1.get(key(0))).toEqual(data);
  });

  it('set writes to both L1 and L2', async () => {
    const l1 = mockCache();
    const l2 = mockCache();
    const t = new TieredCache(l1, l2);
    t.set(key(0), new Uint8Array([7]));
    expect(l1.setCount).toBe(1);
    expect(l2.setCount).toBe(1);
  });

  it('clear flushes both tiers', async () => {
    const data = new Uint8Array([3]);
    const l1 = mockCache(new Map([['0', data]]));
    const l2 = mockCache(new Map([['0', data]]));
    const t = new TieredCache(l1, l2);
    await t.clear();
    expect(await t.get(key(0))).toBeNull();
  });
});
