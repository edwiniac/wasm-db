import type { ICache, CacheKey } from './types';

function keyString(key: CacheKey): string {
  return `${key.url}::${key.start}-${key.end}::${key.etag ?? ''}::${key.lastModified ?? ''}`;
}

export class MemoryLRU implements ICache {
  private readonly map = new Map<string, Uint8Array>();
  private currentBytes = 0;

  constructor(private readonly maxBytes = 256 * 1024 * 1024) {}

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
    const existing = this.map.get(k);
    if (existing !== undefined) {
      this.currentBytes -= existing.byteLength;
      this.map.delete(k);
    }
    this.map.set(k, data);
    this.currentBytes += data.byteLength;

    while (this.currentBytes > this.maxBytes && this.map.size > 0) {
      const lruKey = this.map.keys().next().value!;
      const lruVal = this.map.get(lruKey)!;
      this.currentBytes -= lruVal.byteLength;
      this.map.delete(lruKey);
    }
  }

  async clear(): Promise<void> {
    this.map.clear();
    this.currentBytes = 0;
  }
}
