# Phase 5 Feature 2: Multi-file Joins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users register up to 5 Parquet URLs as named DuckDB views and JOIN across them in SQL, with alias validation, probe-before-register, and reload-safe persistence.

**Architecture:** A new `filesState.ts` reducer owns `RegisteredFile[]`. A separate `useFilesStore` (Zustand+persist) wraps it. Two new worker messages (`register_file` / `unregister_file`) trigger `CREATE OR REPLACE VIEW` / `DROP VIEW IF EXISTS` in DuckDB. `EngineClient` adds `registerFile()`/`unregisterFile()` methods backed by a `pendingVoid` map (same correlationId pattern as queries, resolved by `batch`/`error` responses). `queryService.ts` exposes thin wrappers. `FilePanel.tsx` renders the collapsible UI. `App.tsx` mounts it, re-registers persisted ready files on mount, and wires all callbacks.

**Tech Stack:** Existing Vitest + `@testing-library/react` + TypeScript strict. No new runtime deps.

---

## File Map

| File                                     | Action | Responsibility                                                                          |
| ---------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `src/state/filesState.ts`                | Create | `RegisteredFile`, `FilesAction`, `filesReducer`, `validateAlias`, `MAX_FILES`           |
| `src/state/filesState.test.ts`           | Create | Reducer unit tests + `validateAlias` tests                                              |
| `src/state/filesStore.ts`                | Create | Zustand store for files slice, persist alias+url+status                                 |
| `src/workers/protocol.ts`                | Modify | Add `register_file` / `unregister_file` to `MainToWorker`                               |
| `src/workers/__tests__/protocol.test.ts` | Modify | Add 2 shape tests for new message types                                                 |
| `src/workers/duckdb.worker.ts`           | Modify | `handleRegisterFile` + `handleUnregisterFile` functions + switch cases                  |
| `src/engine/client.ts`                   | Modify | `pendingVoid` map, update `_handleMessage`, add `registerFile`/`unregisterFile`         |
| `src/engine/__tests__/client.test.ts`    | Modify | 3 new tests for `registerFile`/`unregisterFile`                                         |
| `src/state/queryService.ts`              | Modify | Export `registerFile` / `unregisterFile` wrappers                                       |
| `src/ui/FilePanel.tsx`                   | Create | Collapsible panel with rows: alias input, URL input, Load button, status, Remove button |
| `src/ui/FilePanel.test.tsx`              | Create | RTL tests: render, toggle, add row, alias error, probe button state, remove             |
| `src/App.tsx`                            | Modify | Import `useFilesStore`, re-register on mount, wire FilePanel callbacks, mount FilePanel |
| `tests/e2e/phase5-multifile.spec.ts`     | Create | Panel visibility, probe flow, JOIN query returns results                                |

---

## Task 1: `filesState.ts` — types, reducer, validation

**Files:**

- Create: `src/state/filesState.ts`
- Create: `src/state/filesState.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/state/filesState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filesReducer, validateAlias, initialFilesState, MAX_FILES } from './filesState';
import type { RegisteredFile } from './filesState';

describe('filesReducer — ADD_FILE', () => {
  it('adds a new file with given id, empty alias and url, idle status', () => {
    const next = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({ id: 'f1', alias: '', url: '', status: 'idle' });
  });

  it('does not add beyond MAX_FILES', () => {
    const full: RegisteredFile[] = Array.from({ length: MAX_FILES }, (_, i) => ({
      id: `f${i}`,
      alias: `t${i}`,
      url: `http://x.com/${i}.parquet`,
      status: 'ready' as const,
    }));
    const next = filesReducer(full, { type: 'ADD_FILE', id: 'overflow' });
    expect(next).toHaveLength(MAX_FILES);
  });
});

describe('filesReducer — UPDATE_FILE_ALIAS', () => {
  it('updates alias for matching id, leaves others unchanged', () => {
    const state = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    const next = filesReducer(state, { type: 'UPDATE_FILE_ALIAS', id: 'f1', alias: 'sales' });
    expect(next[0].alias).toBe('sales');
  });

  it('does not mutate other files', () => {
    let state = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    state = filesReducer(state, { type: 'ADD_FILE', id: 'f2' });
    const next = filesReducer(state, { type: 'UPDATE_FILE_ALIAS', id: 'f1', alias: 'sales' });
    expect(next[1].alias).toBe('');
  });
});

describe('filesReducer — UPDATE_FILE_URL', () => {
  it('updates url for matching id', () => {
    const state = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    const next = filesReducer(state, {
      type: 'UPDATE_FILE_URL',
      id: 'f1',
      url: 'http://x.com/a.parquet',
    });
    expect(next[0].url).toBe('http://x.com/a.parquet');
  });
});

describe('filesReducer — probe lifecycle', () => {
  it('FILE_PROBE_START sets status to probing', () => {
    const state = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    const next = filesReducer(state, { type: 'FILE_PROBE_START', id: 'f1' });
    expect(next[0].status).toBe('probing');
  });

  it('FILE_PROBE_DONE sets status to ready', () => {
    const s1 = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    const s2 = filesReducer(s1, { type: 'FILE_PROBE_START', id: 'f1' });
    const next = filesReducer(s2, { type: 'FILE_PROBE_DONE', id: 'f1' });
    expect(next[0].status).toBe('ready');
  });

  it('FILE_PROBE_ERROR sets status to error', () => {
    const state = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    const next = filesReducer(state, { type: 'FILE_PROBE_ERROR', id: 'f1' });
    expect(next[0].status).toBe('error');
  });
});

describe('filesReducer — REMOVE_FILE', () => {
  it('removes the file with matching id', () => {
    const s1 = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    const s2 = filesReducer(s1, { type: 'ADD_FILE', id: 'f2' });
    const next = filesReducer(s2, { type: 'REMOVE_FILE', id: 'f1' });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('f2');
  });
});

describe('validateAlias', () => {
  it('returns null for a valid alias with no conflicts', () => {
    expect(validateAlias('sales_2024', [])).toBeNull();
  });

  it('rejects empty string', () => {
    expect(validateAlias('', [])).toBeTruthy();
  });

  it('rejects alias starting with a digit', () => {
    expect(validateAlias('2sales', [])).toBeTruthy();
  });

  it('rejects alias with hyphens or spaces', () => {
    expect(validateAlias('my-alias', [])).toBeTruthy();
    expect(validateAlias('my alias', [])).toBeTruthy();
  });

  it('rejects alias longer than 32 characters', () => {
    expect(validateAlias('a'.repeat(33), [])).toBeTruthy();
  });

  it('rejects reserved SQL keywords (case-insensitive)', () => {
    expect(validateAlias('select', [])).toBeTruthy();
    expect(validateAlias('FROM', [])).toBeTruthy();
    expect(validateAlias('Join', [])).toBeTruthy();
  });

  it('rejects duplicate alias', () => {
    expect(validateAlias('sales', ['sales', 'orders'])).toBeTruthy();
  });

  it('accepts underscore-leading alias', () => {
    expect(validateAlias('_private', [])).toBeNull();
  });

  it('accepts 32-character alias', () => {
    expect(validateAlias('a'.repeat(32), [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test -- "filesState" 2>&1 | tail -10
```

Expected: `Cannot find module './filesState'` — confirms the file doesn't exist yet.

- [ ] **Step 3: Create `src/state/filesState.ts`**

```ts
export interface RegisteredFile {
  id: string;
  alias: string;
  url: string;
  status: 'idle' | 'probing' | 'ready' | 'error';
}

export type FilesAction =
  | { type: 'ADD_FILE'; id: string }
  | { type: 'UPDATE_FILE_ALIAS'; id: string; alias: string }
  | { type: 'UPDATE_FILE_URL'; id: string; url: string }
  | { type: 'FILE_PROBE_START'; id: string }
  | { type: 'FILE_PROBE_DONE'; id: string }
  | { type: 'FILE_PROBE_ERROR'; id: string }
  | { type: 'REMOVE_FILE'; id: string };

export const MAX_FILES = 5;

const RESERVED_SQL_KEYWORDS = new Set(['SELECT', 'FROM', 'WHERE', 'JOIN', 'TABLE', 'VIEW']);

export function validateAlias(alias: string, existingAliases: string[]): string | null {
  if (!alias) return 'Alias is required';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias))
    return 'Letters, digits, underscores only; must start with letter or underscore';
  if (alias.length > 32) return 'Maximum 32 characters';
  if (RESERVED_SQL_KEYWORDS.has(alias.toUpperCase())) return `"${alias}" is a reserved SQL keyword`;
  if (existingAliases.includes(alias)) return 'Alias already in use';
  return null;
}

export const initialFilesState: RegisteredFile[] = [];

export function filesReducer(state: RegisteredFile[], action: FilesAction): RegisteredFile[] {
  switch (action.type) {
    case 'ADD_FILE':
      if (state.length >= MAX_FILES) return state;
      return [...state, { id: action.id, alias: '', url: '', status: 'idle' }];

    case 'UPDATE_FILE_ALIAS':
      return state.map((f) => (f.id === action.id ? { ...f, alias: action.alias } : f));

    case 'UPDATE_FILE_URL':
      return state.map((f) => (f.id === action.id ? { ...f, url: action.url } : f));

    case 'FILE_PROBE_START':
      return state.map((f) => (f.id === action.id ? { ...f, status: 'probing' } : f));

    case 'FILE_PROBE_DONE':
      return state.map((f) => (f.id === action.id ? { ...f, status: 'ready' } : f));

    case 'FILE_PROBE_ERROR':
      return state.map((f) => (f.id === action.id ? { ...f, status: 'error' } : f));

    case 'REMOVE_FILE':
      return state.filter((f) => f.id !== action.id);

    default:
      return state;
  }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm test -- "filesState" 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/state/filesState.ts src/state/filesState.test.ts
git commit -m "feat(multifile): filesState — RegisteredFile, reducer, validateAlias"
```

---

## Task 2: `filesStore.ts` — Zustand store

**Files:**

- Create: `src/state/filesStore.ts`

- [ ] **Step 1: Create `src/state/filesStore.ts`**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { filesReducer, initialFilesState } from './filesState';
import type { RegisteredFile, FilesAction } from './filesState';

export interface FilesStore {
  files: RegisteredFile[];
  filesDispatch: (action: FilesAction) => void;
}

export const useFilesStore = create<FilesStore>()(
  persist(
    (set) => ({
      files: initialFilesState,
      filesDispatch: (action: FilesAction) =>
        set((state) => ({ files: filesReducer(state.files, action) })),
    }),
    {
      name: 'wasm-db-files',
      partialize: (state) => ({
        files: state.files.map((f) => ({
          id: f.id,
          alias: f.alias,
          url: f.url,
          // Clamp on reload: ready stays ready; probing/error resets to idle
          status: f.status === 'ready' ? ('ready' as const) : ('idle' as const),
        })),
      }),
    },
  ),
);
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/state/filesStore.ts
git commit -m "feat(multifile): useFilesStore — Zustand store for registered files"
```

---

## Task 3: Protocol — `register_file` / `unregister_file` message types

**Files:**

- Modify: `src/workers/protocol.ts`
- Modify: `src/workers/__tests__/protocol.test.ts`

- [ ] **Step 1: Write failing protocol shape tests**

Open `src/workers/__tests__/protocol.test.ts`. Add at the end of the `MainToWorker protocol` describe block:

```ts
it('register_file message has alias and url', () => {
  const msg: MainToWorker = {
    kind: 'register_file',
    correlationId: 'rf-1',
    alias: 'sales',
    url: 'http://x.com/sales.parquet',
  };
  expect(msg.alias).toBe('sales');
  expect(msg.url).toBe('http://x.com/sales.parquet');
});

it('unregister_file message has alias', () => {
  const msg: MainToWorker = {
    kind: 'unregister_file',
    correlationId: 'uf-1',
    alias: 'sales',
  };
  expect(msg.alias).toBe('sales');
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test -- "protocol" 2>&1 | tail -10
```

Expected: TypeScript error — `'register_file'` is not assignable to `kind`.

- [ ] **Step 3: Update `src/workers/protocol.ts`**

In `MainToWorker`, add two new variants after `'shutdown'`:

```ts
export type MainToWorker =
  | { kind: 'init'; correlationId: string; config: DuckDBWorkerConfig }
  | { kind: 'query'; correlationId: string; sql: string; opts: QueryOpts }
  | { kind: 'cancel'; correlationId: string; target: string }
  | { kind: 'shutdown'; correlationId: string }
  | { kind: 'register_file'; correlationId: string; alias: string; url: string }
  | { kind: 'unregister_file'; correlationId: string; alias: string };
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm test -- "protocol" 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/workers/protocol.ts src/workers/__tests__/protocol.test.ts
git commit -m "feat(multifile): protocol — register_file / unregister_file message types"
```

---

## Task 4: Worker — handle `register_file` / `unregister_file`

**Files:**

- Modify: `src/workers/duckdb.worker.ts`

- [ ] **Step 1: Add `handleRegisterFile` function**

In `src/workers/duckdb.worker.ts`, after `handleCancel`, add:

```ts
async function handleRegisterFile(
  correlationId: string,
  alias: string,
  url: string,
): Promise<void> {
  if (!conn) {
    post({
      kind: 'error',
      correlationId,
      error: { code: 'WORKER_ERROR', message: 'Worker not initialised — send init first' },
    });
    return;
  }
  try {
    const safeUrl = url.replace(/'/g, "''");
    await conn.query(`CREATE OR REPLACE VIEW ${alias} AS SELECT * FROM parquet_scan('${safeUrl}')`);
    post({ kind: 'batch', correlationId, rows: [], done: true });
  } catch (err) {
    post({
      kind: 'error',
      correlationId,
      error: {
        code: 'QUERY_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}
```

- [ ] **Step 2: Add `handleUnregisterFile` function**

Immediately after `handleRegisterFile`, add:

```ts
async function handleUnregisterFile(correlationId: string, alias: string): Promise<void> {
  if (!conn) {
    post({
      kind: 'error',
      correlationId,
      error: { code: 'WORKER_ERROR', message: 'Worker not initialised — send init first' },
    });
    return;
  }
  try {
    await conn.query(`DROP VIEW IF EXISTS ${alias}`);
    post({ kind: 'batch', correlationId, rows: [], done: true });
  } catch (err) {
    post({
      kind: 'error',
      correlationId,
      error: {
        code: 'QUERY_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}
```

- [ ] **Step 3: Add cases to the message switch**

Find the `self.addEventListener('message', ...)` switch. Add after `case 'shutdown':`:

```ts
    case 'register_file':
      void handleRegisterFile(msg.correlationId, msg.alias, msg.url);
      break;
    case 'unregister_file':
      void handleUnregisterFile(msg.correlationId, msg.alias);
      break;
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/workers/duckdb.worker.ts
git commit -m "feat(multifile): worker — handleRegisterFile / handleUnregisterFile"
```

---

## Task 5: `EngineClient` — `registerFile` / `unregisterFile` methods

**Files:**

- Modify: `src/engine/client.ts`
- Modify: `src/engine/__tests__/client.test.ts`

The pattern reuses the existing correlationId infrastructure. A new `pendingVoid` map stores `{ resolve, reject }` for fire-and-forget void operations. `_handleMessage` checks this map first in the `batch` and `error` cases.

- [ ] **Step 1: Write three failing tests**

Open `src/engine/__tests__/client.test.ts`. Add a new `describe` block at the end:

```ts
describe('EngineClient — registerFile / unregisterFile', () => {
  it('registerFile resolves when worker acks with empty batch', async () => {
    vi.resetModules();
    const { EngineClient } = await import('@/engine/client');
    const client = new EngineClient(() => mockWorker as unknown as Worker);
    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0', spillActive: false });

    const promise = client.registerFile('sales', 'http://x.com/sales.parquet');

    const regMsg = mockWorker.postMessage.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === 'register_file',
    )![0] as { correlationId: string };
    mockWorker.simulateMessage({
      kind: 'batch',
      correlationId: regMsg.correlationId,
      rows: [],
      done: true,
    });

    await expect(promise).resolves.toBeUndefined();
    client.shutdown();
  });

  it('registerFile rejects on error from worker', async () => {
    vi.resetModules();
    const { EngineClient } = await import('@/engine/client');
    const client = new EngineClient(() => mockWorker as unknown as Worker);
    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0', spillActive: false });

    const promise = client.registerFile('bad', 'http://x.com/bad.parquet');

    const regMsg = mockWorker.postMessage.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === 'register_file',
    )![0] as { correlationId: string };
    mockWorker.simulateMessage({
      kind: 'error',
      correlationId: regMsg.correlationId,
      error: { code: 'QUERY_ERROR', message: 'file not found' },
    });

    await expect(promise).rejects.toThrow('file not found');
    client.shutdown();
  });

  it('unregisterFile resolves when worker acks with empty batch', async () => {
    vi.resetModules();
    const { EngineClient } = await import('@/engine/client');
    const client = new EngineClient(() => mockWorker as unknown as Worker);
    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0', spillActive: false });

    const promise = client.unregisterFile('sales');

    const unregMsg = mockWorker.postMessage.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === 'unregister_file',
    )![0] as { correlationId: string };
    mockWorker.simulateMessage({
      kind: 'batch',
      correlationId: unregMsg.correlationId,
      rows: [],
      done: true,
    });

    await expect(promise).resolves.toBeUndefined();
    client.shutdown();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test -- "client" 2>&1 | tail -15
```

Expected: TypeScript error — `Property 'registerFile' does not exist on type 'EngineClient'`.

- [ ] **Step 3: Add `pendingVoid` field to `EngineClient`**

In `src/engine/client.ts`, inside the `EngineClient` class, after `private readonly initCorrelationId: string;`, add:

```ts
  private pendingVoid = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
```

- [ ] **Step 4: Update `_handleMessage` to check `pendingVoid`**

Replace the entire `_handleMessage` method with:

```ts
  private _handleMessage(msg: WorkerToMain): void {
    switch (msg.kind) {
      case 'ready':
        this._spillActive = msg.spillActive;
        this.readyResolve();
        break;

      case 'batch': {
        const voidEntry = this.pendingVoid.get(msg.correlationId);
        if (voidEntry) {
          if (msg.done) {
            voidEntry.resolve();
            this.pendingVoid.delete(msg.correlationId);
          }
          return;
        }
        const handle = this.pending.get(msg.correlationId);
        if (!handle) return;
        handle._receiveBatch(msg.rows, msg.done);
        if (msg.done) this.pending.delete(msg.correlationId);
        break;
      }

      case 'error': {
        const voidEntry = this.pendingVoid.get(msg.correlationId);
        if (voidEntry) {
          voidEntry.reject(new QueryError(msg.error.message));
          this.pendingVoid.delete(msg.correlationId);
          return;
        }
        const handle = this.pending.get(msg.correlationId);
        if (handle) {
          const err =
            msg.error.code === 'QUERY_CANCELLED'
              ? new QueryCancelledError(msg.error.message)
              : new QueryError(msg.error.message);
          handle._receiveError(err);
          this.pending.delete(msg.correlationId);
        } else if (msg.correlationId === this.initCorrelationId) {
          this.crashError = new WorkerCrashError(msg.error.message);
          this.readyReject(this.crashError);
        }
        break;
      }

      case 'progress':
        // Phase 3: propagate to UI progress state
        break;
    }
  }
```

- [ ] **Step 5: Add `registerFile` and `unregisterFile` methods**

In `src/engine/client.ts`, after `runQuery`, add:

```ts
  async registerFile(alias: string, url: string): Promise<void> {
    if (this.crashError) throw this.crashError;
    await this.readyPromise;
    if (this.crashError) throw this.crashError;
    const id = crypto.randomUUID();
    return new Promise<void>((resolve, reject) => {
      this.pendingVoid.set(id, { resolve, reject });
      this.worker.postMessage({
        kind: 'register_file',
        correlationId: id,
        alias,
        url,
      } satisfies MainToWorker);
    });
  }

  async unregisterFile(alias: string): Promise<void> {
    if (this.crashError) throw this.crashError;
    await this.readyPromise;
    if (this.crashError) throw this.crashError;
    const id = crypto.randomUUID();
    return new Promise<void>((resolve, reject) => {
      this.pendingVoid.set(id, { resolve, reject });
      this.worker.postMessage({
        kind: 'unregister_file',
        correlationId: id,
        alias,
      } satisfies MainToWorker);
    });
  }
```

- [ ] **Step 6: Run tests and confirm they pass**

```bash
pnpm test -- "client" 2>&1 | tail -10
```

Expected: all 13 tests pass (10 existing + 3 new).

- [ ] **Step 7: Commit**

```bash
git add src/engine/client.ts src/engine/__tests__/client.test.ts
git commit -m "feat(multifile): EngineClient — registerFile / unregisterFile via pendingVoid map"
```

---

## Task 6: `queryService.ts` — expose `registerFile` / `unregisterFile`

**Files:**

- Modify: `src/state/queryService.ts`

- [ ] **Step 1: Add the two exported wrappers**

In `src/state/queryService.ts`, after `shutdownEngine`, add:

```ts
export function registerFile(alias: string, url: string): Promise<void> {
  return getEngine().registerFile(alias, url);
}

export function unregisterFile(alias: string): Promise<void> {
  return getEngine().unregisterFile(alias);
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/state/queryService.ts
git commit -m "feat(multifile): queryService — expose registerFile / unregisterFile"
```

---

## Task 7: `FilePanel.tsx` and `FilePanel.test.tsx`

**Files:**

- Create: `src/ui/FilePanel.tsx`
- Create: `src/ui/FilePanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/ui/FilePanel.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilePanel } from '@/ui/FilePanel';
import type { RegisteredFile } from '@/state/filesState';

const baseFile: RegisteredFile = {
  id: 'f1',
  alias: 'sales',
  url: 'http://x.com/sales.parquet',
  status: 'idle',
};

describe('FilePanel', () => {
  it('renders the toggle button', () => {
    render(
      <FilePanel
        files={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /toggle additional files panel/i }),
    ).toBeInTheDocument();
  });

  it('panel body is visible by default', () => {
    render(
      <FilePanel
        files={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByLabel('Additional files panel')).toBeInTheDocument();
  });

  it('clicking toggle hides and shows the panel', () => {
    render(
      <FilePanel
        files={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    const toggle = screen.getByRole('button', { name: /toggle additional files panel/i });
    fireEvent.click(toggle);
    expect(screen.queryByLabel('Additional files panel')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByLabel('Additional files panel')).toBeInTheDocument();
  });

  it('Add file button calls onAdd', () => {
    const onAdd = vi.fn();
    render(
      <FilePanel
        files={[]}
        onAdd={onAdd}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /add file/i }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('Add file button is disabled at 5 files', () => {
    const files: RegisteredFile[] = Array.from({ length: 5 }, (_, i) => ({
      id: `f${i}`,
      alias: `t${i}`,
      url: `http://x.com/${i}.parquet`,
      status: 'ready' as const,
    }));
    render(
      <FilePanel
        files={files}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /add file/i })).toBeDisabled();
  });

  it('renders alias input, url input, Load and Remove buttons for each file', () => {
    render(
      <FilePanel
        files={[baseFile]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('sales')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://x.com/sales.parquet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /probe file f1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove file f1/i })).toBeInTheDocument();
  });

  it('Load button is disabled when URL is empty', () => {
    const emptyFile: RegisteredFile = { id: 'f1', alias: 'sales', url: '', status: 'idle' };
    render(
      <FilePanel
        files={[emptyFile]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /probe file f1/i })).toBeDisabled();
  });

  it('Load button is disabled when alias is invalid', () => {
    const badAlias: RegisteredFile = {
      id: 'f1',
      alias: '123bad',
      url: 'http://x.com/sales.parquet',
      status: 'idle',
    };
    render(
      <FilePanel
        files={[badAlias]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /probe file f1/i })).toBeDisabled();
  });

  it('shows inline alias error for invalid alias', () => {
    const badAlias: RegisteredFile = {
      id: 'f1',
      alias: 'select',
      url: 'http://x.com/sales.parquet',
      status: 'idle',
    };
    render(
      <FilePanel
        files={[badAlias]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByText(/reserved sql keyword/i)).toBeInTheDocument();
  });

  it('calls onProbe with file id when Load is clicked', () => {
    const onProbe = vi.fn();
    render(
      <FilePanel
        files={[baseFile]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={onProbe}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /probe file f1/i }));
    expect(onProbe).toHaveBeenCalledWith('f1');
  });

  it('calls onRemove with file id when × is clicked', () => {
    const onRemove = vi.fn();
    render(
      <FilePanel
        files={[baseFile]}
        onAdd={vi.fn()}
        onRemove={onRemove}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /remove file f1/i }));
    expect(onRemove).toHaveBeenCalledWith('f1');
  });

  it('shows probing label when status is probing', () => {
    const probing: RegisteredFile = { ...baseFile, status: 'probing' };
    render(
      <FilePanel
        files={[probing]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /probe file f1/i })).toBeDisabled();
  });

  it('shows ready indicator when status is ready', () => {
    const ready: RegisteredFile = { ...baseFile, status: 'ready' };
    render(
      <FilePanel
        files={[ready]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByText(/✓ ready/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test -- "FilePanel" 2>&1 | tail -10
```

Expected: `Cannot find module '@/ui/FilePanel'`.

- [ ] **Step 3: Create `src/ui/FilePanel.tsx`**

```tsx
import { useState } from 'react';
import { validateAlias, MAX_FILES } from '@/state/filesState';
import type { RegisteredFile } from '@/state/filesState';

interface FilePanelProps {
  files: RegisteredFile[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChangeAlias: (id: string, alias: string) => void;
  onChangeUrl: (id: string, url: string) => void;
  onProbe: (id: string) => void;
}

const STATUS_LABEL: Record<RegisteredFile['status'], string> = {
  idle: '',
  probing: 'Probing…',
  ready: '✓ ready',
  error: 'Error',
};

export function FilePanel({
  files,
  onAdd,
  onRemove,
  onChangeAlias,
  onChangeUrl,
  onProbe,
}: FilePanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ borderTop: '1px solid #333', fontSize: '13px' }}>
      <button
        aria-expanded={open}
        aria-label="Toggle additional files panel"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '6px 12px',
          background: 'none',
          border: 'none',
          color: '#888',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        {open ? '▾' : '▸'} Additional files ({files.length}/{MAX_FILES})
      </button>

      {open && (
        <div style={{ padding: '0 12px 8px' }} aria-label="Additional files panel">
          {files.map((file) => {
            const otherAliases = files.filter((f) => f.id !== file.id).map((f) => f.alias);
            const aliasError = file.alias ? validateAlias(file.alias, otherAliases) : null;
            const probeDisabled =
              file.status === 'probing' ||
              !file.url.trim() ||
              !!validateAlias(file.alias, otherAliases);

            return (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'flex-start',
                  marginBottom: '6px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', flex: '0 0 120px' }}>
                  <input
                    aria-label={`Alias for file ${file.id}`}
                    value={file.alias}
                    onChange={(e) => onChangeAlias(file.id, e.target.value)}
                    placeholder="alias"
                    style={{
                      background: '#1e1e1e',
                      border: `1px solid ${aliasError ? '#f88' : '#444'}`,
                      color: '#e0e0e0',
                      padding: '3px 6px',
                      borderRadius: '3px',
                      fontSize: '12px',
                      width: '100%',
                    }}
                  />
                  {aliasError && (
                    <span style={{ color: '#f88', fontSize: '11px', marginTop: '2px' }}>
                      {aliasError}
                    </span>
                  )}
                </div>
                <input
                  aria-label={`URL for file ${file.id}`}
                  value={file.url}
                  onChange={(e) => onChangeUrl(file.id, e.target.value)}
                  placeholder="https://…/file.parquet"
                  style={{
                    flex: 1,
                    background: '#1e1e1e',
                    border: '1px solid #444',
                    color: '#e0e0e0',
                    padding: '3px 6px',
                    borderRadius: '3px',
                    fontSize: '12px',
                  }}
                />
                <button
                  aria-label={`Probe file ${file.id}`}
                  onClick={() => onProbe(file.id)}
                  disabled={probeDisabled}
                  style={{ fontSize: '12px', padding: '3px 8px' }}
                >
                  {file.status === 'probing' ? 'Probing…' : 'Load'}
                </button>
                <span
                  style={{
                    color:
                      file.status === 'ready' ? '#6a9' : file.status === 'error' ? '#f88' : '#888',
                    fontSize: '11px',
                    minWidth: '52px',
                    paddingTop: '4px',
                  }}
                >
                  {STATUS_LABEL[file.status]}
                </span>
                <button
                  aria-label={`Remove file ${file.id}`}
                  onClick={() => onRemove(file.id)}
                  style={{
                    fontSize: '12px',
                    padding: '3px 8px',
                    color: '#f88',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}

          <button
            aria-label="Add file"
            onClick={onAdd}
            disabled={files.length >= MAX_FILES}
            style={{ fontSize: '12px', padding: '3px 10px', marginTop: '4px' }}
          >
            + Add file
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm test -- "FilePanel" 2>&1 | tail -10
```

Expected: all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/FilePanel.tsx src/ui/FilePanel.test.tsx
git commit -m "feat(multifile): FilePanel — collapsible file registration UI with alias validation"
```

---

## Task 8: Wire `FilePanel` into `App.tsx`

**Files:**

- Modify: `src/App.tsx`

Three changes: (1) subscribe to `useFilesStore`, (2) add `handleProbeFile` and `handleRemoveFile` callbacks, (3) add re-registration effect on mount, (4) mount `<FilePanel>` above `<SchemaTree>`.

- [ ] **Step 1: Add `useFilesStore` import, expand `queryService` import, add `FilePanel` import**

In `src/App.tsx`:

Add after the `useQueryStore` import line:

```ts
import { useFilesStore } from '@/state/filesStore';
import { FilePanel } from '@/ui/FilePanel';
```

Change the existing `queryService` import to also include `registerFile` and `unregisterFile`:

```ts
import {
  getEngine,
  getTransport,
  shutdownEngine,
  loadSchema,
  getSpillActive,
  registerFile,
  unregisterFile,
} from '@/state/queryService';
```

Inside `App()`, after the existing store subscriptions, add:

```ts
const files = useFilesStore((s) => s.files);
const filesDispatch = useFilesStore((s) => s.filesDispatch);
```

- [ ] **Step 2: Add the re-registration mount effect**

After the `useEffect(() => () => shutdownEngine(), [])` line, add:

```ts
// On mount, re-register files that were persisted as ready (DuckDB views are gone after reload).
useEffect(() => {
  const readyFiles = files.filter((f) => f.status === 'ready');
  for (const f of readyFiles) {
    void registerFile(f.alias, f.url);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 3: Add `handleProbeFile` callback**

After `handleCancel`, add:

```ts
const handleProbeFile = useCallback(
  async (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;
    filesDispatch({ type: 'FILE_PROBE_START', id });
    try {
      const controller = new AbortController();
      await getTransport().probeURL(file.url, controller.signal);
      await registerFile(file.alias, file.url);
      filesDispatch({ type: 'FILE_PROBE_DONE', id });
    } catch {
      filesDispatch({ type: 'FILE_PROBE_ERROR', id });
    }
  },
  [files, filesDispatch],
);
```

- [ ] **Step 4: Add `handleRemoveFile` callback**

After `handleProbeFile`, add:

```ts
const handleRemoveFile = useCallback(
  (id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) return;
    if (file.status === 'ready') {
      void unregisterFile(file.alias);
    }
    filesDispatch({ type: 'REMOVE_FILE', id });
  },
  [files, filesDispatch],
);
```

- [ ] **Step 5: Mount `<FilePanel>` in the JSX**

Find the `<SchemaTree ...>` line in the return block. Insert `<FilePanel>` immediately before it:

```tsx
      <FilePanel
        files={files}
        onAdd={() => filesDispatch({ type: 'ADD_FILE', id: crypto.randomUUID() })}
        onRemove={handleRemoveFile}
        onChangeAlias={(id, alias) => filesDispatch({ type: 'UPDATE_FILE_ALIAS', id, alias })}
        onChangeUrl={(id, url) => filesDispatch({ type: 'UPDATE_FILE_URL', id, url })}
        onProbe={handleProbeFile}
      />
      <SchemaTree columns={schema} status={schemaStatus} />
```

- [ ] **Step 6: Run full suite and typecheck**

```bash
pnpm typecheck && pnpm lint && pnpm test 2>&1 | tail -12
```

Expected: typecheck exits 0, lint exits 0, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat(multifile): wire FilePanel into App — probe, remove, re-register on mount"
```

---

## Task 9: E2E test

**Files:**

- Create: `tests/e2e/phase5-multifile.spec.ts`

- [ ] **Step 1: Create the E2E test file**

Create `tests/e2e/phase5-multifile.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet';

test.describe('Phase 5 — multi-file joins', () => {
  test('FilePanel toggle button is visible on load', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: /toggle additional files panel/i }),
    ).toBeVisible();
  });

  test('panel body is visible by default and hides on toggle', async ({ page }) => {
    await page.goto('/');
    const panel = page.getByLabel('Additional files panel');
    await expect(panel).toBeVisible();
    await page.getByRole('button', { name: /toggle additional files panel/i }).click();
    await expect(panel).not.toBeVisible();
  });

  test('Add file button is disabled after 5 rows are added', async ({ page }) => {
    await page.goto('/');
    const addBtn = page.getByRole('button', { name: /add file/i });
    for (let i = 0; i < 5; i++) {
      await addBtn.click();
    }
    await expect(addBtn).toBeDisabled();
  });

  test('alias validation error appears for reserved keyword', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /add file/i }).click();
    await page
      .getByLabel(/Alias for file/i)
      .first()
      .fill('select');
    await expect(page.getByText(/reserved sql keyword/i)).toBeVisible();
  });

  test('probe flow: fill alias + URL → click Load → status shows ready', async ({ page }) => {
    await page.goto('/');

    // Load the primary file first so the engine is warmed up.
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /^load$/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30_000 });

    // Add a secondary file.
    await page.getByRole('button', { name: /add file/i }).click();
    await page
      .getByLabel(/Alias for file/i)
      .first()
      .fill('orders');
    await page
      .getByLabel(/URL for file/i)
      .first()
      .fill(FIXTURE_URL);
    await page
      .getByLabel(/Probe file/i)
      .first()
      .click();

    await expect(page.getByText(/✓ ready/)).toBeVisible({ timeout: 30_000 });
  });

  test('JOIN query against registered view returns results', async ({ page }) => {
    await page.goto('/');

    // Load primary file.
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /^load$/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30_000 });

    // Register secondary file as alias_b.
    await page.getByRole('button', { name: /add file/i }).click();
    await page
      .getByLabel(/Alias for file/i)
      .first()
      .fill('alias_b');
    await page
      .getByLabel(/URL for file/i)
      .first()
      .fill(FIXTURE_URL);
    await page
      .getByLabel(/Probe file/i)
      .first()
      .click();
    await expect(page.getByText(/✓ ready/)).toBeVisible({ timeout: 30_000 });

    // Replace the SQL editor content with a JOIN query.
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(
      `SELECT a.id FROM parquet_scan('${FIXTURE_URL}') a JOIN alias_b b ON a.id = b.id LIMIT 5`,
    );

    // Run the query.
    await page.getByRole('button', { name: /run query/i }).click();

    // Results table should appear with at least one cell.
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });
  });
});
```

- [ ] **Step 2: Verify the test file compiles**

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/phase5-multifile.spec.ts
git commit -m "test(e2e): Phase 5 multi-file joins — panel toggle, probe flow, JOIN query"
```

---

## Final Verification

After all tasks:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All 113+ unit tests pass (100 existing + 2 protocol + 3 EngineClient + ~16 filesState + ~13 FilePanel).

E2E (browser required, run separately):

```bash
pnpm test:e2e -- --project=chromium tests/e2e/phase5-multifile.spec.ts
```

Expected: all 5 E2E tests pass on Chromium.
