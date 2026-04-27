# Phase 5 Feature 1: OPFS Spill-to-Disk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure DuckDB-WASM to spill intermediate query data (sorts, aggregations, hash joins) to OPFS when it exceeds heap memory — transparently, with a visible badge in the StatusBar when active.

**Architecture:** The worker tries `SET temp_directory='opfs://duckdb-tmp'` during init, guarded by `hasOPFS()`. The result (`spillActive: boolean`) is piggy-backed onto the existing `ready` message so no new message type is needed. `EngineClient` stores the value and exposes a getter. App reads it after schema load (engine is guaranteed ready at that point) and dispatches `SET_SPILL_ACTIVE` to Zustand. `StatusBar` renders a `⚡ disk spill` badge when `spillActive` is true.

**Tech Stack:** Existing Vitest + `@testing-library/react` + TypeScript strict. No new runtime deps.

---

## File Map

| File                                  | Action    | Responsibility                                                               |
| ------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `src/util/featureDetect.ts`           | No change | `hasOPFS()` already exported — worker imports it directly                    |
| `src/workers/protocol.ts`             | Modify    | Add `spillActive: boolean` to `ready` message shape                          |
| `src/workers/duckdb.worker.ts`        | Modify    | Try `SET temp_directory` after `SET memory_limit`, post `ready` with result  |
| `src/engine/client.ts`                | Modify    | Store `spillActive` from `ready`, expose as getter                           |
| `src/engine/__tests__/client.test.ts` | Modify    | Fix existing calls + add 2 new tests for `spillActive`                       |
| `src/state/queryState.ts`             | Modify    | Add `spillActive: boolean` field + `SET_SPILL_ACTIVE` action                 |
| `src/state/queryState.test.ts`        | Modify    | Add reducer test for `SET_SPILL_ACTIVE`                                      |
| `src/state/queryService.ts`           | Modify    | Export `getSpillActive(): boolean`                                           |
| `src/ui/StatusBar.tsx`                | Modify    | Add `spillActive?: boolean` prop + badge                                     |
| `src/App.tsx`                         | Modify    | Read `spillActive` from store, dispatch after schema load, pass to StatusBar |

---

## Task 1: Extend the `ready` message protocol

**Files:**

- Modify: `src/workers/protocol.ts`

The `ready` message currently carries no payload beyond `correlationId`. We add `spillActive: boolean` so the worker can report whether OPFS temp dir was set up successfully. This is a compile-time change — existing tests that simulate `ready` messages will fail TypeScript until updated in Task 2.

- [ ] **Step 1: Update the `WorkerToMain` union in `protocol.ts`**

Open `src/workers/protocol.ts`. Change:

```ts
export type WorkerToMain =
  | { kind: 'ready'; correlationId: string }
  | { kind: 'batch'; correlationId: string; rows: Record<string, unknown>[]; done: boolean }
  | { kind: 'error'; correlationId: string; error: SerializedError }
  | { kind: 'progress'; correlationId: string; stage: string; pct: number };
```

to:

```ts
export type WorkerToMain =
  | { kind: 'ready'; correlationId: string; spillActive: boolean }
  | { kind: 'batch'; correlationId: string; rows: Record<string, unknown>[]; done: boolean }
  | { kind: 'error'; correlationId: string; error: SerializedError }
  | { kind: 'progress'; correlationId: string; stage: string; pct: number };
```

- [ ] **Step 2: Verify typecheck catches the now-broken callers**

```bash
pnpm typecheck 2>&1 | grep "spillActive\|ready"
```

Expected: TypeScript errors in `duckdb.worker.ts` and `client.test.ts` where `ready` messages are constructed without `spillActive`. This confirms the type is enforced.

---

## Task 2: Worker — try OPFS temp_directory during init

**Files:**

- Modify: `src/workers/duckdb.worker.ts`

Add two imports at the top and update `handleInit` to attempt `SET temp_directory` after the memory limit pragma. The call is fire-and-forget: if it throws (older Safari, OPFS unavailable), we log a warning and continue with `spillActive: false`.

- [ ] **Step 1: Add imports to `duckdb.worker.ts`**

At the top of `src/workers/duckdb.worker.ts`, after the existing imports, add:

```ts
import { hasOPFS } from '@/util/featureDetect';
import { workerLogger } from '@/util/logger';
```

- [ ] **Step 2: Replace the `post({ kind: 'ready' ... })` call in `handleInit`**

Find this block in `handleInit` (currently lines ~39–42):

```ts
conn = await db.connect();
await conn.query(`SET memory_limit='${config.maxMemoryMB}MB'`);

post({ kind: 'ready', correlationId });
```

Replace it with:

```ts
conn = await db.connect();
await conn.query(`SET memory_limit='${config.maxMemoryMB}MB'`);

let spillActive = false;
if (await hasOPFS()) {
  try {
    await conn.query(`SET temp_directory='opfs://duckdb-tmp'`);
    spillActive = true;
  } catch (err) {
    workerLogger.warn('OPFS spill setup failed — running without disk spill', err);
  }
}

post({ kind: 'ready', correlationId, spillActive });
```

- [ ] **Step 3: Verify typecheck passes for the worker**

```bash
pnpm typecheck 2>&1 | grep "duckdb.worker"
```

Expected: no errors for `duckdb.worker.ts`. (There will still be errors in `client.test.ts` — fixed in Task 3.)

---

## Task 3: EngineClient — store `spillActive`, expose getter, fix tests

**Files:**

- Modify: `src/engine/client.ts`
- Modify: `src/engine/__tests__/client.test.ts`

`EngineClient` currently resolves `readyPromise` to `void`. We store `spillActive` as a private field, set it when the `ready` message arrives, and expose it as a read-only getter.

- [ ] **Step 1: Write two failing tests**

Open `src/engine/__tests__/client.test.ts`. Add this new `describe` block at the end of the file (before the closing brace):

```ts
describe('EngineClient — spillActive', () => {
  it('spillActive is true when ready message has spillActive: true', async () => {
    vi.resetModules();
    const { EngineClient } = await import('@/engine/client');
    const client = new EngineClient(() => mockWorker as unknown as Worker);

    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0', spillActive: true });

    expect(client.spillActive).toBe(true);
    client.shutdown();
  });

  it('spillActive is false when ready message has spillActive: false', async () => {
    vi.resetModules();
    const { EngineClient } = await import('@/engine/client');
    const client = new EngineClient(() => mockWorker as unknown as Worker);

    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0', spillActive: false });

    expect(client.spillActive).toBe(false);
    client.shutdown();
  });
});
```

- [ ] **Step 2: Fix existing `simulateMessage` calls in the same file**

Every existing call to `mockWorker.simulateMessage({ kind: 'ready', ... })` needs `spillActive: false` added. There are 4 of them. Update each:

```ts
// Before (each occurrence):
mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0' });

// After (each occurrence):
mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0', spillActive: false });
```

The 4 locations are inside the tests: `runQuery sends query message`, `QueryHandle.done resolves`, `QueryHandle.done rejects`, and `cancel sends cancel message`.

- [ ] **Step 3: Run tests to confirm they fail (new tests) and that fixed tests still error on missing implementation**

```bash
pnpm test -- "client" 2>&1 | tail -20
```

Expected: TypeScript error about `spillActive` property not on `EngineClient` — confirms the getter isn't there yet.

- [ ] **Step 4: Add `_spillActive` field and getter to `EngineClient`**

In `src/engine/client.ts`, inside the `EngineClient` class, add after `private readonly initCorrelationId: string;`:

```ts
  private _spillActive = false;

  get spillActive(): boolean {
    return this._spillActive;
  }
```

- [ ] **Step 5: Update `_handleMessage` to store `spillActive` from the `ready` message**

Find the `case 'ready':` branch in `_handleMessage`:

```ts
      case 'ready':
        this.readyResolve();
        break;
```

Change it to:

```ts
      case 'ready':
        this._spillActive = msg.spillActive;
        this.readyResolve();
        break;
```

- [ ] **Step 6: Run tests and confirm all pass**

```bash
pnpm test -- "client"
```

Expected: all 8 tests pass (6 existing + 2 new).

- [ ] **Step 7: Commit**

```bash
git add src/workers/protocol.ts src/workers/duckdb.worker.ts src/engine/client.ts src/engine/__tests__/client.test.ts
git commit -m "feat(spill): extend ready protocol + worker OPFS setup + EngineClient getter"
```

---

## Task 4: State — `spillActive` field and reducer action

**Files:**

- Modify: `src/state/queryState.ts`
- Modify: `src/state/queryState.test.ts`

`spillActive` lives in Zustand state so React components can subscribe to it. It is NOT in `partialize` — it resets to `false` on every page load (correct; the engine re-runs OPFS detection fresh on each worker start).

- [ ] **Step 1: Write a failing test**

Open `src/state/queryState.test.ts`. Add inside the existing `describe('queryReducer — sharing actions', ...)` block (or as a new describe at the end):

```ts
describe('queryReducer — spill actions', () => {
  it('SET_SPILL_ACTIVE sets spillActive to true', () => {
    const next = queryReducer(initialState, { type: 'SET_SPILL_ACTIVE', active: true });
    expect(next.spillActive).toBe(true);
  });

  it('SET_SPILL_ACTIVE sets spillActive to false', () => {
    const withSpill = queryReducer(initialState, { type: 'SET_SPILL_ACTIVE', active: true });
    const next = queryReducer(withSpill, { type: 'SET_SPILL_ACTIVE', active: false });
    expect(next.spillActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test -- "queryState"
```

Expected: TypeScript error — `SET_SPILL_ACTIVE` not in `QueryAction` union.

- [ ] **Step 3: Add `spillActive` to `QueryState` and `initialState`**

In `src/state/queryState.ts`, add `spillActive: boolean;` to the `QueryState` interface (after `schemaDrift`):

```ts
export interface QueryState {
  parquetURL: string;
  queryText: string;
  status: QueryStatus;
  results: Batch[];
  error: AppError | null;
  rowCount: number;
  schema: ColumnInfo[] | null;
  schemaStatus: SchemaStatus;
  sharedFingerprint: string | null;
  schemaDrift: boolean;
  spillActive: boolean;
}
```

Add `spillActive: false,` to `initialState` (after `schemaDrift: false`):

```ts
export const initialState: QueryState = {
  parquetURL: '',
  queryText: "SELECT *\nFROM parquet_scan('__URL__')\nLIMIT 100",
  status: 'idle',
  results: [],
  error: null,
  rowCount: 0,
  schema: null,
  schemaStatus: 'idle',
  sharedFingerprint: null,
  schemaDrift: false,
  spillActive: false,
};
```

- [ ] **Step 4: Add `SET_SPILL_ACTIVE` to the `QueryAction` union**

In `src/state/queryState.ts`, add to `QueryAction` (after the `DISMISS_DRIFT` line):

```ts
  | { type: 'DISMISS_DRIFT' }
  | { type: 'SET_SPILL_ACTIVE'; active: boolean };
```

- [ ] **Step 5: Add reducer case**

In the `queryReducer` switch, add before `default:`:

```ts
    case 'SET_SPILL_ACTIVE':
      return { ...state, spillActive: action.active };
```

- [ ] **Step 6: Run tests and confirm they pass**

```bash
pnpm test -- "queryState"
```

Expected: all tests pass (existing 8 + new 2 = 10).

- [ ] **Step 7: Commit**

```bash
git add src/state/queryState.ts src/state/queryState.test.ts
git commit -m "feat(spill): spillActive state field + SET_SPILL_ACTIVE action"
```

---

## Task 5: `queryService` — expose `getSpillActive`

**Files:**

- Modify: `src/state/queryService.ts`

A thin accessor so `App.tsx` doesn't import from `@/engine/client` directly (layer rule: UI → state → engine, App goes through queryService).

- [ ] **Step 1: Add `getSpillActive` to `queryService.ts`**

Open `src/state/queryService.ts`. Add after `shutdownEngine`:

```ts
export function getSpillActive(): boolean {
  return engine?.spillActive ?? false;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: exit 0.

---

## Task 6: StatusBar — `spillActive` prop and badge

**Files:**

- Modify: `src/ui/StatusBar.tsx`

The badge renders inline with the row-count / status label. It uses a muted blue to match the existing pulsing dot colour, so it doesn't shout at the user.

- [ ] **Step 1: Update `StatusBarProps` and add the badge**

Replace the entire contents of `src/ui/StatusBar.tsx` with:

```tsx
import type { QueryStatus } from '@/state/queryState';

interface StatusBarProps {
  status: QueryStatus;
  rowCount: number;
  onCancel: () => void;
  spillActive?: boolean;
}

const LABEL: Record<QueryStatus, string> = {
  idle: 'Ready',
  probing: 'Probing…',
  executing: 'Executing…',
  done: '',
  error: 'Error',
};

export function StatusBar({ status, rowCount, onCancel, spillActive }: StatusBarProps) {
  const inFlight = status === 'probing' || status === 'executing';
  const label =
    status === 'done'
      ? `${rowCount.toLocaleString()} row${rowCount !== 1 ? 's' : ''}`
      : LABEL[status];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 12px',
        fontSize: '12px',
        color: '#aaa',
        borderTop: '1px solid #2a2a2a',
        background: '#111',
      }}
    >
      {inFlight && (
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#4a9eff',
            display: 'inline-block',
            animation: 'pulse 1s ease-in-out infinite',
          }}
          aria-hidden
        />
      )}
      <span>{label}</span>
      {spillActive && (
        <span
          style={{ fontSize: '11px', color: '#7db9e8', marginLeft: '4px' }}
          title="DuckDB is using OPFS for temporary query data"
          aria-label="disk spill active"
        >
          ⚡ disk spill
        </span>
      )}
      {inFlight && (
        <button
          onClick={onCancel}
          style={{ marginLeft: 'auto', fontSize: '12px', padding: '2px 8px' }}
          aria-label="Cancel query"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 3: Run tests**

```bash
pnpm test -- "StatusBar" 2>&1 | tail -10
```

Expected: existing tests still pass (the new prop is optional, so nothing breaks).

---

## Task 7: Wire `spillActive` into App.tsx

**Files:**

- Modify: `src/App.tsx`

Three changes: (1) subscribe to `spillActive` from the store, (2) dispatch `SET_SPILL_ACTIVE` after schema load (engine is guaranteed ready at that point), (3) pass `spillActive` to `StatusBar`.

- [ ] **Step 1: Add `spillActive` selector in `App.tsx`**

In the store selector block (where `schemaDrift` is already read), add:

```ts
const spillActive = useQueryStore((s) => s.spillActive);
```

- [ ] **Step 2: Import `getSpillActive` from queryService**

At the top of `src/App.tsx`, the existing import is:

```ts
import { getEngine, getTransport, shutdownEngine, loadSchema } from '@/state/queryService';
```

Change to:

```ts
import {
  getEngine,
  getTransport,
  shutdownEngine,
  loadSchema,
  getSpillActive,
} from '@/state/queryService';
```

- [ ] **Step 3: Dispatch `SET_SPILL_ACTIVE` after schema load**

Inside `handleProbe`, in the `loadSchema(targetURL).then(...)` callback, add the dispatch immediately after `dispatch({ type: 'SCHEMA_DONE', columns })`:

```ts
loadSchema(targetURL).then((columns) => {
  dispatch({ type: 'SCHEMA_DONE', columns });
  dispatch({ type: 'SET_SPILL_ACTIVE', active: getSpillActive() });
  if (fingerprintToCheck) {
    const live = computeFingerprint(columns);
    if (live !== fingerprintToCheck) dispatch({ type: 'SCHEMA_DRIFT_DETECTED' });
  }
});
```

- [ ] **Step 4: Pass `spillActive` to `StatusBar`**

Find the `<StatusBar ...>` JSX in the return block:

```tsx
<StatusBar status={status} rowCount={rowCount} onCancel={handleCancel} />
```

Change to:

```tsx
<StatusBar status={status} rowCount={rowCount} onCancel={handleCancel} spillActive={spillActive} />
```

- [ ] **Step 5: Run full test suite and typecheck**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: typecheck exits 0, lint exits 0, all 98 tests pass (96 existing + 2 new spillActive client tests + 2 new reducer tests = 100 tests — the count from prior runs is 96; new additions bring it to 100).

- [ ] **Step 6: Final commit**

```bash
git add src/state/queryService.ts src/ui/StatusBar.tsx src/App.tsx
git commit -m "feat(spill): wire spillActive through queryService → state → StatusBar"
```

---

## Verification

After all tasks:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All checks green. The `⚡ disk spill` badge will appear in the dev server after a successful probe when running in a browser that supports OPFS (Chrome, Edge, Firefox 111+). Safari 16.4+ supports OPFS but DuckDB's `SET temp_directory` may degrade gracefully — the badge simply won't appear and the app continues working.
