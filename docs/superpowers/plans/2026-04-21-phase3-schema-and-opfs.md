# Phase 3: Schema Explorer + OPFS L3 Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users schema visibility (column names + types after probe) and add a durable OPFS L3 cache tier so Safari users aren't hit by 7-day IndexedDB eviction.

**Architecture:** Two independent additions wired together. (1) Schema explorer — `src/engine/schema.ts` runs `DESCRIBE SELECT *` via the existing `EngineClient`; results flow through Zustand state (`SCHEMA_START/DONE/ERROR` actions); `SchemaTree.tsx` renders the panel. Triggered automatically after a successful probe. (2) OPFS L3 — `src/cache/opfs.ts` implements `ICache` using the Origin Private File System API; added as innermost tier in a nested `TieredCache(MemoryLRU, TieredCache(IndexedDB, OPFS))` stack in `queryService.ts`. Both additions are opt-in/graceful-fallback: schema errors are silent, OPFS writes are fire-and-forget.

**Tech Stack:** Existing Vitest + jsdom + `@testing-library/react` + Playwright; no new runtime dependencies.

---

## File Map

| File                           | Action | Responsibility                                                               |
| ------------------------------ | ------ | ---------------------------------------------------------------------------- |
| `src/engine/schema.ts`         | Create | `fetchSchema(url, engine)` — runs DESCRIBE, returns `ColumnInfo[]`           |
| `src/engine/schema.test.ts`    | Create | Unit tests with mocked EngineClient                                          |
| `src/state/queryState.ts`      | Modify | Add `ColumnInfo` import + re-export, `schema`/`schemaStatus` state + actions |
| `src/state/queryState.test.ts` | Create | Reducer tests for SCHEMA\_\* and SET_URL schema-reset                        |
| `src/state/queryService.ts`    | Modify | Add `loadSchema(url)` wrapper; add OPFSCache to 3-tier stack                 |
| `src/ui/SchemaTree.tsx`        | Create | Prop-driven sidebar showing columns + types                                  |
| `src/ui/SchemaTree.test.tsx`   | Create | RTL component tests                                                          |
| `src/cache/opfs.ts`            | Create | `OPFSCache` — ICache over OPFS, FNV-1a hash filenames                        |
| `src/cache/opfs.test.ts`       | Create | Unit tests with mocked `navigator.storage`                                   |
| `src/App.tsx`                  | Modify | Call `loadSchema` after probe; add `SchemaTree` to layout                    |
| `tests/e2e/phase3.spec.ts`     | Create | Schema panel visible after probe; resets on URL change                       |

---

## Milestone 1: Schema Explorer

### Task 1: Schema State

**Files:**

- Modify: `src/state/queryState.ts`
- Create: `src/state/queryState.test.ts`

The Zustand store extends `QueryState`, so adding fields here automatically exposes them via `useQueryStore`. `schema` and `schemaStatus` are NOT in `partialize`, so they reset on every page load (correct — schema is derived from the live file).

- [ ] **Step 1: Write failing tests**

Create `src/state/queryState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { queryReducer, initialState } from '@/state/queryState';
import type { ColumnInfo } from '@/state/queryState';

describe('queryReducer — schema actions', () => {
  it('SCHEMA_START sets schemaStatus to loading', () => {
    const next = queryReducer(initialState, { type: 'SCHEMA_START' });
    expect(next.schemaStatus).toBe('loading');
    expect(next.schema).toBeNull();
  });

  it('SCHEMA_DONE stores columns and sets schemaStatus to loaded', () => {
    const cols: ColumnInfo[] = [{ name: 'id', type: 'INTEGER', nullable: false }];
    const next = queryReducer(initialState, { type: 'SCHEMA_DONE', columns: cols });
    expect(next.schemaStatus).toBe('loaded');
    expect(next.schema).toEqual(cols);
  });

  it('SCHEMA_ERROR sets schemaStatus to error', () => {
    const next = queryReducer(initialState, { type: 'SCHEMA_ERROR' });
    expect(next.schemaStatus).toBe('error');
  });

  it('SET_URL resets schema and schemaStatus to idle', () => {
    const withSchema = queryReducer(initialState, {
      type: 'SCHEMA_DONE',
      columns: [{ name: 'id', type: 'INTEGER', nullable: false }],
    });
    const after = queryReducer(withSchema, {
      type: 'SET_URL',
      url: 'https://new.example.com/b.parquet',
    });
    expect(after.schema).toBeNull();
    expect(after.schemaStatus).toBe('idle');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test -- queryState
```

Expected: FAIL — `SCHEMA_START` not a known action type.

- [ ] **Step 3: Update queryState.ts**

Replace the entire file:

```ts
import type { Batch } from '@/engine/types';
import type { AppError } from '@/errors';
import type { ColumnInfo } from '@/engine/schema';

export type { ColumnInfo };

export type QueryStatus = 'idle' | 'probing' | 'executing' | 'error' | 'done';
export type SchemaStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface QueryState {
  parquetURL: string;
  queryText: string;
  status: QueryStatus;
  results: Batch[];
  error: AppError | null;
  rowCount: number;
  schema: ColumnInfo[] | null;
  schemaStatus: SchemaStatus;
}

export type QueryAction =
  | { type: 'SET_URL'; url: string }
  | { type: 'SET_QUERY'; sql: string }
  | { type: 'PROBE_START' }
  | { type: 'PROBE_DONE' }
  | { type: 'QUERY_START' }
  | { type: 'BATCH_RECEIVED'; batch: Batch }
  | { type: 'QUERY_DONE'; rowCount: number }
  | { type: 'ERROR'; error: AppError }
  | { type: 'CANCEL' }
  | { type: 'RESET' }
  | { type: 'SCHEMA_START' }
  | { type: 'SCHEMA_DONE'; columns: ColumnInfo[] }
  | { type: 'SCHEMA_ERROR' };

export const initialState: QueryState = {
  parquetURL: '',
  queryText: "SELECT *\nFROM parquet_scan('__URL__')\nLIMIT 100",
  status: 'idle',
  results: [],
  error: null,
  rowCount: 0,
  schema: null,
  schemaStatus: 'idle',
};

export function queryReducer(state: QueryState, action: QueryAction): QueryState {
  switch (action.type) {
    case 'SET_URL':
      return {
        ...state,
        parquetURL: action.url,
        status: 'idle',
        results: [],
        error: null,
        schema: null,
        schemaStatus: 'idle',
      };

    case 'SET_QUERY':
      return { ...state, queryText: action.sql };

    case 'PROBE_START':
      return { ...state, status: 'probing', error: null };

    case 'PROBE_DONE':
      return { ...state, status: 'idle' };

    case 'QUERY_START':
      return { ...state, status: 'executing', results: [], error: null, rowCount: 0 };

    case 'BATCH_RECEIVED':
      return { ...state, results: [...state.results, action.batch] };

    case 'QUERY_DONE':
      return { ...state, status: 'done', rowCount: action.rowCount };

    case 'ERROR':
      return { ...state, status: 'error', error: action.error };

    case 'CANCEL':
      return { ...state, status: 'idle', error: null };

    case 'RESET':
      return { ...initialState };

    case 'SCHEMA_START':
      return { ...state, schemaStatus: 'loading' };

    case 'SCHEMA_DONE':
      return { ...state, schemaStatus: 'loaded', schema: action.columns };

    case 'SCHEMA_ERROR':
      return { ...state, schemaStatus: 'error' };

    default:
      return state;
  }
}
```

Note: this imports `ColumnInfo` from `@/engine/schema` which doesn't exist yet. TypeScript will error until Task 2 creates that file. Run `pnpm test -- queryState` only after Task 2 is complete.

- [ ] **Step 4: Commit placeholder**

```bash
git add src/state/queryState.ts src/state/queryState.test.ts
git commit -m "feat(state): add schema state fields + SCHEMA_START/DONE/ERROR actions"
```

---

### Task 2: Schema Fetch Function

**Files:**

- Create: `src/engine/schema.ts`
- Create: `src/engine/schema.test.ts`

`ColumnInfo` is defined here and re-exported by `queryState.ts`. The function is pure: it takes a URL and an `EngineClient`, runs `DESCRIBE SELECT *`, and returns the parsed column list.

- [ ] **Step 1: Write failing tests**

Create `src/engine/schema.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchSchema } from '@/engine/schema';
import type { EngineClient } from '@/engine/client';

function mockEngine(rows: Record<string, unknown>[]): EngineClient {
  const handle = {
    id: 'test',
    cancel: vi.fn(),
    done: Promise.resolve({ rowCount: rows.length, durationMs: 0 }),
    stream: {
      async *[Symbol.asyncIterator]() {
        if (rows.length > 0) yield { rows };
      },
    },
  };
  return {
    runQuery: vi.fn().mockResolvedValue(handle),
    shutdown: vi.fn(),
  } as unknown as EngineClient;
}

describe('fetchSchema', () => {
  it('runs DESCRIBE SELECT * on the given URL', async () => {
    const engine = mockEngine([]);
    await fetchSchema('https://example.com/a.parquet', engine);
    expect(engine.runQuery).toHaveBeenCalledWith(
      "DESCRIBE SELECT * FROM parquet_scan('https://example.com/a.parquet')",
    );
  });

  it('parses DESCRIBE rows into ColumnInfo array', async () => {
    const engine = mockEngine([
      { column_name: 'id', column_type: 'INTEGER', null: 'YES' },
      { column_name: 'name', column_type: 'VARCHAR', null: 'NO' },
    ]);
    const result = await fetchSchema('https://example.com/a.parquet', engine);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'id', type: 'INTEGER', nullable: true });
    expect(result[1]).toEqual({ name: 'name', type: 'VARCHAR', nullable: false });
  });

  it('sanitizes single quotes in the URL (SQL injection guard)', async () => {
    const engine = mockEngine([]);
    await fetchSchema("https://example.com/it's.parquet", engine);
    expect(engine.runQuery).toHaveBeenCalledWith(
      "DESCRIBE SELECT * FROM parquet_scan('https://example.com/it''s.parquet')",
    );
  });

  it('returns empty array when DESCRIBE yields no rows', async () => {
    const engine = mockEngine([]);
    expect(await fetchSchema('https://x.com/a.parquet', engine)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test -- schema
```

Expected: FAIL — `Cannot find module '@/engine/schema'`.

- [ ] **Step 3: Create schema.ts**

Create `src/engine/schema.ts`:

```ts
import type { EngineClient } from './client';

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

function sanitizeURL(url: string): string {
  return url.replace(/'/g, "''");
}

export async function fetchSchema(url: string, engine: EngineClient): Promise<ColumnInfo[]> {
  const safe = sanitizeURL(url);
  const handle = await engine.runQuery(`DESCRIBE SELECT * FROM parquet_scan('${safe}')`);
  const columns: ColumnInfo[] = [];
  for await (const batch of handle.stream) {
    for (const row of batch.rows) {
      const r = row as Record<string, unknown>;
      columns.push({
        name: String(r['column_name'] ?? ''),
        type: String(r['column_type'] ?? 'UNKNOWN'),
        nullable: r['null'] === 'YES',
      });
    }
  }
  return columns;
}
```

- [ ] **Step 4: Run — expect all 4 schema tests + all prior tests pass**

```bash
pnpm test
```

Expected: all tests pass (previously 58 + 4 new = 62, plus 4 from queryState.test.ts = 66).

- [ ] **Step 5: Commit**

```bash
git add src/engine/schema.ts src/engine/schema.test.ts
git commit -m "feat(engine): fetchSchema — DESCRIBE parquet_scan via EngineClient"
```

---

### Task 3: SchemaTree UI Component

**Files:**

- Create: `src/ui/SchemaTree.tsx`
- Create: `src/ui/SchemaTree.test.tsx`

Prop-driven, no store access. Returns `null` when `status='idle'` so the parent doesn't need a conditional.

- [ ] **Step 1: Write failing tests**

Create `src/ui/SchemaTree.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SchemaTree } from '@/ui/SchemaTree';
import type { ColumnInfo } from '@/state/queryState';

const cols: ColumnInfo[] = [
  { name: 'id', type: 'INTEGER', nullable: false },
  { name: 'label', type: 'VARCHAR', nullable: true },
];

describe('SchemaTree', () => {
  it('renders nothing when status is idle', () => {
    const { container } = render(<SchemaTree columns={null} status="idle" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows loading text when status is loading', () => {
    render(<SchemaTree columns={null} status="loading" />);
    expect(screen.getByText(/loading schema/i)).toBeInTheDocument();
  });

  it('shows error message when status is error', () => {
    render(<SchemaTree columns={null} status="error" />);
    expect(screen.getByText(/schema unavailable/i)).toBeInTheDocument();
  });

  it('renders column names and types when loaded', () => {
    render(<SchemaTree columns={cols} status="loaded" />);
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('INTEGER')).toBeInTheDocument();
    expect(screen.getByText('label')).toBeInTheDocument();
    expect(screen.getByText('VARCHAR')).toBeInTheDocument();
  });

  it('shows column count in header', () => {
    render(<SchemaTree columns={cols} status="loaded" />);
    expect(screen.getByText(/columns \(2\)/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test -- SchemaTree
```

Expected: FAIL — `Cannot find module '@/ui/SchemaTree'`.

- [ ] **Step 3: Implement SchemaTree.tsx**

Create `src/ui/SchemaTree.tsx`:

```tsx
import type { ColumnInfo } from '@/state/queryState';

interface SchemaTreeProps {
  columns: ColumnInfo[] | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
}

export function SchemaTree({ columns, status }: SchemaTreeProps) {
  if (status === 'idle') return null;

  if (status === 'loading') {
    return (
      <div style={{ padding: '8px 12px', color: '#888', fontSize: '13px' }}>Loading schema…</div>
    );
  }

  if (status === 'error' || !columns) {
    return (
      <div style={{ padding: '8px 12px', color: '#f88', fontSize: '13px' }}>Schema unavailable</div>
    );
  }

  return (
    <div
      aria-label="Schema tree"
      style={{
        padding: '8px 12px',
        borderTop: '1px solid #333',
        overflowY: 'auto',
        maxHeight: '200px',
        fontSize: '13px',
      }}
    >
      <div style={{ color: '#888', marginBottom: '4px' }}>Columns ({columns.length})</div>
      {columns.map((col) => (
        <div key={col.name} style={{ display: 'flex', gap: '8px', padding: '2px 0' }}>
          <span style={{ color: '#9cdcfe' }}>{col.name}</span>
          <span style={{ color: '#888', fontSize: '12px' }}>{col.type}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run — expect all 5 SchemaTree tests pass**

```bash
pnpm test -- SchemaTree
```

Expected: 5 passed.

- [ ] **Step 5: Run full suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/SchemaTree.tsx src/ui/SchemaTree.test.tsx
git commit -m "feat(ui): SchemaTree component — column name + type sidebar"
```

---

### Task 4: Wire Schema into App.tsx

**Files:**

- Modify: `src/state/queryService.ts` — add `loadSchema` wrapper
- Modify: `src/App.tsx` — call `loadSchema` after probe, add `SchemaTree` to layout

No new tests — schema E2E tests are in Task 7. Typecheck and full unit suite are the verification.

- [ ] **Step 1: Add loadSchema to queryService.ts**

Replace the entire `src/state/queryService.ts`:

```ts
import { EngineClient } from '@/engine/client';
import { HttpTransport } from '@/transport/http';
import { MemoryLRU } from '@/cache/memory';
import { IndexedDBCache } from '@/cache/indexeddb';
import { TieredCache } from '@/cache/tiered';
import { db } from '@/cache/db';
import { fetchSchema } from '@/engine/schema';
import type { QueryHandle } from '@/engine/types';
import type { ColumnInfo } from '@/engine/schema';

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

export async function loadSchema(url: string): Promise<ColumnInfo[]> {
  return fetchSchema(url, getEngine());
}

export type { QueryHandle, ColumnInfo };
```

(OPFSCache is added to the cache stack in Task 6 after it's implemented.)

- [ ] **Step 2: Update App.tsx**

Replace the entire `src/App.tsx`:

```tsx
import { useCallback, useRef, useEffect } from 'react';
import { useQueryStore } from '@/state/store';
import { getEngine, getTransport, shutdownEngine, loadSchema } from '@/state/queryService';
import { AppError, TransportError, QueryError, QueryCancelledError } from '@/errors';
import { URLInput } from '@/ui/URLInput';
import { SQLEditor } from '@/ui/SQLEditor';
import { ResultsTable } from '@/ui/ResultsTable';
import { StatusBar } from '@/ui/StatusBar';
import { ErrorPanel } from '@/ui/ErrorPanel';
import { SchemaTree } from '@/ui/SchemaTree';
import type { QueryHandle } from '@/state/queryService';

export default function App() {
  const parquetURL = useQueryStore((s) => s.parquetURL);
  const queryText = useQueryStore((s) => s.queryText);
  const status = useQueryStore((s) => s.status);
  const results = useQueryStore((s) => s.results);
  const error = useQueryStore((s) => s.error);
  const rowCount = useQueryStore((s) => s.rowCount);
  const schema = useQueryStore((s) => s.schema);
  const schemaStatus = useQueryStore((s) => s.schemaStatus);
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
      // Fire schema fetch in background — probe returns to idle immediately
      dispatch({ type: 'SCHEMA_START' });
      loadSchema(parquetURL)
        .then((columns) => dispatch({ type: 'SCHEMA_DONE', columns }))
        .catch(() => dispatch({ type: 'SCHEMA_ERROR' }));
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
      <SchemaTree columns={schema} status={schemaStatus} />
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

- [ ] **Step 3: Typecheck + full test suite**

```bash
pnpm typecheck && pnpm test
```

Expected: all tests pass, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/state/queryService.ts src/App.tsx
git commit -m "feat(schema): wire loadSchema into probe flow, add SchemaTree to layout"
```

---

## Milestone 2: OPFS L3 Cache

### Task 5: OPFSCache

**Files:**

- Create: `src/cache/opfs.ts`
- Create: `src/cache/opfs.test.ts`

Uses FNV-1a hash + `start-end` for short, collision-resistant filenames. `set()` and `clear()` are fire-and-forget — failures are logged but never thrown. `get()` returns `null` on any failure (unavailable OPFS, missing file).

- [ ] **Step 1: Write failing tests**

Create `src/cache/opfs.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CacheKey } from '@/cache/types';

function key(start: number, end: number): CacheKey {
  return { url: 'https://example.com/a.parquet', start, end, contentLength: end - start + 1 };
}

describe('OPFSCache', () => {
  const store = new Map<string, Uint8Array>();

  beforeEach(() => {
    store.clear();

    const makeFileHandle = (name: string) => ({
      getFile: vi.fn(async () => ({
        arrayBuffer: vi.fn(async () => {
          const d = store.get(name) ?? new Uint8Array(0);
          return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer;
        }),
      })),
      createWritable: vi.fn(async () => ({
        write: vi.fn(async (data: Uint8Array) => {
          store.set(name, data);
        }),
        close: vi.fn(async () => {}),
      })),
    });

    const mockDir = {
      getFileHandle: vi.fn(async (name: string, opts?: { create?: boolean }) => {
        if (!opts?.create && !store.has(name)) {
          throw new DOMException('File not found', 'NotFoundError');
        }
        return makeFileHandle(name);
      }),
    };

    const mockRoot = {
      getDirectoryHandle: vi.fn(async () => mockDir),
      removeEntry: vi.fn(async () => {
        store.clear();
      }),
    };

    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory: vi.fn().mockResolvedValue(mockRoot) },
      configurable: true,
    });
  });

  it('returns null for a key never stored', async () => {
    const { OPFSCache } = await import('@/cache/opfs');
    const cache = new OPFSCache();
    expect(await cache.get(key(0, 99))).toBeNull();
  });

  it('stores and retrieves data', async () => {
    const { OPFSCache } = await import('@/cache/opfs');
    const cache = new OPFSCache();
    const data = new Uint8Array([1, 2, 3]);
    cache.set(key(0, 2), data);
    await new Promise((r) => setTimeout(r, 20));
    expect(await cache.get(key(0, 2))).toEqual(data);
  });

  it('overwrites an existing entry', async () => {
    const { OPFSCache } = await import('@/cache/opfs');
    const cache = new OPFSCache();
    const k = key(0, 9);
    cache.set(k, new Uint8Array([1, 1, 1]));
    await new Promise((r) => setTimeout(r, 20));
    cache.set(k, new Uint8Array([2, 2, 2]));
    await new Promise((r) => setTimeout(r, 20));
    expect(await cache.get(k)).toEqual(new Uint8Array([2, 2, 2]));
  });

  it('clear removes all stored entries', async () => {
    const { OPFSCache } = await import('@/cache/opfs');
    const cache = new OPFSCache();
    cache.set(key(0, 9), new Uint8Array([42]));
    await new Promise((r) => setTimeout(r, 20));
    await cache.clear();
    expect(await cache.get(key(0, 9))).toBeNull();
  });

  it('returns null silently when OPFS is unavailable', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn().mockRejectedValue(new DOMException('SecurityError')),
      },
      configurable: true,
    });
    const { OPFSCache } = await import('@/cache/opfs');
    const cache = new OPFSCache();
    expect(await cache.get(key(0, 99))).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test -- opfs
```

Expected: FAIL — `Cannot find module '@/cache/opfs'`.

- [ ] **Step 3: Implement OPFSCache**

Create `src/cache/opfs.ts`:

```ts
import type { ICache, CacheKey } from './types';
import { logger } from '@/util/logger';

function fnv1a32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function keyToFilename(key: CacheKey): string {
  const raw = `${key.url}::${key.etag ?? ''}::${key.lastModified ?? ''}`;
  return `${fnv1a32(raw).toString(16)}-${key.start}-${key.end}`;
}

export class OPFSCache implements ICache {
  private dirPromise: Promise<FileSystemDirectoryHandle> | null = null;

  private getDir(): Promise<FileSystemDirectoryHandle> {
    if (!this.dirPromise) {
      this.dirPromise = navigator.storage
        .getDirectory()
        .then((root) => root.getDirectoryHandle('wasm-db-cache', { create: true }));
    }
    return this.dirPromise;
  }

  async get(key: CacheKey): Promise<Uint8Array | null> {
    try {
      const dir = await this.getDir();
      const fileHandle = await dir.getFileHandle(keyToFilename(key));
      const file = await fileHandle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      return null;
    }
  }

  set(key: CacheKey, data: Uint8Array): void {
    void (async () => {
      try {
        const dir = await this.getDir();
        const fileHandle = await dir.getFileHandle(keyToFilename(key), { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
      } catch (err) {
        logger.warn('OPFS cache write failed', err);
      }
    })();
  }

  async clear(): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('wasm-db-cache', { recursive: true });
      this.dirPromise = null;
    } catch (err) {
      logger.warn('OPFS cache clear failed', err);
    }
  }
}
```

- [ ] **Step 4: Run — expect all 5 OPFSCache tests pass**

```bash
pnpm test -- opfs
```

Expected: 5 passed.

- [ ] **Step 5: Run full suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/cache/opfs.ts src/cache/opfs.test.ts
git commit -m "feat(cache): L3 OPFS cache with FNV-1a filename hashing"
```

---

### Task 6: Wire OPFS into 3-Tier Cache Stack

**Files:** Modify `src/state/queryService.ts`

The cache stack becomes: `TieredCache(MemoryLRU, TieredCache(IndexedDB, OPFS))`. Read-through warming flows all the way up: OPFS hit → warm IndexedDB → warm Memory. Writes go to all three tiers. OPFS failures are silent (fire-and-forget).

- [ ] **Step 1: Update queryService.ts**

Replace the entire file:

```ts
import { EngineClient } from '@/engine/client';
import { HttpTransport } from '@/transport/http';
import { MemoryLRU } from '@/cache/memory';
import { IndexedDBCache } from '@/cache/indexeddb';
import { OPFSCache } from '@/cache/opfs';
import { TieredCache } from '@/cache/tiered';
import { db } from '@/cache/db';
import { fetchSchema } from '@/engine/schema';
import type { QueryHandle } from '@/engine/types';
import type { ColumnInfo } from '@/engine/schema';

let engine: EngineClient | null = null;

const cache = new TieredCache(
  new MemoryLRU(),
  new TieredCache(new IndexedDBCache(db), new OPFSCache()),
);
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

export async function loadSchema(url: string): Promise<ColumnInfo[]> {
  return fetchSchema(url, getEngine());
}

export type { QueryHandle, ColumnInfo };
```

- [ ] **Step 2: Typecheck + full test suite**

```bash
pnpm typecheck && pnpm test
```

Expected: all tests pass, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/state/queryService.ts
git commit -m "feat(cache): add OPFSCache as L3 in TieredCache(L1, TieredCache(L2, L3)) stack"
```

---

## Milestone 3: E2E + Merge

### Task 7: Phase 3 E2E Tests

**Files:** Create `tests/e2e/phase3.spec.ts`

These tests verify schema appears after probe using the real DuckDB-WASM engine in a browser. DuckDB needs ~10 s to initialize on first run — use `timeout: 30000` for schema-dependent assertions.

- [ ] **Step 1: Write E2E tests**

Create `tests/e2e/phase3.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet';

test.describe('Phase 3 — schema explorer', () => {
  test('schema tree appears after probe', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /load/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30000 });
  });

  test('schema tree shows at least one column after probe', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /load/i }).click();
    const tree = page.getByLabel('Schema tree');
    await expect(tree).toBeVisible({ timeout: 30000 });
    // Column names are rendered as spans inside the tree
    await expect(tree.locator('span').first()).toBeVisible();
  });

  test('schema resets when URL is changed', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /load/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30000 });
    // Changing the URL dispatches SET_URL which clears schemaStatus → idle → SchemaTree returns null
    await page.getByLabel('Parquet file URL').fill('https://other.example.com/b.parquet');
    await expect(page.getByLabel('Schema tree')).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests on Chromium**

```bash
pnpm exec playwright test tests/e2e/phase3.spec.ts --project=chromium
```

Expected: 3 passed (DuckDB initialises ~5–15 s on first run; tests use 30 s timeout).

- [ ] **Step 3: Run full unit + E2E suite**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm exec playwright test --project=chromium
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/phase3.spec.ts
git commit -m "test(e2e): Phase 3 schema explorer — panel visible after probe, resets on URL change"
```

---

### Task 8: Merge + Tag phase3-complete

- [ ] **Step 1: Confirm on main**

```bash
git status
git log --oneline -5
```

Expected: clean tree on `main` branch.

- [ ] **Step 2: Final verification**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm exec playwright test --project=chromium
```

Expected: all pass.

- [ ] **Step 3: Tag**

```bash
git tag phase3-complete
git log --oneline -10
```

---

## Self-Review

### Spec Coverage

| Phase 3 requirement                            | Covered by task                    |
| ---------------------------------------------- | ---------------------------------- |
| Schema explorer (column names + types)         | Tasks 1–4                          |
| Schema auto-fetches after probe                | Task 4                             |
| Schema resets on URL change                    | Task 1 (SET_URL reducer)           |
| L3 OPFS cache                                  | Tasks 5–6                          |
| 3-tier cache stack wired                       | Task 6                             |
| Safari durability (no 7-day eviction for OPFS) | Task 5 (OPFSCache)                 |
| OPFS failures are silent                       | Task 5 (fire-and-forget set/clear) |

**Not in scope (deferred to Phase 4):**

- Interval-tree range index — cache hit on sub-ranges
- `pnpm test:reload` CLI reload invariant suite
- URL sharing (hash encoding of parquetURL for sharing)
- Query cost / memory guardrails
- Zustand actions replacing queryService singleton

### Placeholder Scan

No TBDs, no "add appropriate error handling" stubs — all code is complete.

### Type Consistency

- `ColumnInfo` defined in `src/engine/schema.ts`, re-exported through `src/state/queryState.ts` → `SchemaTree.tsx` import is consistent
- `SchemaStatus = 'idle' | 'loading' | 'loaded' | 'error'` — used identically in `queryState.ts`, `SchemaTree.tsx` props, and `App.tsx` selector
- `SCHEMA_DONE` carries `columns: ColumnInfo[]` — matches `schema: ColumnInfo[] | null` field in `QueryState`
- `loadSchema` in `queryService.ts` returns `Promise<ColumnInfo[]>` — matches `.then((columns) => dispatch({ type: 'SCHEMA_DONE', columns }))` in `App.tsx`
- `OPFSCache` implements `ICache` (same interface as `MemoryLRU`, `IndexedDBCache`, `TieredCache`)
- `TieredCache(MemoryLRU, TieredCache(IndexedDB, OPFS))` — nested `TieredCache` is valid since `TieredCache implements ICache`
