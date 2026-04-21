# Phase 1 Design — Core Engine & Transport

**Date**: 2026-04-20
**Status**: Pending user review
**Scope**: Phase 1 of 5 per SPEC.md §14
**Next step**: implementation plan (writing-plans skill)

---

## End Product (for orientation)

A zero-backend browser app. User pastes a public Parquet URL, gets a SQL editor, runs queries executed by DuckDB-WASM in a Web Worker fetching only the byte ranges it needs. Cached in browser; sub-second on repeat queries. Schema sidebar (Phase 3), shareable via URL (Phase 4). Entirely private — data never touches a server.

---

## Phase 1 Scope

Deliver a working query loop: paste URL → run SQL → see results. No caching (Phase 2), no persistence (Phase 2), no schema explorer (Phase 3), no sharing (Phase 4).

**In scope:**
- Project scaffold (Vite + React + TypeScript)
- Pass-through Service Worker (satisfies Invariant #4 from day 1)
- Typed error classes + structured logger + feature detection utilities
- Worker message protocol (typed discriminated unions)
- DuckDB-WASM worker (single instance, lifecycle, bundle selection, query + cancel)
- Engine client (owns the worker, exposes QueryHandle)
- Transport layer (CORS probe, range fetch, retry, 416 fallback)
- SQL editor (CodeMirror 6) + URL input + results table (TanStack Table)
- Loading state + cancel button + basic error display
- Unit tests for protocol, engine client, transport, featureDetect

**Explicitly out of scope (deferred):**
- Caching (L1/L2/L3) — Phase 2
- Zustand + persist — Phase 2
- Schema explorer / data preview — Phase 3
- Query cost estimation — Phase 3
- URL sharing — Phase 4

---

## Architecture

Layers (one-way, enforced by dependency-cruiser):
```
UI (React)       src/ui/
State            src/state/        ← useState/useReducer in Phase 1
Engine           src/engine/
Transport        src/transport/
Cache            src/cache/        ← stub interfaces only in Phase 1
```

### DuckDB Transport Clarification
DuckDB-WASM's `parquet_scan` makes its own internal HTTP range requests via httpfs.
Our `src/transport/` handles explicit operations WE initiate (CORS probe, footer pre-fetch).
DuckDB's httpfs fetches are intercepted by the Service Worker (Phase 2+).
In Phase 1: SW is pass-through only. DuckDB fetches via httpfs unintercepted.

---

## Component Breakdown

### 1. Project Scaffold
```
pnpm create vite wasm-db --template react-ts
```

`vite.config.ts` — critical settings:
```ts
optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] }  // required — Vite breaks WASM otherwise
assetsInclude: ['**/*.wasm']
server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } }
```

`tsconfig.json`:
```json
{ "strict": true, "skipLibCheck": true }
```
Note: `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` NOT included — incompatible with @duckdb/duckdb-wasm vendor types.

Directory structure: exactly as CLAUDE.md specifies.
Path alias `@/` → `src/` configured in both tsconfig + vite.config.

### 2. Pass-Through Service Worker (`src/sw/sw.ts`)
Registers on app start. Intercepts fetch events and passes through without modification.
Purpose: satisfies Invariant #4 ("no fetch outside src/transport/") from day 1.
Phase 2 adds cache interception logic here.

### 3. Utilities (`src/util/`)

**`featureDetect.ts`** — required before DuckDB worker initialises:
- `isCrossOriginIsolated()` → determines DuckDB bundle (coi vs eh vs mvp). Main-thread uses `window.crossOriginIsolated`; worker context uses `self.crossOriginIsolated` — the worker must call its own detection, not import from this module.
- `hasSharedArrayBuffer()` → multi-threading availability
- `hasOPFS()` → L3 cache availability (Phase 2 UI toggle)

**`logger.ts`** — structured logger:
- Auto-prefixes `[worker]` for messages from workers
- Respects `?debug=true` flag
- No `console.*` calls in shipped code — everything goes through this

### 4. Typed Errors (`src/errors/index.ts`)
```ts
TransportError   // CORS, 4xx, network failure
QueryError       // DuckDB execution error (wraps raw DuckDB message)
WorkerError      // Worker crash or protocol violation
CORSError        // extends TransportError, specific to CORS failures
RangeError       // 416 or range request not supported
```
All extend a base `AppError` with `code`, `message`, `cause?`.
UI layer translates via `src/ui/errorMessages.ts` (Phase 3 full implementation; Phase 1 shows message directly).

### 5. Worker Protocol (`src/workers/protocol.ts`)
```ts
type MainToWorker =
  | { kind: 'init';     correlationId: string; config: DuckDBConfig }
  | { kind: 'query';    correlationId: string; sql: string; opts: QueryOpts }
  | { kind: 'cancel';   correlationId: string; target: string }
  | { kind: 'shutdown'; correlationId: string };

type WorkerToMain =
  | { kind: 'ready';    correlationId: string }
  | { kind: 'batch';    correlationId: string; rows: unknown[]; done: boolean }
  | { kind: 'error';    correlationId: string; error: SerializedError }
  | { kind: 'progress'; correlationId: string; stage: string; pct: number };
```
All messages carry `correlationId` for request/response pairing.
`SerializedError`: `{ code: string; message: string; stack?: string }` — structured clone safe.

### 6. DuckDB Worker (`src/workers/duckdb.worker.ts`)
- Uses `selectBundle()` from `@duckdb/duckdb-wasm` for bundle selection: `coi` (cross-origin isolated) → `eh` (exception handling) → `mvp` (baseline)
- `featureDetect.isCrossOriginIsolated()` feeds bundle selection
- Single `AsyncDuckDB` instance per worker lifetime
- Handles all `MainToWorker` message kinds
- Query execution: `connection.query(sql)` for simple results; streams `batch` messages back
- Cancellation: `connection.cancelSent()` on receiving `cancel` message *(verify exact API name against @duckdb/duckdb-wasm docs before implementing)*
- Worker crash → sends `error` message before dying; engine client respawns

### 7. Engine Client (`src/engine/client.ts`)
Spawns and owns the DuckDB worker. Only caller of `new Worker(...)` for the DuckDB worker.

```ts
interface QueryHandle {
  cancel(): void;
  stream: AsyncIterable<Batch>;
  done: Promise<QuerySummary>;
}

class EngineClient {
  runQuery(sql: string, opts: QueryOpts): QueryHandle
  shutdown(): void
}
```

Internally: correlationId map for pending requests, message router, respawn logic on crash.

### 8. Transport Layer (`src/transport/http.ts`)

```ts
fetchRange(url: string, start: number, end: number, signal: AbortSignal): Promise<Uint8Array>
probeURL(url: string): Promise<ProbeResult>  // CORS + range support check
```

**CORS probe** (`probeURL`):
1. Send `GET` with `Range: bytes=0-0` header
2. Expect `206 Partial Content` + `Accept-Ranges: bytes`
3. If 200 or missing headers: not supported → throw `CORSError` or `RangeError`
4. Note: HEAD alone is unreliable — some CDNs omit `Accept-Ranges` from HEAD

**Retry** (in `fetchRange`):
- Max 3 attempts, exponential backoff: 100ms → 500ms → 1000ms
- Retry on: network error, 5xx
- No retry on: 4xx (except 416)
- 416 (Range Not Satisfiable): fallback to full `GET` for small files (<10MB — arbitrary threshold, configurable constant)

Cache stubs: `cache.get()` returns `null` always in Phase 1 (typed interface, no-op implementation). Transport calls it — Phase 2 replaces the stub with real L1/L2 logic.

### 9. UI Shell (`src/ui/`)

**Components:**
- `URLInput` — text input for Parquet URL + probe/validate button
- `SQLEditor` — CodeMirror 6 with SQL language pack, basic keyword autocomplete
- `ResultsTable` — TanStack Table with virtual rows (handles large result sets)
- `StatusBar` — shows: idle / fetching footer / executing query N of N / error
- `CancelButton` — visible during execution, wired to `QueryHandle.cancel()`

**State** (Phase 1 — `useState`/`useReducer`, no persistence):
- `parquetURL: string`
- `queryText: string`
- `queryState: 'idle' | 'probing' | 'executing' | 'error'`
- `results: Batch[]`
- `error: AppError | null`

**No tabs, no history, no schema tree in Phase 1.**

---

## Testing Plan

Unit tests (Vitest + jsdom, no real WASM):
- `src/workers/__tests__/protocol.test.ts` — message serialization, type narrowing, correlationId
- `src/engine/__tests__/client.test.ts` — worker lifecycle, cancel, message routing (mocked Worker)
- `src/transport/__tests__/http.test.ts` — CORS probe logic, retry backoff, 416 fallback (mocked fetch)
- `src/util/__tests__/featureDetect.test.ts` — flag detection with mocked browser APIs

E2E tests (Playwright — PR gate only):
- Chrome + Firefox + Safari: paste public Parquet URL → run `SELECT COUNT(*)` → see result
- Cancel a running query
- CORS error shown clearly for a bad URL

---

## Git Worktree Strategy

**Phase:** define contracts on `main` first, then branch.

```
main                  scaffold + shared contracts:
                        src/workers/protocol.ts
                        src/errors/index.ts
                        src/util/featureDetect.ts + logger.ts
                        src/transport/types.ts (interface only)
                        src/cache/types.ts (stub interface)

feat/phase1-engine    DuckDB worker + engine client (compiles against protocol.ts + errors)
feat/phase1-transport transport implementation (compiles against transport/types.ts + errors)
feat/phase1-ui        React shell + CodeMirror + TanStack Table (compiles against engine types)
```

Engine and transport branches are parallel (no import dependency between them).
UI branch starts after engine types (`QueryHandle`, `EngineClient`) land on main.

Merge order: `main contracts` → `engine` + `transport` (parallel PRs) → `ui`.

---

## Self-Correction Loop

Per-commit (pre-commit hook via husky):
```
pnpm typecheck && pnpm lint && pnpm test
```

Per-session checklist:
- [ ] Did I touch workers/? Restart dev server.
- [ ] Did I add a new error type? Added to src/errors/ + test?
- [ ] Did I add a fetch call? Is it inside src/transport/?
- [ ] Did I add state? Is it useState/useReducer (Phase 1) — no Zustand yet?

PR gate (CI):
```
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

---

## Log & Record Keeping

- `docs/log/YYYY-MM-DD.md` — session log (what happened, what was decided, what failed)
- `docs/log/INDEX.md` — one-line-per-session index for quick catchup
- `docs/DECISIONS.md` — ADRs for non-obvious architecture choices
- Memory system (`~/.claude/projects/.../memory/`) — cross-session context for Claude

---

## Known Deferred Risks

| Risk | Deferred to |
|------|-------------|
| Firefox 2MB IndexedDB limit | Phase 2 (chunker) |
| Safari quota + 7-day eviction | Phase 2 (cache fallback) |
| SW cache interception of DuckDB httpfs | Phase 2 |
| Memory pressure on large queries | Phase 3 (guardrails) |
| ETag instability across CDN edges | Phase 2 (composite cache key) |
