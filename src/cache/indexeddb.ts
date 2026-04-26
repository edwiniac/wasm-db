import type { ICache, CacheKey } from './types';
import { splitIntoChunks, joinChunks } from './chunker';
import { logger } from '@/util/logger';
import type { WasmDbCacheDb } from './db';

function keyString(key: CacheKey): string {
  return `${key.url}::${key.start}-${key.end}::${key.etag ?? ''}::${key.lastModified ?? ''}`;
}

export class IndexedDBCache implements ICache {
  constructor(private readonly db: WasmDbCacheDb) {}

  async get(key: CacheKey): Promise<Uint8Array | null> {
    const cacheKey = keyString(key);
    const chunks = await this.db.transaction('r', this.db.chunks, () =>
      this.db.chunks.where('cacheKey').equals(cacheKey).sortBy('chunkIndex'),
    );
    if (chunks.length === 0) return null;
    return joinChunks(chunks.map((c) => c.data));
  }

  set(key: CacheKey, data: Uint8Array): void {
    const cacheKey = keyString(key);
    const pieces = splitIntoChunks(data);
    void this.db
      .transaction('rw', this.db.chunks, async () => {
        await this.db.chunks.where('cacheKey').equals(cacheKey).delete();
        await this.db.chunks.bulkAdd(
          pieces.map((chunk, i) => ({
            cacheKey,
            chunkIndex: i,
            totalChunks: pieces.length,
            data: chunk,
          })),
        );
      })
      .catch((err) => logger.warn('IndexedDB cache write failed', err));
  }

  async clear(): Promise<void> {
    await this.db.chunks.clear();
  }
}
