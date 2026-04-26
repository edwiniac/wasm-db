# Phase 4: URL Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users share a Parquet query via a URL hash — opening the link auto-probes the file, restores the SQL, and warns if the schema has changed since the link was created.

**Architecture:** Three independent additions wired together. (1) `src/util/sharing.ts` — pure functions for URL encode/decode and schema fingerprinting; no side effects, easy to test in isolation. (2) `ShareButton` + `DriftBanner` — prop-driven UI components, no store access. (3) `App.tsx` wiring — auto-probe on mount when hash has `url` param, ShareButton in toolbar, DriftBanner between toolbar and schema panel.

**Tech Stack:** Existing Vitest + jsdom + `@testing-library/react` + Playwright; no new runtime dependencies.

---

## File Map

| File                           | Action | Responsibility                                                    |
| ------------------------------ | ------ | ----------------------------------------------------------------- |
| `src/util/sharing.ts`          | Create | `computeFingerprint()`, `encodeShareURL()`, `decodeShareParams()` |
| `src/util/sharing.test.ts`     | Create | 6 unit tests for the three functions                              |
| `src/state/queryState.ts`      | Modify | Add `sharedFingerprint`, `schemaDrift` fields + 3 new actions     |
| `src/state/queryState.test.ts` | Modify | 4 additional reducer tests for new actions                        |
| `src/ui/ShareButton.tsx`       | Create | Clipboard copy + "Copied!" / "Copy failed" feedback               |
| `src/ui/ShareButton.test.tsx`  | Create | 5 RTL tests                                                       |
| `src/ui/DriftBanner.tsx`       | Create | Dismissible schema-drift warning                                  |
| `src/ui/DriftBanner.test.tsx`  | Create | 3 RTL tests                                                       |
| `src/App.tsx`                  | Modify | Auto-probe on mount, ShareButton toolbar row, DriftBanner         |
| `tests/e2e/phase4.spec.ts`     | Create | 3 Playwright tests                                                |

---

## Milestone 1: Sharing Utilities

### Task 1: `src/util/sharing.ts`

**Files:**

- Create: `src/util/sharing.ts`
- Create: `src/util/sharing.test.ts`

`computeFingerprint` produces an 8-char hex string from column names + types. `encodeShareURL` builds a hash-fragment URL (`#url=...&q=...&sf=...`). `decodeShareParams` parses the hash and validates the scheme. All three are pure functions with no side effects.

- [ ] **Step 1: Write failing tests**

Create `src/util/sharing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeFingerprint, encodeShareURL, decodeShareParams } from '@/util/sharing';
import type { ColumnInfo } from '@/engine/schema';

const cols: ColumnInfo[] = [
  { name: 'id', type: 'INTEGER', nullable: false },
  { name: 'label', type: 'VARCHAR', nullable: true },
];

describe('computeFingerprint', () => {
  it('is stable for identical columns', () => {
    expect(computeFingerprint(cols)).toBe(computeFingerprint(cols));
  });

  it('differs when column order changes', () => {
    const reversed = [...cols].reverse();
    expect(computeFingerprint(cols)).not.toBe(computeFingerprint(reversed));
  });
});

describe('encodeShareURL', () => {
  it('produces a URL whose hash contains url, q, and sf params', () => {
    const result = encodeShareURL('https://x.com/a.parquet', 'SELECT 1', 'abc12345');
    const hash = result.split('#')[1] ?? '';
    const p = new URLSearchParams(hash);
    expect(p.get('url')).toBe('https://x.com/a.parquet');
    expect(p.get('q')).toBe('SELECT 1');
    expect(p.get('sf')).toBe('abc12345');
  });

  it('omits sf param when fingerprint is null', () => {
    const result = encodeShareURL('https://x.com/a.parquet', 'SELECT 1', null);
    const hash = result.split('#')[1] ?? '';
    const p = new URLSearchParams(hash);
    expect(p.get('sf')).toBeNull();
  });
});

describe('decodeShareParams', () => {
  it('round-trips params produced by encodeShareURL', () => {
    const encoded = encodeShareURL('https://x.com/a.parquet', 'SELECT 1', 'abc12345');
    const hash = encoded.split('#')[1] ?? '';
    const { url, query, fingerprint } = decodeShareParams(hash);
    expect(url).toBe('https://x.com/a.parquet');
    expect(query).toBe('SELECT 1');
    expect(fingerprint).toBe('abc12345');
  });

  it('returns null for url when scheme is not http(s)', () => {
    const p = new URLSearchParams({ url: 'javascript:alert(1)', q: 'SELECT 1' });
    const { url } = decodeShareParams(p.toString());
    expect(url).toBeNull();
  });

  it('returns null for missing q and sf', () => {
    const p = new URLSearchParams({ url: 'https://x.com/a.parquet' });
    const { query, fingerprint } = decodeShareParams(p.toString());
    expect(query).toBeNull();
    expect(fingerprint).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test -- sharing
```

Expected: FAIL — `Cannot find module '@/util/sharing'`.

- [ ] **Step 3: Create `src/util/sharing.ts`**

```ts
import type { ColumnInfo } from '@/engine/schema';

function fnv1a32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function computeFingerprint(columns: ColumnInfo[]): string {
  const descriptor = columns.map((c) => `${c.name}:${c.type}`).join(',');
  return fnv1a32(descriptor).toString(16).padStart(8, '0');
}

export function encodeShareURL(
  parquetURL: string,
  queryText: string,
  fingerprint: string | null,
): string {
  const params = new URLSearchParams();
  params.set('url', parquetURL);
  params.set('q', queryText);
  if (fingerprint) params.set('sf', fingerprint);
  return `${window.location.origin}${window.location.pathname}#${params.toString()}`;
}

export function decodeShareParams(hash: string): {
  url: string | null;
  query: string | null;
  fingerprint: string | null;
} {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const rawUrl = params.get('url');
  const url = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : null;
  return { url, query: params.get('q'), fingerprint: params.get('sf') };
}
```

- [ ] **Step 4: Run — expect all 6 tests pass**

```bash
pnpm test -- sharing
```

Expected: 6 passed.

- [ ] **Step 5: Run full suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/util/sharing.ts src/util/sharing.test.ts
git commit -m "feat(sharing): URL encode/decode + schema fingerprint utility"
```

---

## Milestone 2: State Extensions

### Task 2: Extend `queryState.ts`

**Files:**

- Modify: `src/state/queryState.ts`
- Modify: `src/state/queryState.test.ts`

Two new fields (`sharedFingerprint`, `schemaDrift`) and three new actions. Neither field is in `partialize` — they reset on every page load (correct: they're derived from the incoming URL, not persisted user state). `SET_URL` resets both to ensure stale drift state doesn't carry over when the user changes the file.

- [ ] **Step 1: Write failing tests**

Append this describe block to `src/state/queryState.test.ts` (add after the existing `describe` block):

```ts
describe('queryReducer — sharing actions', () => {
  it('SET_SHARED_FINGERPRINT stores the fingerprint', () => {
    const next = queryReducer(initialState, {
      type: 'SET_SHARED_FINGERPRINT',
      fingerprint: 'abc12345',
    });
    expect(next.sharedFingerprint).toBe('abc12345');
    expect(next.schemaDrift).toBe(false);
  });

  it('SCHEMA_DRIFT_DETECTED sets schemaDrift to true', () => {
    const next = queryReducer(initialState, { type: 'SCHEMA_DRIFT_DETECTED' });
    expect(next.schemaDrift).toBe(true);
  });

  it('DISMISS_DRIFT sets schemaDrift to false', () => {
    const withDrift = queryReducer(initialState, { type: 'SCHEMA_DRIFT_DETECTED' });
    const dismissed = queryReducer(withDrift, { type: 'DISMISS_DRIFT' });
    expect(dismissed.schemaDrift).toBe(false);
  });

  it('SET_URL resets sharedFingerprint and schemaDrift', () => {
    const withShare = queryReducer(initialState, {
      type: 'SET_SHARED_FINGERPRINT',
      fingerprint: 'abc12345',
    });
    const withDrift = queryReducer(withShare, { type: 'SCHEMA_DRIFT_DETECTED' });
    const after = queryReducer(withDrift, {
      type: 'SET_URL',
      url: 'https://new.example.com/b.parquet',
    });
    expect(after.sharedFingerprint).toBeNull();
    expect(after.schemaDrift).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test -- queryState
```

Expected: FAIL — `SET_SHARED_FINGERPRINT` not a known action type.

- [ ] **Step 3: Replace `src/state/queryState.ts`**

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
  sharedFingerprint: string | null;
  schemaDrift: boolean;
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
  | { type: 'SCHEMA_ERROR' }
  | { type: 'SET_SHARED_FINGERPRINT'; fingerprint: string }
  | { type: 'SCHEMA_DRIFT_DETECTED' }
  | { type: 'DISMISS_DRIFT' };

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
        sharedFingerprint: null,
        schemaDrift: false,
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

    case 'SET_SHARED_FINGERPRINT':
      return { ...state, sharedFingerprint: action.fingerprint };

    case 'SCHEMA_DRIFT_DETECTED':
      return { ...state, schemaDrift: true };

    case 'DISMISS_DRIFT':
      return { ...state, schemaDrift: false };

    default:
      return state;
  }
}
```

- [ ] **Step 4: Run — expect all 8 queryState tests pass**

```bash
pnpm test -- queryState
```

Expected: 8 passed (4 existing + 4 new).

- [ ] **Step 5: Run full suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/state/queryState.ts src/state/queryState.test.ts
git commit -m "feat(state): sharedFingerprint + schemaDrift fields, SET_SHARED_FINGERPRINT/SCHEMA_DRIFT_DETECTED/DISMISS_DRIFT actions"
```

---

## Milestone 3: ShareButton Component

### Task 3: `src/ui/ShareButton.tsx`

**Files:**

- Create: `src/ui/ShareButton.tsx`
- Create: `src/ui/ShareButton.test.tsx`

Props are `parquetURL`, `queryText`, `fingerprint` (the live fingerprint computed from schema), and `disabled`. The component is disabled when `parquetURL` is empty or `disabled=true`. On click it builds the share URL via `encodeShareURL`, writes it to the clipboard, and shows "Copied!" for 1.5 s. If clipboard throws it shows "Copy failed" for 1.5 s.

- [ ] **Step 1: Write failing tests**

Create `src/ui/ShareButton.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShareButton } from '@/ui/ShareButton';

function mockClipboard(impl: Partial<Clipboard>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: impl,
    configurable: true,
    writable: true,
  });
}

describe('ShareButton', () => {
  beforeEach(() => {
    mockClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
  });

  it('is disabled when parquetURL is empty', () => {
    render(<ShareButton parquetURL="" queryText="SELECT 1" fingerprint={null} disabled={false} />);
    expect(screen.getByRole('button', { name: /share/i })).toBeDisabled();
  });

  it('is disabled when disabled prop is true', () => {
    render(
      <ShareButton
        parquetURL="https://x.com/a.parquet"
        queryText="SELECT 1"
        fingerprint={null}
        disabled={true}
      />,
    );
    expect(screen.getByRole('button', { name: /share/i })).toBeDisabled();
  });

  it('calls clipboard.writeText with a URL containing the parquetURL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard({ writeText });
    render(
      <ShareButton
        parquetURL="https://x.com/a.parquet"
        queryText="SELECT 1"
        fingerprint={null}
        disabled={false}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /share/i }));
    });
    expect(writeText).toHaveBeenCalledOnce();
    const arg = writeText.mock.calls[0][0] as string;
    expect(decodeURIComponent(arg)).toContain('https://x.com/a.parquet');
  });

  it('shows "Copied!" after successful copy', async () => {
    render(
      <ShareButton
        parquetURL="https://x.com/a.parquet"
        queryText="SELECT 1"
        fingerprint={null}
        disabled={false}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /share/i }));
    });
    expect(screen.getByRole('button')).toHaveTextContent('Copied!');
  });

  it('shows "Copy failed" when clipboard throws', async () => {
    mockClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    render(
      <ShareButton
        parquetURL="https://x.com/a.parquet"
        queryText="SELECT 1"
        fingerprint={null}
        disabled={false}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /share/i }));
    });
    expect(screen.getByRole('button')).toHaveTextContent('Copy failed');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test -- ShareButton
```

Expected: FAIL — `Cannot find module '@/ui/ShareButton'`.

- [ ] **Step 3: Create `src/ui/ShareButton.tsx`**

```tsx
import { useState } from 'react';
import { encodeShareURL } from '@/util/sharing';

interface ShareButtonProps {
  parquetURL: string;
  queryText: string;
  fingerprint: string | null;
  disabled: boolean;
}

type CopyState = 'idle' | 'copied' | 'failed';

export function ShareButton({ parquetURL, queryText, fingerprint, disabled }: ShareButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const isDisabled = disabled || !parquetURL.trim();

  async function handleClick() {
    const url = encodeShareURL(parquetURL, queryText, fingerprint);
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 1500);
  }

  const label =
    copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed' : 'Share';

  return (
    <button
      onClick={() => void handleClick()}
      disabled={isDisabled}
      aria-label="Share URL"
      style={{ fontSize: '12px', padding: '3px 10px' }}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Run — expect all 5 ShareButton tests pass**

```bash
pnpm test -- ShareButton
```

Expected: 5 passed.

- [ ] **Step 5: Run full suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ShareButton.tsx src/ui/ShareButton.test.tsx
git commit -m "feat(ui): ShareButton — clipboard copy with Copied!/Copy failed feedback"
```

---

## Milestone 4: DriftBanner Component

### Task 4: `src/ui/DriftBanner.tsx`

**Files:**

- Create: `src/ui/DriftBanner.tsx`
- Create: `src/ui/DriftBanner.test.tsx`

Prop-driven — no store access. Returns `null` when `visible=false` so the parent doesn't need a conditional.

- [ ] **Step 1: Write failing tests**

Create `src/ui/DriftBanner.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DriftBanner } from '@/ui/DriftBanner';

describe('DriftBanner', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(<DriftBanner visible={false} onDismiss={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders warning text when visible is true', () => {
    render(<DriftBanner visible={true} onDismiss={vi.fn()} />);
    expect(screen.getByText(/schema has changed/i)).toBeInTheDocument();
  });

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<DriftBanner visible={true} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm test -- DriftBanner
```

Expected: FAIL — `Cannot find module '@/ui/DriftBanner'`.

- [ ] **Step 3: Create `src/ui/DriftBanner.tsx`**

```tsx
interface DriftBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

export function DriftBanner({ visible, onDismiss }: DriftBannerProps) {
  if (!visible) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        background: '#3a2e00',
        borderTop: '1px solid #6a5200',
        fontSize: '12px',
        color: '#f0c040',
      }}
    >
      <span style={{ flex: 1 }}>
        ⚠ Schema has changed since this link was created — some columns may differ.
      </span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss drift warning"
        style={{ fontSize: '12px', padding: '2px 8px', flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect all 3 DriftBanner tests pass**

```bash
pnpm test -- DriftBanner
```

Expected: 3 passed.

- [ ] **Step 5: Run full suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/DriftBanner.tsx src/ui/DriftBanner.test.tsx
git commit -m "feat(ui): DriftBanner — dismissible schema-drift warning"
```

---

## Milestone 5: App.tsx Wiring

### Task 5: Modify `src/App.tsx`

**Files:**

- Modify: `src/App.tsx`

Three changes: (1) `handleProbe` extended to accept `urlOverride?` and `storedFingerprint?` parameters so auto-probe can pass the URL and fingerprint directly without waiting for state re-render; (2) mount-only `useEffect` that replaces the old hash-reading effect, dispatching `SET_URL/SET_QUERY/SET_SHARED_FINGERPRINT` then firing `handleProbe` automatically; (3) `ShareButton` row + `DriftBanner` added to the layout, with `liveFingerprint` computed inline from `schema`.

No new tests at this step — unit tests cover the components, E2E covers the wiring.

- [ ] **Step 1: Replace `src/App.tsx`**

```tsx
import { useCallback, useRef, useEffect } from 'react';
import { useQueryStore } from '@/state/store';
import { getEngine, getTransport, shutdownEngine, loadSchema } from '@/state/queryService';
import { AppError, TransportError, QueryError, QueryCancelledError } from '@/errors';
import { logger } from '@/util/logger';
import { decodeShareParams, computeFingerprint } from '@/util/sharing';
import { URLInput } from '@/ui/URLInput';
import { SQLEditor } from '@/ui/SQLEditor';
import { ResultsTable } from '@/ui/ResultsTable';
import { StatusBar } from '@/ui/StatusBar';
import { ErrorPanel } from '@/ui/ErrorPanel';
import { SchemaTree } from '@/ui/SchemaTree';
import { ShareButton } from '@/ui/ShareButton';
import { DriftBanner } from '@/ui/DriftBanner';
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
  const sharedFingerprint = useQueryStore((s) => s.sharedFingerprint);
  const schemaDrift = useQueryStore((s) => s.schemaDrift);
  const dispatch = useQueryStore((s) => s.dispatch);

  const cancelRef = useRef<(() => void) | null>(null);
  const probeAbortRef = useRef<AbortController | null>(null);
  const activeHandleRef = useRef<QueryHandle | null>(null);

  useEffect(() => () => shutdownEngine(), []);

  // urlOverride: used by mount auto-probe to bypass stale parquetURL closure.
  // storedFingerprint: undefined → use sharedFingerprint from closure; explicit value (even null) → use that.
  const handleProbe = useCallback(
    async (urlOverride?: string, storedFingerprint?: string | null) => {
      const targetURL = urlOverride ?? parquetURL;
      const fingerprintToCheck =
        storedFingerprint !== undefined ? storedFingerprint : sharedFingerprint;

      probeAbortRef.current?.abort();
      const controller = new AbortController();
      probeAbortRef.current = controller;
      dispatch({ type: 'PROBE_START' });
      try {
        await getTransport().probeURL(targetURL, controller.signal);
        dispatch({ type: 'PROBE_DONE' });
        dispatch({ type: 'SCHEMA_START' });
        loadSchema(targetURL)
          .then((columns) => {
            dispatch({ type: 'SCHEMA_DONE', columns });
            if (fingerprintToCheck) {
              const live = computeFingerprint(columns);
              if (live !== fingerprintToCheck) dispatch({ type: 'SCHEMA_DRIFT_DETECTED' });
            }
          })
          .catch((err) => {
            logger.warn('Schema fetch failed', err);
            dispatch({ type: 'SCHEMA_ERROR' });
          });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        dispatch({
          type: 'ERROR',
          error: err instanceof AppError ? err : new TransportError(String(err)),
        });
      } finally {
        probeAbortRef.current = null;
      }
    },
    [parquetURL, sharedFingerprint, dispatch],
  );

  // Auto-load from shared URL hash on mount — runs once, handleProbe intentionally excluded
  // from deps to prevent re-running on every re-render.
  useEffect(() => {
    const { url, query, fingerprint } = decodeShareParams(window.location.hash);
    if (!url) return;
    dispatch({ type: 'SET_URL', url });
    if (query) dispatch({ type: 'SET_QUERY', sql: query });
    if (fingerprint) dispatch({ type: 'SET_SHARED_FINGERPRINT', fingerprint });
    void handleProbe(url, fingerprint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update parquet_scan URL in-place when parquetURL changes — preserves user edits.
  // Escape single quotes so URLs like "it's.parquet" produce valid SQL.
  useEffect(() => {
    if (!parquetURL) return;
    const safe = parquetURL.replace(/'/g, "''");
    const next = queryText
      .replace('__URL__', safe)
      .replace(/parquet_scan\('[^']*'\)/g, () => `parquet_scan('${safe}')`);
    if (next !== queryText) dispatch({ type: 'SET_QUERY', sql: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parquetURL]);

  const handleRun = useCallback(async () => {
    activeHandleRef.current?.cancel();
    activeHandleRef.current = null;
    dispatch({ type: 'QUERY_START' });
    try {
      const handle = await getEngine().runQuery(queryText);
      activeHandleRef.current = handle;
      cancelRef.current = () => handle.cancel();
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
      activeHandleRef.current = null;
      cancelRef.current = null;
    }
  }, [queryText, dispatch]);

  const handleCancel = useCallback(() => {
    probeAbortRef.current?.abort();
    activeHandleRef.current?.cancel();
    activeHandleRef.current = null;
    cancelRef.current = null;
    dispatch({ type: 'CANCEL' });
  }, [dispatch]);

  const isExecuting = status === 'executing' || status === 'probing';
  const liveFingerprint = schema ? computeFingerprint(schema) : null;

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
        onProbe={() => void handleProbe()}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 4px' }}>
        <ShareButton
          parquetURL={parquetURL}
          queryText={queryText}
          fingerprint={liveFingerprint}
          disabled={isExecuting || !parquetURL.trim()}
        />
      </div>
      <DriftBanner visible={schemaDrift} onDismiss={() => dispatch({ type: 'DISMISS_DRIFT' })} />
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

- [ ] **Step 2: Typecheck + full test suite**

```bash
pnpm typecheck && pnpm test
```

Expected: all tests pass, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(sharing): wire ShareButton + DriftBanner into App, auto-probe on shared URL"
```

---

## Milestone 6: E2E Tests

### Task 6: `tests/e2e/phase4.spec.ts`

**Files:**

- Create: `tests/e2e/phase4.spec.ts`

Three tests: share button reachability, auto-probe from hash URL, drift banner from mismatched fingerprint. The hash-URL tests don't depend on clipboard — they build the URL directly so Playwright doesn't need clipboard permission.

- [ ] **Step 1: Create `tests/e2e/phase4.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet';

test.describe('Phase 4 — URL sharing', () => {
  test('share button is visible and enabled after URL is entered', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    const shareBtn = page.getByRole('button', { name: /share/i });
    await expect(shareBtn).toBeVisible();
    await expect(shareBtn).toBeEnabled();
  });

  test('navigating to a shared URL auto-probes and shows schema tree', async ({ page }) => {
    const sql = `SELECT *\nFROM parquet_scan('${FIXTURE_URL}')\nLIMIT 100`;
    const hash = new URLSearchParams({ url: FIXTURE_URL, q: sql }).toString();
    await page.goto(`/#${hash}`);
    // URL input must be populated immediately from hash
    await expect(page.getByLabel('Parquet file URL')).toHaveValue(FIXTURE_URL);
    // Auto-probe fires; schema tree should appear without the user clicking Load
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30000 });
  });

  test('drift banner appears when sf param does not match live schema', async ({ page }) => {
    // 'ffffffff' is a deliberate wrong fingerprint — actual tiny.parquet fingerprint will differ
    const hash = new URLSearchParams({ url: FIXTURE_URL, sf: 'ffffffff' }).toString();
    await page.goto(`/#${hash}`);
    // Auto-probe + schema load → drift detected
    await expect(page.getByText(/schema has changed/i)).toBeVisible({ timeout: 30000 });
  });
});
```

- [ ] **Step 2: Run E2E on Chromium**

```bash
pnpm exec playwright test tests/e2e/phase4.spec.ts --project=chromium
```

Expected: 3 passed (DuckDB initialises ~5–15 s on first run; tests use 30 s timeout).

- [ ] **Step 3: Run full unit + E2E suite**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm exec playwright test --project=chromium
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/phase4.spec.ts
git commit -m "test(e2e): Phase 4 sharing — share button, auto-probe from hash URL, drift banner"
```

---

## Milestone 7: Final Verification + Tag

### Task 7: Tag `phase4-complete`

- [ ] **Step 1: Confirm clean tree on main**

```bash
git status
git log --oneline -8
```

Expected: clean tree, phase4 commits visible.

- [ ] **Step 2: Full verification**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm exec playwright test --project=chromium
```

Expected: all pass.

- [ ] **Step 3: Tag**

```bash
git tag phase4-complete
git log --oneline -8
```

---

## Self-Review

### Spec Coverage

| Requirement                              | Task                                           |
| ---------------------------------------- | ---------------------------------------------- |
| Hash-based URL encoding (`#url=&q=&sf=`) | Task 1 (`encodeShareURL`, `decodeShareParams`) |
| Share button with clipboard copy         | Task 3 (`ShareButton`)                         |
| "Copied!" / "Copy failed" feedback       | Task 3                                         |
| Auto-probe on load from hash URL         | Task 5 (mount `useEffect`)                     |
| SQL query restored from `q` param        | Task 5                                         |
| Schema fingerprint computation           | Task 1 (`computeFingerprint`)                  |
| `sharedFingerprint` stored in state      | Task 2 (`SET_SHARED_FINGERPRINT`)              |
| Drift detection after schema loads       | Task 5 (`handleProbe` drift check)             |
| Dismissible drift warning banner         | Task 4 (`DriftBanner`)                         |
| E2E: auto-probe round-trip               | Task 6                                         |
| E2E: drift banner                        | Task 6                                         |

### Placeholder Scan

No TBDs. Every step has actual code. `fnv1a32` in `sharing.ts` is self-contained — no extraction from `opfs.ts` needed (opfs.ts uses `fnv1a64hex`, a different function).

### Type Consistency

- `ColumnInfo` from `@/engine/schema` — used in `computeFingerprint`, `SCHEMA_DONE`, `SchemaTree` — consistent throughout.
- `sharedFingerprint: string | null` — defined in `QueryState`, set by `SET_SHARED_FINGERPRINT { fingerprint: string }`, read in `handleProbe` closure and `App.tsx` selector.
- `storedFingerprint?: string | null` in `handleProbe` — `undefined` means "use closure value", explicit `null` means "no fingerprint". The ternary `storedFingerprint !== undefined ? storedFingerprint : sharedFingerprint` correctly distinguishes.
- `ShareButton` props: `fingerprint: string | null` ← `liveFingerprint = schema ? computeFingerprint(schema) : null` ← `computeFingerprint` returns `string`. Types align.
- `DriftBanner` props: `visible: boolean` ← `schemaDrift: boolean` from store. Types align.
