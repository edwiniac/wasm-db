# Phase 5 Design — OPFS Spill, Multi-file Joins, Offline Mode

**Date:** 2026-04-27
**Status:** Approved
**Order:** Feature 1 → Feature 2 → Feature 3 (each iterated independently)

---

## Context

Phases 1–4 delivered: DuckDB-WASM engine, HTTP range transport, 3-tier cache (memory LRU → IndexedDB → OPFS), schema explorer, URL sharing with drift detection.

Phase 5 adds three independent features that make the engine more powerful for large-file analytics:

1. **OPFS spill-to-disk** — DuckDB overflows working memory to OPFS instead of crashing on large aggregations
2. **Multi-file joins** — users register multiple Parquet URLs as named DuckDB views and JOIN across them in SQL
3. **Offline mode** — SW pre-caches app shell + WASM; StatusBar indicates network state

All three follow the same architectural contract: UI → state → engine → transport → cache. No new runtime dependencies.

---

## Feature 1: OPFS Spill-to-Disk

### Goal

Let DuckDB spill intermediate query results (sorts, aggregations, hash joins) to OPFS when they exceed available heap memory. Transparent to the user — no query changes needed.

### Architecture

- **`src/workers/duckdb.worker.ts`** — after DuckDB is ready, call `SET temp_directory = 'opfs://duckdb-tmp'`. Guard with `isOPFSAvailable()` from `src/util/featureDetect.ts`. Fire-and-forget; log a warning if it fails (non-fatal).
- **`src/ui/StatusBar.tsx`** — add `spillActive: boolean` prop. When true, render a `⚡ disk spill` label inline with existing status text.

### File Changes

| File                           | Change                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| `src/workers/duckdb.worker.ts` | Add `SET temp_directory` call after init, guarded by OPFS check |
| `src/ui/StatusBar.tsx`         | Add `spillActive` prop + badge                                  |
| `src/util/featureDetect.ts`    | Expose `isOPFSAvailable()` if not already exported              |

### Testing

- Unit test: `featureDetect.test.ts` — OPFS guard returns false when `navigator.storage.getDirectory` absent
- Integration test: worker init test confirms `SET temp_directory` is called when OPFS available, skipped when not
- No E2E test needed (transparent behaviour)

### Out of scope

- Configurable temp size limit
- UI showing disk usage
- Any explicit user control

---

## Feature 2: Multi-file Joins

### Goal

Users register up to 5 Parquet URLs as named DuckDB views. Each alias becomes a real SQL identifier they can JOIN, GROUP BY, or SELECT from in the editor.

### Architecture

**State — `src/state/filesState.ts`** (new file):

```ts
interface RegisteredFile {
  id: string; // crypto.randomUUID(), stable key
  alias: string; // user-supplied, alphanumeric + underscore
  url: string;
  status: 'idle' | 'probing' | 'ready' | 'error';
}
```

Actions: `ADD_FILE`, `UPDATE_FILE_ALIAS`, `UPDATE_FILE_URL`, `FILE_PROBE_START`, `FILE_PROBE_DONE`, `FILE_PROBE_ERROR`, `REMOVE_FILE`. Persisted in Zustand (alias + URL survive reload). On reload, `App.tsx` re-registers all `ready` files with DuckDB — the worker restarts fresh, so views must be recreated from persisted state.

**Worker protocol — `src/workers/protocol.ts`**:

- `REGISTER_FILE { alias, url }` → worker runs `CREATE OR REPLACE VIEW alias AS SELECT * FROM parquet_scan('url')`
- `UNREGISTER_FILE { alias }` → worker runs `DROP VIEW IF EXISTS alias`

**Engine client — `src/engine/client.ts`**:

- `registerFile(alias: string, url: string): Promise<void>`
- `unregisterFile(alias: string): Promise<void>`
  Each goes through the existing transport + cache stack (range requests for file2 are cached just like file1).

**UI — `src/ui/FilePanel.tsx`** (new component):

- Collapsible panel, rendered above `SchemaTree` in `App.tsx`
- Each row: alias `<input>` (validated: `/^[a-zA-Z_][a-zA-Z0-9_]*$/`, max 32 chars) + URL `<input>` + Probe button + Remove button
- "Add File" button appends a blank row (disabled when 5 files already registered)
- After successful probe, row status turns `ready` and alias is live in DuckDB
- Alias validation error shown inline (red border + tooltip)

### File Changes

| File                                 | Action                                                              |
| ------------------------------------ | ------------------------------------------------------------------- |
| `src/state/filesState.ts`            | Create — `RegisteredFile` type, `filesReducer`, `initialFilesState` |
| `src/state/filesState.test.ts`       | Create — reducer unit tests for all actions                         |
| `src/state/store.ts`                 | Extend Zustand store with `files` slice + `filesDispatch`           |
| `src/workers/protocol.ts`            | Add `REGISTER_FILE` / `UNREGISTER_FILE` message types               |
| `src/workers/duckdb.worker.ts`       | Handle `REGISTER_FILE` / `UNREGISTER_FILE` messages                 |
| `src/engine/client.ts`               | Add `registerFile()` / `unregisterFile()` methods                   |
| `src/engine/client.test.ts`          | Unit tests for new client methods                                   |
| `src/ui/FilePanel.tsx`               | Create — collapsible file registration panel                        |
| `src/ui/FilePanel.test.tsx`          | Create — RTL tests: add row, alias validation, probe button, remove |
| `src/App.tsx`                        | Mount `FilePanel` above `SchemaTree`                                |
| `tests/e2e/phase5-multifile.spec.ts` | Create — register two files, write JOIN query, verify results       |

### Alias validation rules

- Must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`
- Max 32 characters
- Must not conflict with an existing alias in the files list
- Must not shadow reserved SQL keywords (block: `SELECT`, `FROM`, `WHERE`, `JOIN`, `TABLE`, `VIEW`)

### Out of scope

- Drag-to-reorder files
- Per-file schema explorer (main SchemaTree stays for the primary URL)
- More than 5 registered files
- Persisting file contents offline

---

## Feature 3: Offline Mode

### Goal

After first load, the app shell and WASM assets serve from the Service Worker cache. When the network drops, a visible indicator appears and cached Parquet data (IndexedDB/OPFS) remains queryable.

### Architecture

**`public/sw.js`** upgrades:

- Add versioned `SHELL_CACHE = 'wasm-db-shell-v1'`
- `install` handler: pre-cache `['/', '/index.html']` plus cache-first for any request whose path starts with `/assets/` (Vite emits all hashed JS/CSS bundles there). WASM files fetched by DuckDB from CDN are handled separately by the existing SW cache logic.
- `fetch` handler strategy:
  - App shell assets (`/`, `*.html`, `/assets/*`): **cache-first** (serve from SW cache, update in background)
  - Parquet range requests: **network-first** (fresh data preferred, cached ranges as fallback)
  - Everything else: **network-only**

**`src/sw/register.ts`** — after SW registration, dispatch `SET_ONLINE` to store on `navigator.online` change.

**`src/state/queryState.ts`** — add `isOnline: boolean` field (default `true`), `SET_ONLINE` action. Not persisted (always resets to `true` on load).

**`src/ui/StatusBar.tsx`** — add `isOnline: boolean` prop. When false, render an `offline` badge (red dot + text) inline with existing status.

### File Changes

| File                               | Action                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `public/sw.js`                     | Upgrade to versioned cache-first shell strategy                                               |
| `src/sw/register.ts`               | Add online/offline event listeners → dispatch                                                 |
| `src/state/queryState.ts`          | Add `isOnline` field + `SET_ONLINE` action                                                    |
| `src/state/queryState.test.ts`     | Add reducer test for `SET_ONLINE`                                                             |
| `src/ui/StatusBar.tsx`             | Add `isOnline` prop + offline badge                                                           |
| `src/App.tsx`                      | Pass `isOnline` from store to `StatusBar`                                                     |
| `tests/e2e/phase5-offline.spec.ts` | Create — simulate offline in Playwright, verify offline badge, verify cached query still runs |

### Out of scope

- Explicit "Save for offline" user action
- Per-file offline status badges
- Background sync / re-fetch when back online
- Push notifications

---

## Iteration Order

Each feature is a self-contained implementation cycle:

```
Feature 1 (OPFS spill)     → plan → TDD → review → commit
Feature 2 (multi-file)     → plan → TDD → review → commit
Feature 3 (offline mode)   → plan → TDD → review → commit
```

No feature depends on another. Feature 2 is the largest; Feature 1 is the smallest (good first iteration to build momentum).

---

## Verification Checklist (per feature)

- `pnpm typecheck && pnpm lint && pnpm test` — always
- Feature 1 + 3: also `pnpm test:e2e` (SW changes require browser testing)
- Feature 2: also `pnpm test:e2e` (multi-file JOIN verified in Playwright)
