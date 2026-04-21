# Product Specification — wasm-db

> **Note for Claude Code**: this file is the authoritative product requirements document.
> Load it only when deriving new features, auditing behaviour against the spec, or scoping a
> phase of work. It intentionally uses RFC-style MUST/SHOULD/MUST NOT language — that's the
> format the requirements were authored in. It is *not* a how-to; see `../CLAUDE.md` for
> operational instructions and `agent/*.md` for domain deep-dives.

---

## 1. Project Identity & Core Value

**Product**: A browser-native analytical SQL engine that queries remote Parquet files via HTTP range requests. No backend infrastructure for read-heavy analytical workloads.

**Core Value Proposition**: Zero-infrastructure, privacy-preserving data exploration with exceptional UX and sophisticated caching.

**Success Metric**: Users can explore multi-gigabyte Parquet datasets from public URLs with sub-second query latency after warm cache, without ever leaving their browser.

## 2. Non-Negotiable Architectural Principles

These principles are absolute. Violations will cause unrecoverable complexity or performance cliffs.

### 2.1 Layer Separation
- **MUST** maintain strict separation: Query Engine (DuckDB-WASM) | Transport (HTTP range requests) | Cache (IndexedDB/OPFS) | UI (any framework)
- **MUST** implement a Service Worker as the network interception layer – this enables offline-first, request deduplication, and cache coordination.
- **MUST NOT** allow caching logic to leak into transport layer components.
- **MUST NOT** entangle UI state with query execution (use reactive state management with serializable stores).

### 2.2 Stateless & Reload-Safe
- **MUST** persist all application state (queries, results metadata, UI tabs, schema preferences) to IndexedDB or URL parameters.
- **MUST** survive full page reload without losing user context.
- **MUST** gracefully handle worker termination on reload – queries in flight are abandoned; UI must restore last known state.
- **SHOULD** use Zustand with `persist` middleware or Redux Toolkit with redux-persist.

### 2.3 Progressive Enhancement
- **MUST** work without multi-threading (SharedArrayBuffer) if COOP/COEP headers are absent – degrade to single-threaded but document performance impact.
- **MUST** detect browser capabilities (memory64, OPFS, storage quota) and adapt behavior.
- **MUST NOT** crash or hard-fail on missing APIs; provide fallbacks or clear error messages.

## 3. Engine Integration (DuckDB-WASM)

### 3.1 Mandatory Configuration
- **MUST** instantiate DuckDB in a dedicated Web Worker to prevent UI blocking.
- **MUST** configure the worker with proper lifecycle management (termination, restart on error).
- **MUST** use the official `@duckdb/duckdb-wasm` package; do not fork or modify internals.
- **MUST** set memory limits explicitly: `DuckDBConfig` with `maximum_memory` (start with 1GB, user-configurable up to 2GB).
- **SHOULD** enable `allow_unsigned_extensions` only for trusted environments; disable in production.

### 3.2 Query Execution Contract
- **MUST** support query cancellation via `db.asyncQuery` and `connection.cancel()`.
- **MUST** implement a timeout wrapper (default 30 seconds, user-configurable).
- **MUST** capture and sanitize DuckDB errors into user-friendly messages (e.g., "Column 'x' not found – did you mean 'y'?").
- **SHOULD** return results in batches via `stream` API to display partial results.

### 3.3 Threading & Worker Architecture
- **MUST** detect if `SharedArrayBuffer` and cross-origin isolation are active. If not, fallback to single-threaded worker (still non-blocking) and show performance warning.
- **MUST** use at most one DuckDB instance per tab; multiple queries can be serialized or use separate connections.
- **SHOULD** implement a query queue with concurrency limit (1 or 2) to avoid memory contention.

## 4. Data Access Layer (HTTP + Parquet)

### 4.1 HTTP Range Request Requirements
- **MUST** use `Range: bytes=start-end` headers for all Parquet file reads.
- **MUST** verify server supports range requests before attempting query: send a `HEAD` or `Range: bytes=0-0` and check `Accept-Ranges: bytes` and `206 Partial Content`.
- **MUST** implement retry logic with exponential backoff for transient failures (network hiccups, 5xx).
- **MUST** handle HTTP 416 (Range Not Satisfiable) gracefully – fallback to full fetch for small files.
- **SHOULD** coalesce multiple pending range requests into a single multi-range request (HTTP `Range: bytes=0-100,200-300`) to reduce round trips.

### 4.2 Parquet-Specific Behavior
- **MUST** fetch the Parquet footer (last 8-16KB) before any data request – it contains schema and row group metadata.
- **MUST** cache footers in IndexedDB indefinitely (or until file ETag changes) to avoid repeated metadata fetches.
- **MUST** use DuckDB's `parquet_scan` with `row_group_pruning` and `column_pruning` enabled (default).
- **SHOULD** expose row group statistics (min/max values) to UI for query cost estimation.

### 4.3 Server Compatibility Checklist
For each data source URL, validate:
- [ ] CORS headers: `Access-Control-Allow-Origin: *` or explicit origin.
- [ ] `Accept-Ranges: bytes` present.
- [ ] `Content-Length` header provided.
- [ ] No aggressive caching of range requests that breaks partial content (test with `If-Range`).

If any check fails, display actionable error and suggest alternatives (local file upload, proxy).

## 5. Caching Architecture (The Make-or-Break Layer)

### 5.1 Three-Tier Cache Structure

| Tier | Storage | Contents | Eviction Policy |
|------|---------|----------|-----------------|
| L1 | Memory (LRU Map) | Recently used byte ranges (<50MB total) | LRU, max 100MB |
| L2 | IndexedDB | Byte range chunks, Parquet footers, row group metadata | LRU, respect quota |
| L3 | OPFS (optional) | Large byte range cache, spill-to-disk for queries | Manual cleanup |

### 5.2 IndexedDB Constraints & Workarounds
- **Firefox limitation**: Individual values limited to ~2MB. **MUST** chunk any cache entry >1.5MB into 1MB segments with metadata tracking.
- **Safari private mode**: Reduced quota and auto-deletion. **MUST** detect `QuotaExceededError` and fall back to L1 (memory) with warning.
- **Quota management**: **MUST** implement LRU eviction across all cache keys. Periodically (or on error) prune least recently used entries until under 80% of quota.
- **Key design**: Use `hash(url + rangeStart + rangeEnd + etag)` as cache key. Include ETag or last-modified for invalidation.

### 5.3 Byte Range Cache (L2) Detailed Rules
- **MUST** store individual HTTP range responses as discrete cache entries – do not concatenate.
- **MUST** support partial overlapping requests: if bytes 0-1000 are cached and request 500-1500 arrives, fetch only 1001-1500.
- **MUST** implement an interval tree to track cached ranges per URL for coalescing and lookup.
- **SHOULD** pre-fetch adjacent ranges when sequential scan is detected (e.g., `LIMIT 100` followed by `LIMIT 100 OFFSET 100`).

### 5.4 Metadata & Statistics Cache
- **MUST** cache Parquet footers (schema + row group offsets + column stats) separately from byte ranges.
- **MUST** invalidate metadata cache when ETag or `Last-Modified` changes.
- **SHOULD** store column statistics (min/max, null counts) in a queryable format (IndexedDB with indexes on column name) to accelerate predicate pushdown without fetching footer again.

### 5.5 Query Result Cache
- **MUST** cache final query results (or partial result sets) when explicitly enabled by user (e.g., "Pin this result").
- **MUST NOT** automatically cache all results – this leads to unbounded storage growth.
- **SHOULD** allow user to manually save result sets with tags and descriptions.

### 5.6 Cache Invalidation Rules
- **MUST** validate cached byte ranges using `If-Range` + ETag before serving from L2. If ETag mismatch, discard all ranges for that URL.
- **MUST** support TTL-based invalidation for volatile data sources (user configurable per connection).
- **MUST NOT** rely solely on ETag – some CDNs generate per-edge-node ETags. Fallback to `Last-Modified` or content hash.

## 6. Memory & Performance Constraints (Critical)

### 6.1 WASM Memory Limits
- **Reality**: Usable memory per tab: 1-2GB in most browsers, 4GB theoretical max (memory64 not in Safari). DuckDB may need 2-3x dataset size for hash joins/sorting.
- **MUST** monitor memory usage via `performance.memory` (Chrome) or `WebAssembly.Memory.buffer.byteLength`. Show warning at 80% of limit.
- **MUST** implement progressive loading patterns:
  - For large scans: encourage `LIMIT` + `OFFSET` or partition by date ranges.
  - For aggregations: suggest pre-filtering or sampling.
- **SHOULD** implement spill-to-disk using OPFS when memory exceeds threshold (complex – requires DuckDB's `temp_directory` set to OPFS path).

### 6.2 Query Execution Guardrails
| Guardrail | Default | User Override |
|-----------|---------|---------------|
| Max rows scanned (estimate) | 10 million | Yes |
| Max bytes scanned (estimate) | 500 MB | Yes |
| Query timeout | 30 seconds | Yes |
| Max result set size | 100,000 rows | Yes (unlimited with warning) |

- **MUST** estimate scan size before query execution using Parquet row group statistics and `EXPLAIN` analysis.
- **MUST** show prominent warning if estimates exceed guardrails and require explicit confirmation.

### 6.3 Network Performance Optimizations
- **MUST** use HTTP/2 or HTTP/3 to enable concurrent range requests. Detect protocol and warn if HTTP/1.1 is used (serialized ranges).
- **MUST** implement request deduplication: if two components request the same byte range simultaneously, only one fetch is issued; others wait on a shared promise.
- **SHOULD** implement adaptive prefetch: after a full row group is read, prefetch the next row group in background if bandwidth allows.

### 6.4 Cold Start Mitigation
- **MUST** lazy-load DuckDB-WASM – load only when user initiates first query or explicitly clicks "Initialize Engine".
- **MUST** display a skeleton UI and loading progress during WASM download and compilation.
- **SHOULD** cache WASM binary in service worker on first visit for instant subsequent loads.
- **SHOULD** use streaming compilation (`WebAssembly.instantiateStreaming`).

## 7. Security & Access Control

### 7.1 CORS & Private Data
- **MUST** display clear instructions for enabling CORS on S3, GCS, Azure, or Cloudflare R2.
- **MUST** support signed URLs (S3 pre-signed, Azure SAS) via user-provided URL input.
- **MUST NOT** embed any secrets (API keys, tokens) in client-side code. For OAuth, use Authorization Code Flow with PKCE.
- **SHOULD** provide a "Local File Upload" fallback for users who cannot configure CORS.

### 7.2 Sandboxing Malicious Queries
- **MUST** run all DuckDB queries inside the Web Worker – no `eval` or dynamic code generation outside WASM.
- **MUST** implement query cost estimation and abort if estimates exceed limits (DoS protection).
- **MUST** allow user to cancel any running query with a prominent "Stop" button.
- **SHOULD** sanitize query text to prevent XSS in result display (escape HTML, use textContent).

### 7.3 Query Sharing Privacy
- **MUST NOT** include private data URLs or credentials in shared links.
- **MUST** require explicit user opt-in for sharing any query that references a non-public data source.
- **SHOULD** implement "Share as Snapshot" – upload a sanitized version of the query + public data reference to a short-link service.

## 8. User Experience & Interface Standards

### 8.1 SQL Editor Requirements
- **MUST** provide autocomplete for SQL keywords, table names (from schema), and column names.
- **MUST** include syntax highlighting (any library: Monaco, CodeMirror, or simple Prism.js).
- **MUST** show query history (stored in IndexedDB) with search and re-run.
- **SHOULD** support multiple named queries/tabs with local persistence.

### 8.2 Schema Exploration & Preview
- **MUST** display schema tree with nested structures (structs, lists, maps) flattened or expandable.
- **MUST** show a preview of first 100 rows instantly using cached first row group – no full scan.
- **MUST** provide column statistics: distinct count, null count, min/max (from Parquet metadata) when available.
- **SHOULD** generate SQL snippets from schema explorer (e.g., click on nested field to auto-complete path).

### 8.3 Progressive Feedback (No Blank Spinners)
Every long operation **MUST** display:
- What is happening (e.g., "Fetching Parquet footer (12KB)...")
- Current progress (e.g., "Row group 2 of 7")
- Estimated time remaining (if estimable)
- Cancel button

### 8.4 Error Messaging
- **MUST** translate DuckDB errors into plain English with actionable suggestions.
  - `Binder Error: Column "revenue" not found` → "The column 'revenue' doesn't exist. Did you mean 'total_revenue'? Columns available: total_revenue, date, product_id"
  - `Invalid Input Error: File not found` → "Unable to access the Parquet file. Check the URL, CORS, and server availability."
- **MUST** show network errors (CORS, 404, range request failures) with troubleshooting links.
- **SHOULD** include a "Copy error details" button with full DuckDB trace for advanced users.

### 8.5 Query Cost Estimation UI
- **MUST** show before execution: "This query will scan approximately 156 MB across 3 row groups."
- **MUST** color-code estimate: green (<50MB), yellow (50-200MB), red (>200MB).
- **MUST** require confirmation for red estimates (user clicks "Run anyway").

## 9. Query Sharing & Collaboration

### 9.1 URL Encoding Strategy
- **MUST** support two sharing modes:
  1. **Short hash** (recommended): Store query + data source metadata in IndexedDB keyed by a hash (e.g., SHA-256). Share URL contains only hash. Recipient resolves locally if previously seen, else shows a "Query not found" message with option to import.
  2. **Direct encoding**: For short queries (<1500 chars after compression), compress with LZ-String, then Base64URL encode. Fall back to short hash if exceeds limit.
- **MUST NOT** rely on external backend for core sharing; make local resolution primary, short-link service optional.

### 9.2 Schema Fingerprint
- **MUST** compute a hash of the Parquet schema (column names + types + order) and include it in shared URL/hash.
- **MUST** when loading a shared query, compare current schema fingerprint with stored one. If mismatch, show warning: "The schema has changed since this query was created. Results may differ."
- **SHOULD** allow user to ignore warning and run query anyway.

### 9.3 Versioning & Snapshot Mode
- **MUST** support two query execution modes:
  - **Live**: Always fetches latest data (respects ETag).
  - **Snapshot**: Queries a specific version (if object storage supports versioning) or caches all data ranges at share time.
- **SHOULD** for snapshot mode, optionally upload the Parquet file to a public cache (e.g., IPFS) to ensure reproducibility.

## 10. Reliability & Error Handling

### 10.1 Partial Data Failure
- **MUST** implement automatic retry for failed range requests (max 3 retries, exponential backoff: 100ms, 500ms, 1s).
- **MUST** implement circuit breaker: if same URL fails 5 times in 1 minute, stop requesting and show "Server unreachable" error.
- **MUST** if some row groups are unavailable but query can return partial results (e.g., `SELECT COUNT(*)` missing some groups), return with warning and list missing ranges.
- **SHOULD** allow user to retry failed row groups manually.

### 10.2 Parquet Corruption Detection
- **MUST** validate Parquet footer magic bytes (`PAR1` at end of file) before attempting query.
- **MUST** check row group offsets are within file size.
- **MUST** display specific error: "Corrupted Parquet file: [reason]. Try re-uploading or re-exporting the file."

### 10.3 Cross-Browser Testing Matrix
- **MUST** test and document compatibility for:
  - Chrome (latest, previous)
  - Firefox (latest, previous)
  - Safari (macOS latest, iOS latest)
  - Edge (Chromium)
- **MUST** handle Safari-specific issues:
    - 7-day IndexedDB eviction → implement "keepalive" ping on weekly active use.
    - Lack of memory64 → enforce lower memory limit (1GB) and show warning for large datasets.
    - OPFS unavailability → fallback to IndexedDB for spill.

## 11. Development & Debugging Practices

### 11.1 Logging & Telemetry (User-Controlled)
- **MUST** implement a structured logger that captures:
  - Query execution timings (parse, plan, fetch, execute)
  - Cache hits/misses per range request
  - Memory usage and quota errors
- **MUST** expose a debug panel (hidden behind `?debug=true` or a keyboard shortcut) showing logs, cache contents, and query plans.
- **MUST NOT** send telemetry to external servers without explicit user consent.

### 11.2 DuckDB Profiling Integration
- **MUST** expose `EXPLAIN ANALYZE` output in debug panel.
- **SHOULD** provide a visual query plan (e.g., using `d3` or simple tree view) based on DuckDB's JSON explain output.

### 11.3 Source Maps & Worker Logging
- **MUST** configure webpack/vite to generate source maps for development.
- **MUST** aggregate `console.*` logs from Web Workers to the main console with worker prefix.
- **SHOULD** implement a remote debugging proxy (optional) for mobile devices.

## 12. Deployment & Hosting Requirements

### 12.1 Static Hosting Constraints
- **MUST** be deployable to any static host: Cloudflare Pages, Netlify, Vercel, S3+CloudFront, GitHub Pages.
- **MUST** set appropriate COOP/COEP headers for multi-threading:
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```
  If host does not allow custom headers, document that multi-threading will be disabled.
- **SHOULD** provide a fallback deployment without COOP/COEP for environments that cannot set headers.

### 12.2 CDN & Range Request Caching
- **MUST** test CDN behavior with range requests before recommending.
- **MUST** set `Cache-Control: public, max-age=31536000, immutable` for WASM and static assets.
- **SHOULD** use Brotli compression for WASM binary (smaller than gzip).

### 12.3 Versioning & Cache Busting
- **MUST** use content hashes in filenames for all built assets (main.js, worker.js, duckdb.wasm).
- **MUST** implement service worker update flow: detect new version, show "Update available" banner, and activate on next reload.

## 13. Critical Pitfalls Checklist

| Category | Pitfall | Mandatory Mitigation |
|----------|---------|----------------------|
| **Memory** | WASM 4GB limit, Safari lacks memory64 | Progressive loading, query limits, monitor memory, spill to OPFS |
| **Cache** | Firefox 2MB IndexedDB value limit | Chunk cache entries into ≤1.5MB segments |
| **Cache** | Safari auto-deletes IndexedDB | Detect quota errors, fallback to memory, implement keepalive |
| **Network** | CORS not enabled on data source | Show clear error, support local file upload fallback |
| **Network** | CDN breaks range requests | Test with target CDN; implement full fetch fallback for small files |
| **Query Sharing** | URL length limits | Use hash-based local resolution + compression; optional short-link backend |
| **Schema** | Drift breaks shared queries | Include schema fingerprint in share hash; show warning on mismatch |
| **Security** | No secret storage in browser | Use OAuth PKCE; never embed credentials; signed URLs only user-provided |
| **UX** | Long WASM cold start | Lazy load, skeleton UI, service worker caching, streaming compilation |
| **Threading** | COOP/COEP headers required | Degrade gracefully to single-threaded; document setup for multi-threading |
| **Reliability** | Partial range request failures | Retry with backoff, circuit breaker, partial results with warning |
| **Dev Tools** | Hard to debug WASM | Build in-app debug panel, expose EXPLAIN ANALYZE, aggregate logs |

## 14. Phased Implementation Roadmap

### Phase 1: Core Engine & Transport (Week 1-2)
- [ ] DuckDB-WASM worker integration with basic query execution
- [ ] HTTP range request transport with retry and CORS detection
- [ ] Simple SQL editor (CodeMirror) and result table
- [ ] Support for public Parquet URLs only

### Phase 2: Caching & Persistence (Week 3-4)
- [ ] Byte-range cache in IndexedDB with LRU eviction
- [ ] Firefox chunking workaround
- [ ] Metadata cache (Parquet footers, row group stats)
- [ ] State persistence (Zustand + IndexedDB)

### Phase 3: UX Polish (Week 5-6)
- [ ] Schema explorer + data preview (first 100 rows)
- [ ] Query cost estimation using row group statistics
- [ ] Progressive loading indicators and cancellation
- [ ] User-friendly error translation

### Phase 4: Sharing & Collaboration (Week 7-8)
- [ ] Query sharing via URL hash + local IndexedDB resolution
- [ ] Schema fingerprint and drift warnings
- [ ] Snapshot mode (cache entire file on share)

### Phase 5: Advanced Features (Week 9-10+)
- [ ] Multi-file joins (support for multiple Parquet URLs in one query)
- [ ] OPFS-based large cache and spill-to-disk
- [ ] Offline mode with service worker pre-caching
- [ ] Visual query builder (optional)

---

## 15. Final Reminders for Implementation

- **Never trust the network or the cache** – always validate ETags, handle partial failures, and degrade gracefully.
- **Memory is the ultimate constraint** – design every feature with a "what if this uses 2x memory?" mindset.
- **User perception is reality** – a fast cache hit is worthless if the UI hangs or shows a blank spinner. Progressive disclosure and feedback are not optional.
- **This tool's moat is UX, not technology** – DuckDB-WASM is available to anyone. Your caching sophistication, error messages, and sharing features will determine success.

When in doubt, refer back to the **Critical Pitfalls Checklist** before writing any new feature. Every line of code must respect browser limits and provide a clear path to recovery.
