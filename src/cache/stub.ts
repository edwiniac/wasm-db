import type { ICache, CacheKey } from './types';

// No-op cache — always misses. Replaced with real implementation in Phase 2.
export class StubCache implements ICache {
  get(_key: CacheKey): Promise<Uint8Array | null> {
    return Promise.resolve(null);
  }

  set(_key: CacheKey, _data: Uint8Array): void {
    // intentional no-op
  }

  clear(): Promise<void> {
    return Promise.resolve();
  }
}
