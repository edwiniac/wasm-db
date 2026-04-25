import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CacheKey } from '@/cache/types';

function key(start: number, end: number): CacheKey {
  return { url: 'https://example.com/a.parquet', start, end, contentLength: end - start + 1 };
}

describe('OPFSCache', () => {
  const store = new Map<string, Uint8Array>();

  beforeEach(() => {
    store.clear();

    const makeFileHandle = (name: string) => ({
      getFile: vi.fn(async () => ({
        arrayBuffer: vi.fn(async () => {
          const d = store.get(name) ?? new Uint8Array(0);
          return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer;
        }),
      })),
      createWritable: vi.fn(async () => ({
        write: vi.fn(async (data: Uint8Array) => {
          store.set(name, data);
        }),
        close: vi.fn(async () => {}),
      })),
    });

    const mockDir = {
      getFileHandle: vi.fn(async (name: string, opts?: { create?: boolean }) => {
        if (!opts?.create && !store.has(name)) {
          throw new DOMException('File not found', 'NotFoundError');
        }
        return makeFileHandle(name);
      }),
    };

    const mockRoot = {
      getDirectoryHandle: vi.fn(async () => mockDir),
      removeEntry: vi.fn(async () => {
        store.clear();
      }),
    };

    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory: vi.fn().mockResolvedValue(mockRoot) },
      configurable: true,
    });
  });

  it('returns null for a key never stored', async () => {
    const { OPFSCache } = await import('@/cache/opfs');
    const cache = new OPFSCache();
    expect(await cache.get(key(0, 99))).toBeNull();
  });

  it('stores and retrieves data', async () => {
    const { OPFSCache } = await import('@/cache/opfs');
    const cache = new OPFSCache();
    const data = new Uint8Array([1, 2, 3]);
    cache.set(key(0, 2), data);
    await new Promise((r) => setTimeout(r, 20));
    expect(await cache.get(key(0, 2))).toEqual(data);
  });

  it('overwrites an existing entry', async () => {
    const { OPFSCache } = await import('@/cache/opfs');
    const cache = new OPFSCache();
    const k = key(0, 9);
    cache.set(k, new Uint8Array([1, 1, 1]));
    await new Promise((r) => setTimeout(r, 20));
    cache.set(k, new Uint8Array([2, 2, 2]));
    await new Promise((r) => setTimeout(r, 20));
    expect(await cache.get(k)).toEqual(new Uint8Array([2, 2, 2]));
  });

  it('clear removes all stored entries', async () => {
    const { OPFSCache } = await import('@/cache/opfs');
    const cache = new OPFSCache();
    cache.set(key(0, 9), new Uint8Array([42]));
    await new Promise((r) => setTimeout(r, 20));
    await cache.clear();
    expect(await cache.get(key(0, 9))).toBeNull();
  });

  it('returns null silently when OPFS is unavailable', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn().mockRejectedValue(new DOMException('SecurityError')),
      },
      configurable: true,
    });
    const { OPFSCache } = await import('@/cache/opfs');
    const cache = new OPFSCache();
    expect(await cache.get(key(0, 99))).toBeNull();
  });
});
