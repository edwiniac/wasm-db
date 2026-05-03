# Phase 2: Cache & Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make second queries sub-second by caching HTTP byte ranges (L1 memory LRU → L2 IndexedDB), intercepting DuckDB's internal fetches via an upgraded Service Worker, and persisting app state (URL + query) across reloads with Zustand.

**Architecture:** Three independent layers wired together. (1) `src/cache/` — a tiered ICache stack: MemoryLRU (L1, in-process) writes through to IndexedDBCache (L2, Dexie-backed, chunked for Firefox). HttpTransport checks this before every network call. (2) `public/sw.js` — upgraded to intercept DuckDB's internal httpfs range requests using the SW Cache API, which are invisible to HttpTransport. (3) `src/state/store.ts` — Zustand store with `persist` middleware replaces `useReducer`, keeping `parquetURL` and `queryText` in localStorage across reloads.

**Tech Stack:** Zustand 5, Dexie 4, fake-indexeddb (dev), existing Vitest + Playwright stack.

---

## File Map

| File                          | Action | Responsibility                                                                  |
| ----------------------------- | ------ | ------------------------------------------------------------------------------- |
| `src/cache/memory.ts`         | Create | L1 — Map-based LRU implementing `ICache`                                        |
| `src/cache/memory.test.ts`    | Create | Unit tests: eviction, LRU order, get/set/clear                                  |
| `src/cache/chunker.ts`        | Create | Split/join Uint8Arrays at 2 MB (Firefox IndexedDB limit)                        |
| `src/cache/chunker.test.ts`   | Create | Unit tests: exact-boundary splits, join round-trip                              |
| `src/cache/db.ts`             | Create | Dexie schema (`wasm-db-cache`), factory export for test isolation               |
| `src/cache/indexeddb.ts`      | Create | L2 — Dexie-backed ICache, uses chunker internally                               |
| `src/cache/indexeddb.test.ts` | Create | Unit tests with fake-indexeddb, quota error resilience                          |
| `src/cache/tiered.ts`         | Create | L1 → L2 coordinator: read-through, write-both, clear-both                       |
| `src/cache/tiered.test.ts`    | Create | Unit tests: L1 hit bypasses L2, L2 hit warms L1, write goes to both             |
| `public/sw.js`                | Modify | Range-request cache via SW Cache API (plain JS, no build step)                  |
| `src/state/store.ts`          | Create | Zustand store with persist, wraps existing `queryReducer`                       |
| `src/state/store.test.ts`     | Create | Reload-safety: parquetURL/queryText survive, transient state resets             |
| `src/state/queryService.ts`   | Modify | Replace `StubCache` with `TieredCache(new MemoryLRU(), new IndexedDBCache(db))` |
| `src/App.tsx`                 | Modify | Replace `useReducer` with `useQueryStore`                                       |
| `tests/e2e/phase2.spec.ts`    | Create | Playwright: URL persists after reload, query persists after reload              |
| `package.json`                | Modify | Add `dexie`, `zustand`; add `fake-indexeddb` dev dep                            |
| `vitest.config.ts`            | Modify | Add `fake-indexeddb/auto` to setupFiles                                         |

---

## Milestone 1: Cache Layer

### Task 1: Install Dependencies

**Files:** `package.json`

- [ ] **Step 1: Install runtime and dev deps**

```bash
cd /home/zenitsu/Desktop/wasm-db
pnpm add dexie zustand
pnpm add -D fake-indexeddb
```

Expected: no errors, `node_modules/dexie`, `node_modules/zustand`, `node_modules/fake-indexeddb` exist.

- [ ] **Step 2: Add fake-indexeddb to Vitest setupFiles**

In `vitest.config.ts`, change:

```ts
    setupFiles: ['./src/test-setup.ts'],
```

to:

```ts
    setupFiles: ['./src/test-setup.ts', 'fake-indexeddb/auto'],
```

This polyfills `indexedDB` globally for all tests so Dexie works in jsdom.

- [ ] **Step 3: Verify typecheck still passes**

```bash
pnpm typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore(phase2): install dexie, zustand, fake-indexeddb"
```

---

### Task 2: L1 Memory LRU Cache

**Files:**

- Create: `src/cache/memory.ts`
- Create: `src/cache/memory.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/cache/memory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MemoryLRU } from '@/cache/memory';
import type { CacheKey } from '@/cache/types';

function key(start: number, end: number): CacheKey {
  return { url: 'https://example.com/a.parquet', start, end, contentLength: end - start + 1 };
}

describe('MemoryLRU', () => {
  it('returns null for a key that was never set', async () => {
    const cache = new MemoryLRU(10);
    expect(await cache.get(key(0, 99))).toBeNull();
  });

  it('returns data that was set', async () => {
    const cache = new MemoryLRU(10);
    const data = new Uint8Array([1, 2, 3]);
    cache.set(key(0, 2), data);
    expect(await cache.get(key(0, 2))).toEqual(data);
  });

  it('evicts least-recently-used entry when capacity exceeded', async () => {
    const cache = new MemoryLRU(2);
    cache.set(key(0, 0), new Uint8Array([1])); // entry A (LRU)
    cache.set(key(1, 1), new Uint8Array([2])); // entry B
    cache.set(key(2, 2), new Uint8Array([3])); // entry C — evicts A
    expect(await cache.get(key(0, 0))).toBeNull(); // A evicted
    expect(await cache.get(key(1, 1))).not.toBeNull();
    expect(await cache.get(key(2, 2))).not.toBeNull();
  });

  it('get promotes entry so it is not evicted next', async () => {
    const cache = new MemoryLRU(2);
    cache.set(key(0, 0), new Uint8Array([1])); // entry A
    cache.set(key(1, 1), new Uint8Array([2])); // entry B
    await cache.get(key(0, 0)); // promote A — now B is LRU
    cache.set(key(2, 2), new Uint8Array([3])); // entry C — evicts B
    expect(await cache.get(key(0, 0))).not.toBeNull(); // A survived
    expect(await cache.get(key(1, 1))).toBeNull(); // B evicted
  });

  it('clear removes all entries', async () => {
    const cache = new MemoryLRU(10);
    cache.set(key(0, 9), new Uint8Array([42]));
    await cache.clear();
    expect(await cache.get(key(0, 9))).toBeNull();
  });

  it('differentiates keys with same range but different URLs', async () => {
    const cache = new MemoryLRU(10);
    const k1: CacheKey = { url: 'https://a.com/a.parquet', start: 0, end: 9, contentLength: 10 };
    const k2: CacheKey = { url: 'https://b.com/b.parquet', start: 0, end: 9, contentLength: 10 };
    cache.set(k1, new Uint8Array([1]));
    cache.set(k2, new Uint8Array([2]));
    expect(await cache.get(k1)).toEqual(new Uint8Array([1]));
    expect(await cache.get(k2)).toEqual(new Uint8Array([2]));
  });
});
```

- [ ] **Step 2: Run — expect all tests to fail**

```bash
pnpm test -- memory
```

Expected: FAIL — `Cannot find module '@/cache/memory'`.

- [ ] **Step 3: Implement MemoryLRU**

Create `src/cache/memory.ts`:

```ts
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
```

- [ ] **Step 4: Run — expect all 6 tests to pass**

```bash
pnpm test -- memory
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/cache/memory.ts src/cache/memory.test.ts
git commit -m "feat(cache): L1 memory LRU cache with count-based eviction"
```

---

### Task 3: 2 MB Chunker

**Files:**

- Create: `src/cache/chunker.ts`
- Create: `src/cache/chunker.test.ts`

Firefox IndexedDB cannot store individual values larger than ~2 MB. Any byte range we write must be split into ≤2 MB chunks first and reassembled on read.

- [ ] **Step 1: Write failing tests**

Create `src/cache/chunker.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { splitIntoChunks, joinChunks, CHUNK_SIZE } from '@/cache/chunker';

describe('splitIntoChunks', () => {
  it('returns one chunk for empty input', () => {
    const chunks = splitIntoChunks(new Uint8Array(0));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.byteLength).toBe(0);
  });

  it('returns one chunk when data fits within CHUNK_SIZE', () => {
    const data = new Uint8Array(100).fill(7);
    expect(splitIntoChunks(data)).toHaveLength(1);
  });

  it('splits data that is exactly 2x CHUNK_SIZE into two equal chunks', () => {
    const data = new Uint8Array(CHUNK_SIZE * 2).fill(1);
    const chunks = splitIntoChunks(data);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.byteLength).toBe(CHUNK_SIZE);
    expect(chunks[1]!.byteLength).toBe(CHUNK_SIZE);
  });

  it('last chunk holds the remainder when data is not a multiple of CHUNK_SIZE', () => {
    const data = new Uint8Array(CHUNK_SIZE + 500).fill(9);
    const chunks = splitIntoChunks(data);
    expect(chunks).toHaveLength(2);
    expect(chunks[1]!.byteLength).toBe(500);
  });
});

describe('joinChunks', () => {
  it('round-trips through split and join', () => {
    const original = new Uint8Array(CHUNK_SIZE * 2 + 333);
    for (let i = 0; i < original.length; i++) original[i] = i % 256;
    const rejoined = joinChunks(splitIntoChunks(original));
    expect(rejoined).toEqual(original);
  });

  it('joins zero chunks to an empty array', () => {
    expect(joinChunks([])).toEqual(new Uint8Array(0));
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test -- chunker
```

Expected: FAIL — `Cannot find module '@/cache/chunker'`.

- [ ] **Step 3: Implement chunker**

Create `src/cache/chunker.ts`:

```ts
export const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MiB — Firefox IndexedDB per-value limit

export function splitIntoChunks(data: Uint8Array, size = CHUNK_SIZE): Uint8Array[] {
  if (data.byteLength === 0) return [new Uint8Array(0)];
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.byteLength; offset += size) {
    chunks.push(data.slice(offset, Math.min(offset + size, data.byteLength)));
  }
  return chunks;
}

export function joinChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0);
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
```

- [ ] **Step 4: Run — expect all 6 tests to pass**

```bash
pnpm test -- chunker
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/cache/chunker.ts src/cache/chunker.test.ts
git commit -m "feat(cache): 2 MB chunker for Firefox IndexedDB value limit"
```

---

### Task 4: L2 IndexedDB Cache (Dexie)

**Files:**

- Create: `src/cache/db.ts`
- Create: `src/cache/indexeddb.ts`
- Create: `src/cache/indexeddb.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/cache/indexeddb.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { createDb } from '@/cache/db';
import { IndexedDBCache } from '@/cache/indexeddb';
import type { CacheKey } from '@/cache/types';

// Each test gets its own Dexie instance to avoid cross-test bleed
function makeCache() {
  const db = createDb(`test-${crypto.randomUUID()}`);
  return { cache: new IndexedDBCache(db), db };
}

function key(start: number, end: number): CacheKey {
  return { url: 'https://example.com/a.parquet', start, end, contentLength: end - start + 1 };
}

describe('IndexedDBCache', () => {
  it('returns null for a key never stored', async () => {
    const { cache } = makeCache();
    expect(await cache.get(key(0, 99))).toBeNull();
  });

  it('stores and retrieves data', async () => {
    const { cache } = makeCache();
    const data = new Uint8Array([10, 20, 30]);
    cache.set(key(0, 2), data);
    await new Promise((r) => setTimeout(r, 20)); // let fire-and-forget settle
    expect(await cache.get(key(0, 2))).toEqual(data);
  });

  it('round-trips data larger than 2 MB (chunked storage)', async () => {
    const { cache } = makeCache();
    const BIG = 3 * 1024 * 1024; // 3 MiB — forces two chunks
    const data = new Uint8Array(BIG).fill(0xab);
    cache.set(key(0, BIG - 1), data);
    await new Promise((r) => setTimeout(r, 50));
    const result = await cache.get(key(0, BIG - 1));
    expect(result).not.toBeNull();
    expect(result!.byteLength).toBe(BIG);
    expect(result![0]).toBe(0xab);
    expect(result![BIG - 1]).toBe(0xab);
  });

  it('overwrites an existing entry cleanly (no chunk leaks)', async () => {
    const { cache, db } = makeCache();
    const k = key(0, 99);
    cache.set(k, new Uint8Array(100).fill(1));
    await new Promise((r) => setTimeout(r, 20));
    cache.set(k, new Uint8Array(100).fill(2));
    await new Promise((r) => setTimeout(r, 20));
    const result = await cache.get(k);
    expect(result).not.toBeNull();
    expect(result![0]).toBe(2);
    // Verify no stale chunks remain
    const cacheKey = `https://example.com/a.parquet::0-99::`;
    const chunks = await db.chunks.where('cacheKey').equals(cacheKey).count();
    expect(chunks).toBe(1); // 100 bytes < 2MB, exactly one chunk
  });

  it('clear removes all stored entries', async () => {
    const { cache } = makeCache();
    cache.set(key(0, 9), new Uint8Array(10).fill(5));
    await new Promise((r) => setTimeout(r, 20));
    await cache.clear();
    expect(await cache.get(key(0, 9))).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test -- indexeddb
```

Expected: FAIL — `Cannot find module '@/cache/db'`.

- [ ] **Step 3: Create Dexie database definition**

Create `src/cache/db.ts`:

```ts
import Dexie, { type Table } from 'dexie';

export interface RangeChunk {
  id?: number;
  cacheKey: string; // "${url}::${start}-${end}::${etag ?? ''}::${lastModified ?? ''}"
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
```

- [ ] **Step 4: Create IndexedDBCache**

Create `src/cache/indexeddb.ts`:

```ts
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
    const chunks = await this.db.chunks.where('cacheKey').equals(cacheKey).sortBy('chunkIndex');
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
```

- [ ] **Step 5: Run — expect all 5 tests to pass**

```bash
pnpm test -- indexeddb
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/cache/db.ts src/cache/indexeddb.ts src/cache/indexeddb.test.ts
git commit -m "feat(cache): L2 IndexedDB cache with 2MB chunking via Dexie"
```

---

### Task 5: Tiered Cache Coordinator

**Files:**

- Create: `src/cache/tiered.ts`
- Create: `src/cache/tiered.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/cache/tiered.test.ts`:

```ts
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
    expect(await l1.get(key(0))).toEqual(data); // L1 warmed
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test -- tiered
```

Expected: FAIL — `Cannot find module '@/cache/tiered'`.

- [ ] **Step 3: Implement TieredCache**

Create `src/cache/tiered.ts`:

```ts
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
      this.l1.set(key, l2Hit); // warm L1 on L2 hit
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
```

- [ ] **Step 4: Run — expect all 5 tests to pass**

```bash
pnpm test -- tiered
```

Expected: 5 passed.

- [ ] **Step 5: Run full test suite — all 32 + new tests pass**

```bash
pnpm test
```

Expected: all tests pass (32 existing + 22 new = 54).

- [ ] **Step 6: Commit**

```bash
git add src/cache/tiered.ts src/cache/tiered.test.ts
git commit -m "feat(cache): tiered L1→L2 coordinator with L1 warm-up on L2 hit"
```

---

## Milestone 2: Wire Cache + Upgrade SW

### Task 6: Wire TieredCache into HttpTransport

**Files:** Modify `src/state/queryService.ts`

`StubCache` currently always misses. Replace it with `TieredCache(MemoryLRU, IndexedDBCache)`. No tests needed — existing transport tests mock fetch and don't test the cache layer.

- [ ] **Step 1: Update queryService.ts**

Replace the entire file content:

```ts
import { EngineClient } from '@/engine/client';
import { HttpTransport } from '@/transport/http';
import { MemoryLRU } from '@/cache/memory';
import { IndexedDBCache } from '@/cache/indexeddb';
import { TieredCache } from '@/cache/tiered';
import { db } from '@/cache/db';
import type { QueryHandle } from '@/engine/types';

let engine: EngineClient | null = null;

const cache = new TieredCache(new MemoryLRU(), new IndexedDBCache(db));
const transport = new HttpTransport({ cache });

export function getTransport(): HttpTransport {
  return transport;
}

export function getEngine(): EngineClient {
  if (!engine) engine = new EngineClient();
  return engine;
}

export function shutdownEngine(): void {
  engine?.shutdown();
  engine = null;
}

export type { QueryHandle };
```

- [ ] **Step 2: Typecheck and test**

```bash
pnpm typecheck && pnpm test
```

Expected: all tests pass, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/state/queryService.ts
git commit -m "feat(cache): wire TieredCache(MemoryLRU, IndexedDBCache) into HttpTransport"
```

---

### Task 7: Service Worker Range Cache

**Files:** Modify `public/sw.js`

The SW intercepts DuckDB's httpfs fetch calls (which HttpTransport does not see). It caches range responses using the SW Cache API — no Dexie needed here because the Cache API is native to the SW context, requires no imports, and persists across SW restarts.

Cache key strategy: encode `originalURL::Range` as a fake HTTPS URL so the Cache API can store it without matching issues.

- [ ] **Step 1: Replace public/sw.js**

```js
// Service Worker — Phase 2: intercepts range requests from DuckDB httpfs and
// app transport, caches responses in SW Cache API.

const CACHE_NAME = 'wasm-db-ranges-v1';
const ORIGIN = self.location.origin;

/** Encode a URL + Range header as a stable Cache API lookup key. */
function rangeCacheKey(url, rangeHeader) {
  return (
    'https://cache.wasm-db.invalid/v1?u=' +
    encodeURIComponent(url) +
    '&r=' +
    encodeURIComponent(rangeHeader)
  );
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  // Delete any caches from previous SW versions.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const rangeHeader = request.headers.get('Range');

  // Only cache external range requests — never intercept local app assets.
  if (!rangeHeader || request.url.startsWith(ORIGIN)) {
    event.respondWith(fetch(request));
    return;
  }

  const cacheKey = rangeCacheKey(request.url, rangeHeader);

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;

      const response = await fetch(request);
      // Cache successful partial-content and full-content responses.
      if (response.status === 206 || response.status === 200) {
        cache.put(cacheKey, response.clone());
      }
      return response;
    }),
  );
});
```

- [ ] **Step 2: Typecheck (main app — SW is plain JS, excluded from tsc)**

```bash
pnpm typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Verify dev server still starts and SW registers**

```bash
pnpm dev &
# wait ~3s, then check SW registration
curl -s http://localhost:5173/sw.js | head -5
# Expected: first line of the new sw.js
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add public/sw.js
git commit -m "feat(sw): cache range requests via SW Cache API for DuckDB httpfs"
```

---

## Milestone 3: Zustand + Persistence

### Task 8: Zustand Store with Persist

**Files:**

- Create: `src/state/store.ts`
- Create: `src/state/store.test.ts`

The existing `queryReducer` and `initialState` stay unchanged. The Zustand store wraps them. `parquetURL` and `queryText` are persisted to `localStorage`; everything else resets on reload.

- [ ] **Step 1: Write failing tests**

Create `src/state/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { initialState } from '@/state/queryState';

describe('useQueryStore persist', () => {
  beforeEach(() => {
    // Clear localStorage between tests to avoid cross-test bleed
    localStorage.clear();
    // Reset the module so the store re-hydrates from clean storage
    vi.resetModules();
  });

  it('parquetURL survives a simulated reload', async () => {
    const { useQueryStore } = await import('@/state/store');
    useQueryStore.getState().dispatch({ type: 'SET_URL', url: 'https://example.com/a.parquet' });

    // Simulate reload: blow away in-memory state while keeping localStorage
    useQueryStore.setState({ ...initialState, dispatch: useQueryStore.getState().dispatch });
    await useQueryStore.persist.rehydrate();

    expect(useQueryStore.getState().parquetURL).toBe('https://example.com/a.parquet');
  });

  it('queryText survives a simulated reload', async () => {
    const { useQueryStore } = await import('@/state/store');
    useQueryStore.getState().dispatch({ type: 'SET_QUERY', sql: 'SELECT id FROM parquet_scan()' });

    useQueryStore.setState({ ...initialState, dispatch: useQueryStore.getState().dispatch });
    await useQueryStore.persist.rehydrate();

    expect(useQueryStore.getState().queryText).toBe('SELECT id FROM parquet_scan()');
  });

  it('status is reset to idle on reload (not persisted)', async () => {
    const { useQueryStore } = await import('@/state/store');
    // Force status to 'executing' (normally set via QUERY_START)
    useQueryStore.setState({ status: 'executing' });

    useQueryStore.setState({ ...initialState, dispatch: useQueryStore.getState().dispatch });
    await useQueryStore.persist.rehydrate();

    expect(useQueryStore.getState().status).toBe('idle');
  });

  it('results array is empty on reload (not persisted)', async () => {
    const { useQueryStore } = await import('@/state/store');
    useQueryStore.setState({ results: [{ rows: [{ id: 1 }] }] });

    useQueryStore.setState({ ...initialState, dispatch: useQueryStore.getState().dispatch });
    await useQueryStore.persist.rehydrate();

    expect(useQueryStore.getState().results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test -- store
```

Expected: FAIL — `Cannot find module '@/state/store'`.

- [ ] **Step 3: Create the Zustand store**

Create `src/state/store.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { queryReducer, initialState } from './queryState';
import type { QueryState, QueryAction } from './queryState';

export interface QueryStore extends QueryState {
  dispatch: (action: QueryAction) => void;
}

export const useQueryStore = create<QueryStore>()(
  persist(
    (set) => ({
      ...initialState,
      dispatch: (action: QueryAction) =>
        set((state) => ({ ...queryReducer(state as QueryState, action) })),
    }),
    {
      name: 'wasm-db-query',
      // Only persist user-authored state; transient query results reset on reload
      partialize: (state) => ({
        parquetURL: state.parquetURL,
        queryText: state.queryText,
      }),
    },
  ),
);
```

- [ ] **Step 4: Run — expect all 4 tests to pass**

```bash
pnpm test -- store
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/state/store.ts src/state/store.test.ts
git commit -m "feat(state): Zustand store with localStorage persist for parquetURL + queryText"
```

---

### Task 9: Migrate App.tsx to Zustand

**Files:** Modify `src/App.tsx`

Replace `useReducer(queryReducer, initialState)` with `useQueryStore`. The rest of the component is unchanged structurally — just swap the state source.

- [ ] **Step 1: Update App.tsx**

Replace the import section and state initialization only (everything after is unchanged):

```ts
import { useCallback, useRef, useEffect } from 'react';
import { useQueryStore } from '@/state/store';
import { initialState } from '@/state/queryState';
import { getEngine, getTransport, shutdownEngine } from '@/state/queryService';
import { AppError, TransportError, QueryError, QueryCancelledError } from '@/errors';
import { URLInput } from '@/ui/URLInput';
import { SQLEditor } from '@/ui/SQLEditor';
import { ResultsTable } from '@/ui/ResultsTable';
import { StatusBar } from '@/ui/StatusBar';
import { ErrorPanel } from '@/ui/ErrorPanel';
import type { QueryHandle } from '@/state/queryService';

export default function App() {
  const parquetURL = useQueryStore((s) => s.parquetURL);
  const queryText = useQueryStore((s) => s.queryText);
  const status = useQueryStore((s) => s.status);
  const results = useQueryStore((s) => s.results);
  const error = useQueryStore((s) => s.error);
  const rowCount = useQueryStore((s) => s.rowCount);
  const dispatch = useQueryStore((s) => s.dispatch);

  const cancelRef = useRef<(() => void) | null>(null);
  const probeAbortRef = useRef<AbortController | null>(null);

  // Shutdown worker on unmount
  useEffect(() => () => shutdownEngine(), []);

  // Sync URL from hash param on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const url = params.get('url');
    if (url) dispatch({ type: 'SET_URL', url });
  }, [dispatch]);

  // When URL changes, update the parquet_scan URL in-place — preserves user edits
  useEffect(() => {
    if (!parquetURL) return;
    const next = queryText
      .replace('__URL__', parquetURL)
      .replace(/parquet_scan\('[^']*'\)/g, `parquet_scan('${parquetURL}')`);
    if (next !== queryText) dispatch({ type: 'SET_QUERY', sql: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parquetURL]);

  const handleProbe = useCallback(async () => {
    probeAbortRef.current?.abort();
    const controller = new AbortController();
    probeAbortRef.current = controller;
    dispatch({ type: 'PROBE_START' });
    try {
      await getTransport().probeURL(parquetURL, controller.signal);
      dispatch({ type: 'PROBE_DONE' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      dispatch({
        type: 'ERROR',
        error: err instanceof AppError ? err : new TransportError(String(err)),
      });
    } finally {
      probeAbortRef.current = null;
    }
  }, [parquetURL, dispatch]);

  const handleRun = useCallback(async () => {
    dispatch({ type: 'QUERY_START' });
    let handle: QueryHandle | null = null;
    try {
      handle = await getEngine().runQuery(queryText);
      cancelRef.current = () => handle?.cancel();
      let total = 0;
      for await (const batch of handle.stream) {
        dispatch({ type: 'BATCH_RECEIVED', batch });
        total += batch.rows.length;
      }
      dispatch({ type: 'QUERY_DONE', rowCount: total });
    } catch (err) {
      if (err instanceof QueryCancelledError) return;
      dispatch({
        type: 'ERROR',
        error: err instanceof AppError ? err : new QueryError(String(err)),
      });
    } finally {
      cancelRef.current = null;
    }
  }, [queryText, dispatch]);

  const handleCancel = useCallback(() => {
    probeAbortRef.current?.abort();
    cancelRef.current?.();
    dispatch({ type: 'CANCEL' });
  }, [dispatch]);

  const isExecuting = status === 'executing' || status === 'probing';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#111',
        color: '#e0e0e0',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <URLInput
        value={parquetURL}
        status={status}
        onChange={(url) => dispatch({ type: 'SET_URL', url })}
        onProbe={handleProbe}
      />
      <div style={{ padding: '0 12px 8px' }}>
        <SQLEditor
          value={queryText}
          disabled={isExecuting}
          onChange={(sql) => dispatch({ type: 'SET_QUERY', sql })}
          onRun={handleRun}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button
            onClick={handleRun}
            disabled={isExecuting || !parquetURL.trim()}
            aria-label="Run query"
            style={{ padding: '6px 16px' }}
          >
            {status === 'executing' ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>
      {error && <ErrorPanel error={error} />}
      <ResultsTable batches={results} rowCount={rowCount} />
      <StatusBar status={status} rowCount={rowCount} onCancel={handleCancel} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint + full test suite**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(state): migrate App.tsx from useReducer to Zustand store"
```

---

## Milestone 4: E2E + Merge

### Task 10: Phase 2 E2E Tests

**Files:** Create `tests/e2e/phase2.spec.ts`

Test that `parquetURL` and `queryText` survive a real browser page reload (not mocked).

- [ ] **Step 1: Write E2E tests**

Create `tests/e2e/phase2.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet';

test.describe('Phase 2 — state persistence', () => {
  test('parquetURL persists across page reload', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.reload();
    await expect(page.getByLabel('Parquet file URL')).toHaveValue(FIXTURE_URL);
  });

  test('custom SQL query persists across page reload', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    // Wait for URL→SQL auto-populate to fire
    await page.waitForTimeout(100);
    // Type a custom query in the editor
    const editor = page.getByLabel('SQL editor');
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type("SELECT id FROM parquet_scan('" + FIXTURE_URL + "') LIMIT 1");
    await page.reload();
    await expect(editor).toContainText('SELECT id');
  });

  test('status resets to Ready after reload (not persisted)', async ({ page }) => {
    await page.goto('/');
    await page.reload();
    await expect(page.getByText('Ready')).toBeVisible();
  });

  test('results are empty after reload (not persisted)', async ({ page }) => {
    await page.goto('/');
    await page.reload();
    // No table should be visible (no results from previous session)
    await expect(page.locator('table')).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests on Chromium**

```bash
pnpm exec playwright test tests/e2e/phase2.spec.ts --project=chromium
```

Expected: 4 passed.

- [ ] **Step 3: Run full unit + E2E suite**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm exec playwright test --project=chromium
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/phase2.spec.ts
git commit -m "test(e2e): Phase 2 state persistence — URL, query, and status across reload"
```

---

### Task 11: Merge + Tag phase2-complete

- [ ] **Step 1: Final verification on main**

Ensure you are on `main` (or merge `feat/phase2` → `main` if on a branch).

```bash
git checkout main   # or: git merge --no-ff feat/phase2 -m "Merge branch 'feat/phase2'"
```

- [ ] **Step 2: Run full suite on main**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm exec playwright test --project=chromium
```

Expected: all pass.

- [ ] **Step 3: Tag**

```bash
git tag phase2-complete
git log --oneline -8
```

Expected: tag appears on the commit graph.

---

## Self-Review

### Spec Coverage

| Phase 2 requirement                 | Covered by task               |
| ----------------------------------- | ----------------------------- |
| L1 memory LRU cache                 | Task 2                        |
| L2 IndexedDB (Dexie)                | Task 4                        |
| Firefox 2MB chunker                 | Task 3                        |
| L1→L2 tiered read-through           | Task 5                        |
| HttpTransport uses real cache       | Task 6                        |
| SW intercepts DuckDB range requests | Task 7                        |
| Zustand + persist middleware        | Task 8                        |
| Reload-safety (URL + query survive) | Task 8 (unit) + Task 10 (E2E) |
| Transient state resets on reload    | Task 8 (unit) + Task 10 (E2E) |

**Not in scope (deferred):**

- L3 OPFS — Phase 3
- Interval-tree range coalescing — Phase 3
- Zustand actions replacing queryService singleton — Phase 3
- Parquet footer metadata cache — Phase 3
- `pnpm test:reload` reload invariant CLI suite — Phase 3 (infrastructure needed)

### Type Consistency Check

- `ICache.get/set/clear` — defined in `types.ts`, implemented consistently in `memory.ts`, `indexeddb.ts`, `tiered.ts`
- `CacheKey` — same interface used in all implementations, keyed by `url::start-end::etag::lastModified`
- `splitIntoChunks`/`joinChunks` — exported from `chunker.ts`, imported by `indexeddb.ts`
- `WasmDbCacheDb` / `createDb` — exported from `db.ts`, used by `indexeddb.ts` and tests
- `useQueryStore` — `dispatch` callback wraps `queryReducer` which accepts `QueryAction`, same union type as Phase 1
- App.tsx selectors — each reads from `QueryStore` which extends `QueryState`, all field names match
