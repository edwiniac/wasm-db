export interface CacheKey {
  url: string;
  start: number;
  end: number;
  etag?: string;
  lastModified?: string;
  contentLength: number;
}

export interface ICache {
  get(key: CacheKey): Promise<Uint8Array | null>;
  set(key: CacheKey, data: Uint8Array): void; // fire-and-forget
  clear(): Promise<void>;
}
