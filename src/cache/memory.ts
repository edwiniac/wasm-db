import type { ICache, CacheKey } from './types';

function keyString(key: CacheKey): string {
  return `${key.url}::${key.start}-${key.end}::${key.etag ?? ''}::${key.lastModified ?? ''}`;
}

export class MemoryLRU implements ICache {
  private readonly map = new Map<string, Uint8Array>();

  constructor(private readonly maxEntries = 512) {}

  async get(key: CacheKey): Promise<Uint8Array | null> {
    const k = keyString(key);
    const val = this.map.get(k);
    if (val === undefined) return null;
    this.map.delete(k);
    this.map.set(k, val); // re-insert at end = most recently used
    return val;
  }

  set(key: CacheKey, data: Uint8Array): void {
    const k = keyString(key);
    this.map.delete(k);
    this.map.set(k, data);
    if (this.map.size > this.maxEntries) {
      const lru = this.map.keys().next().value!;
      this.map.delete(lru);
    }
  }

  async clear(): Promise<void> {
    this.map.clear();
  }
}
