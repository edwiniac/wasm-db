# Caching — Three-Tier Strategy, Eviction, Browser Quirks

Load when: touching `src/cache/`, changing what gets cached, debugging quota errors, or
adjusting range-coalescing behaviour. Don't load for unrelated work.

## The Three Tiers

| Tier | Where | Purpose | Size Budget | Eviction |
|------|-------|---------|-------------|----------|
| L1 | In-memory `Map` (LRU) | Hot byte ranges this session | ≤100 MB | LRU on insert |
| L2 | IndexedDB (Dexie) | Persisted byte ranges, Parquet footers, row-group stats | ≤80% of quota | LRU + quota-aware prune |
| L3 | OPFS (when available) | Large spill, >100MB scans, temp DuckDB files | User-controlled | Manual purge button |

L1 is always populated. L2 is populated unless a quota error is hit (then we warn and run
memory-only). L3 is opt-in via a preference — surface the toggle in settings, don't default
it on.

## Cache Key Schema

```ts
type CacheKey = {
  url: string;          // full URL, no query-string stripping
  start: number;        // byte offset
  end: number;          // inclusive
  etag?: string;        // if the server gave one
  lastModified?: string;// fallback
  contentLength: number;// sanity check on server consistency
};
```

Serialized as `sha256(url + ':' + start + '-' + end + ':' + fingerprint)` where
`fingerprint = etag ?? lastModified ?? 'cl:' + contentLength`. If all three are absent,
refuse to cache — cache keys must be verifiable.

See `src/cache/keying.ts`. Do not invent new keying schemes.

## Range Coalescing

The interval tree in `src/cache/ranges.ts` tracks *which byte ranges* are cached per URL.
When a request for `[a, b]` arrives:

1. Look up `url` in the tree.
2. Compute gaps: the sub-ranges of `[a, b]` not already covered.
3. Coalesce adjacent gaps into single HTTP multi-range requests (`Range: bytes=0-100,500-600`).
4. On response, splice each returned chunk back into place, update the tree.

Tests for this live in `src/cache/__tests__/ranges.test.ts`. Adjacency merging has subtle
off-by-one cases around inclusive-vs-exclusive ends — run the full suite before claiming a
fix. The Parquet row-group boundaries are a common gotcha.

## Firefox IndexedDB 2MB Limit

Individual values over ~2MB throw `DataError` on Firefox. `src/cache/chunker.ts` splits any
entry over 1.5MB into 1MB segments with a parent metadata record:

```
{ key: 'abc...', type: 'chunked', chunks: 4, totalBytes: 3_800_000 }
{ key: 'abc...#0', type: 'chunk', index: 0, bytes: Uint8Array(1_000_000) }
{ key: 'abc...#1', type: 'chunk', index: 1, bytes: Uint8Array(1_000_000) }
...
```

Reads transparently reassemble. Do not write raw bytes to IDB — always go through
`cache.set()`. Direct Dexie access in new code fails review.

## Safari Quirks

- **7-day eviction**: if the site isn't visited for a week, Safari purges IDB. We can't stop
  it; detect an empty cache after a prior session and treat it as cold start.
- **Quota is miserly in private mode**: a few MB. Catch `QuotaExceededError` in
  `cache.set()`, log a warning, fall back to L1 only. Do not retry; it will fail again.
- **No OPFS on older versions**: `src/util/featureDetect.ts:hasOPFS()` gates L3. If false,
  hide the L3 UI toggle.
- **No `memory64`**: DuckDB memory ceiling is 1GB on Safari vs 2GB elsewhere. Memory tuner
  in `src/engine/config.ts` reads the detection flag.

## Quota-Aware Pruning

Runs on:
- `cache.set()` failure with `QuotaExceededError`.
- App start, if `navigator.storage.estimate()` reports usage >80%.
- Manual "Clear cache" button.

Algorithm:
1. Fetch all L2 keys with their `lastAccessed` timestamps (kept as a separate Dexie index).
2. Sort ascending by `lastAccessed`.
3. Delete oldest 25% of entries.
4. Recheck usage. If still >80%, repeat until under 60% or the store is empty.

Parquet footers are exempt unless explicitly cleared — they're tiny (<16KB) and their absence
forces a full refetch of every data source's metadata.

## What NOT to Cache

- Final query result sets (unless user explicitly pins). Unbounded growth.
- Temp DuckDB shuffle/sort data — goes to OPFS spill, cleaned up per-query.
- Data from URLs marked `Cache-Control: no-store`. Respect it.
- Authenticated URLs with short-lived signatures — cache key would expire with the signature.
  Detect signed-URL patterns and skip L2 (L1 is fine for the session).

## Debugging Cache Issues

`?debug=cache` adds a panel showing L1/L2/L3 contents, hit rate, and quota usage. The panel
reads directly via `cache.inspect()` — don't paste raw Dexie queries into the console, they
bypass the chunker and return garbage for chunked entries.

Common symptoms:
- **"Query is slow every time"**: cache miss. Check `cache.inspect().hits / .misses`. Usually
  an ETag changing per request (CDN issue) — verify with browser devtools Network tab.
- **"Storage full" warnings**: quota prune isn't keeping up. Check `navigator.storage.estimate()`
  in console. L3 may have leftover spill files — run `cache.purgeSpill()`.
- **"Data looks stale"**: Last-Modified fallback was used and didn't change. Force refresh
  by deleting the URL's cache via the debug panel or incognito.

## Test Fixtures

`tests/fixtures/parquet/` has:
- `tiny.parquet` — 1 row group, <100KB, for schema and smoke tests.
- `chunked.parquet` — large enough to trigger the 2MB chunker (3MB metadata blob in a column).
- `signed/` — URLs with query-string signatures for signed-URL detection tests.
- `cors-broken/` — served without CORS headers for the failure-path tests.

Add a fixture for any new caching behaviour; don't rely on live URLs in tests.
