# Architecture — Layer Contracts & Worker Protocol

Load when: touching layer boundaries, worker messaging, state shape, or reload flow.
Do not load for pure UI styling, copy changes, or dependency bumps.

## Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ UI (React)                         src/ui/                  │
│   ├── dispatches typed actions only                         │
│   └── subscribes to state slices; no direct mutations       │
├─────────────────────────────────────────────────────────────┤
│ State (Zustand + persist)          src/state/               │
│   ├── serializable actions                                  │
│   └── owns reload contract                                  │
├─────────────────────────────────────────────────────────────┤
│ Engine (DuckDB worker client)      src/engine/              │
│   ├── only owner of the DuckDB worker                       │
│   └── exposes QueryHandle; never leaks worker internals     │
├─────────────────────────────────────────────────────────────┤
│ Transport (HTTP + range)           src/transport/           │
│   ├── takes (url, start, end, signal)                       │
│   └── delegates to cache first, network second              │
├─────────────────────────────────────────────────────────────┤
│ Cache (L1 mem / L2 IDB / L3 OPFS)  src/cache/               │
│   └── write-through L1, write-behind L2, manual L3          │
└─────────────────────────────────────────────────────────────┘
```

Imports flow *downward only*. `dependency-cruiser` enforces this in CI —
`tests/integration/layers.test.ts` will fail a PR that crosses boundaries.

## Contracts

### UI → State

- UI components import hooks from `src/state/` only (`useQueries`, `useSchema`, etc.).
- No component imports from `engine/`, `transport/`, or `cache/`. Ever.
- Every user action maps to a single dispatched action; no ad-hoc store writes.

### State → Engine

- State calls `engine.runQuery(sql, opts)` which returns a `QueryHandle`.
- `QueryHandle` exposes: `cancel()`, `stream: AsyncIterable<Batch>`, `done: Promise<Summary>`.
- State never touches the DuckDB worker directly. The engine module is the *only* caller
  of `new Worker(...)` for the DuckDB worker.

### Engine → Transport

- Engine asks transport for bytes at a `(url, start, end)` tuple, plus an `AbortSignal`.
- Engine never builds `Range:` strings, handles retries, or talks to the Service Worker.
- Engine receives a `Uint8Array` or a typed error; no streams cross this boundary (DuckDB's
  async reader pulls per-range).

### Transport → Cache

- Transport calls `cache.get(key)` first; on miss, issues fetch, calls `cache.set(key, bytes)`.
- Cache set is fire-and-forget for L2/L3 (do not await — it must not block the hot path).
- Range coalescing lives in transport, not cache. Cache stores what transport decided to
  fetch.

## Worker Protocol (`src/workers/protocol.ts`)

Messages are typed discriminated unions:

```ts
type MainToWorker =
  | { kind: 'init'; correlationId: string; config: DuckDBConfig }
  | { kind: 'query'; correlationId: string; sql: string; opts: QueryOpts }
  | { kind: 'cancel'; correlationId: string; target: string }
  | { kind: 'shutdown'; correlationId: string };

type WorkerToMain =
  | { kind: 'ready'; correlationId: string }
  | { kind: 'batch'; correlationId: string; rows: unknown[]; done: boolean }
  | { kind: 'error'; correlationId: string; error: SerializedError }
  | { kind: 'progress'; correlationId: string; stage: string; pct: number };
```

**Adding a new message** is four mechanical steps — do them in order:

1. Add the variant to the union in `protocol.ts`.
2. Handle it in `src/workers/duckdb.worker.ts`.
3. Add the caller method in `src/engine/client.ts`.
4. Add a protocol round-trip test in `src/workers/__tests__/protocol.test.ts`.

All messages carry a `correlationId` for request/response pairing. Workers do not hold
references to main-thread objects — everything crosses via structured clone.

## State Shape

### Persisted (IndexedDB via Zustand `persist`)

| Slice | Cap | Eviction |
|-------|-----|----------|
| `queries` | 500 entries | LRU on write |
| `tabs` | unbounded | manual (user closes) |
| `schemas` | 100 URLs | LRU on write |
| `preferences` | singleton | — |
| `pinnedResults` | 50 entries | manual |

### Ephemeral (in-memory only)

- `activeQueries` — in-flight `QueryHandle`s, abandoned on reload.
- `previewRows` — first-row-group previews; recomputed from cache on demand.
- `connectionStatus` — network health, circuit-breaker state.

## Reload Semantics

On page load, in this order:

1. Hydrate Zustand from IndexedDB (fast path, <50ms target).
2. Restore tab state: editor contents, active schema, last results *metadata only*
   (rows are not persisted; the UI shows "Re-run to see results").
3. In-flight queries are *not* resumed. Show "query abandoned on reload" as the status.
4. DuckDB worker is **not** initialized until the first query dispatch or explicit init
   button — this is the cold-start budget.

Tests that guard this contract:
- `tests/integration/reload.test.ts` — full app boot, simulated hard reload, slice-by-slice
  equivalence check.
- `tests/integration/worker-lifecycle.test.ts` — worker crash recovery, cancel propagation,
  orphan message handling.

## Why These Boundaries

- The DuckDB worker is expensive to create (~200ms warm, ~2s cold). Centralizing ownership
  prevents accidentally spawning two.
- One-way layer direction lets us swap implementations: e.g., replacing IndexedDB cache with
  OPFS touches only `src/cache/`. Two-way imports would require a refactor across layers.
- Typed errors mean the UI layer can map once to user-friendly messages; without this, every
  component ends up writing its own string-matching logic against DuckDB's output.
- Reload-safety is a *product* requirement (SPEC §2.2) — users explore via URL sharing and
  expect their tabs back. Non-persisted state must be either regeneratable or explicitly
  documented as ephemeral.
