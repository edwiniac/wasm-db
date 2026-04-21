import type { ICache, CacheKey } from './types';

export class TieredCache implements ICache {
  constructor(
    private readonly l1: ICache,
    private readonly l2: ICache,
  ) {}

  async get(key: CacheKey): Promise<Uint8Array | null> {
    const l1Hit = await this.l1.get(key);
    if (l1Hit !== null) return l1Hit;

    const l2Hit = await this.l2.get(key);
    if (l2Hit !== null) {
      this.l1.set(key, l2Hit);
      return l2Hit;
    }

    return null;
  }

  set(key: CacheKey, data: Uint8Array): void {
    this.l1.set(key, data);
    this.l2.set(key, data);
  }

  async clear(): Promise<void> {
    await Promise.all([this.l1.clear(), this.l2.clear()]);
  }
}
