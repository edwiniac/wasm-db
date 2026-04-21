import Dexie, { type Table } from 'dexie';

export interface RangeChunk {
  id?: number;
  cacheKey: string;
  chunkIndex: number;
  totalChunks: number;
  data: Uint8Array;
}

export class WasmDbCacheDb extends Dexie {
  chunks!: Table<RangeChunk>;

  constructor(name = 'wasm-db-cache') {
    super(name);
    this.version(1).stores({
      chunks: '++id, cacheKey, [cacheKey+chunkIndex]',
    });
  }
}

export function createDb(name?: string): WasmDbCacheDb {
  return new WasmDbCacheDb(name);
}

export const db = createDb();
