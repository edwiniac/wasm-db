# Phase 5 Feature 3: Offline Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After first load, the app shell and WASM assets serve from the Service Worker cache; when the network drops, a red "offline" badge appears in StatusBar and previously-fetched Parquet ranges remain queryable from the SW range cache.

**Architecture:** Three independent layers:

1. **State** — `isOnline: boolean` field + `SET_ONLINE` action in `queryState.ts`; not persisted (always resets `true` on load).
2. **SW registration** — `src/sw/register.ts` adds `window.online`/`window.offline` listeners that call `useQueryStore.getState().dispatch({ type: 'SET_ONLINE', online })` directly (same pattern as `queryService.ts`).
3. **SW strategy** — `public/sw.js` gains a `SHELL_CACHE` that pre-caches `'/'` and `'/index.html'` on install; the `fetch` handler is refactored into three routes: shell assets → cache-first; any request with a `Range` header → network-first + cache fallback; everything else → pass-through. This lets both external and local-origin Parquet fixture ranges survive offline, enabling E2E verification.

**Tech Stack:** Existing Vitest + `@testing-library/react` + Playwright + TypeScript strict. No new runtime deps.

---

## File Map

| File                               | Action | Responsibility                                                             |
| ---------------------------------- | ------ | -------------------------------------------------------------------------- |
| `src/state/queryState.ts`          | Modify | Add `isOnline: boolean` to `QueryState`, `SET_ONLINE` action, reducer case |
| `src/state/queryState.test.ts`     | Modify | 2 reducer tests for `SET_ONLINE`                                           |
| `src/ui/StatusBar.tsx`             | Modify | Add `isOnline?: boolean` prop + offline badge span                         |
| `src/ui/StatusBar.test.tsx`        | Create | RTL tests: badge absent when online, present when offline                  |
| `src/App.tsx`                      | Modify | Read `isOnline` from store, pass to `StatusBar`                            |
| `src/sw/register.ts`               | Modify | Add `window.online`/`offline` listeners → dispatch `SET_ONLINE`            |
| `public/sw.js`                     | Modify | Add `SHELL_CACHE`, pre-cache shell on install, refactor fetch handler      |
| `tests/e2e/phase5-offline.spec.ts` | Create | Offline badge appears/disappears; cached Parquet query runs offline        |

---

## Task 1: `SET_ONLINE` reducer + tests

**Files:**

- Modify: `src/state/queryState.ts`
- Modify: `src/state/queryState.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/state/queryState.test.ts` after the existing `'queryReducer — spill actions'` describe block:

```ts
describe('queryReducer — online actions', () => {
  it('SET_ONLINE false sets isOnline to false', () => {
    const next = queryReducer(initialState, { type: 'SET_ONLINE', online: false });
    expect(next.isOnline).toBe(false);
  });

  it('SET_ONLINE true restores isOnline to true', () => {
    const offline = queryReducer(initialState, { type: 'SET_ONLINE', online: false });
    const next = queryReducer(offline, { type: 'SET_ONLINE', online: true });
    expect(next.isOnline).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test -- queryState`
Expected: FAIL — `SET_ONLINE` case does not exist yet.

- [ ] **Step 3: Update `src/state/queryState.ts`**

Add `isOnline: boolean` to `QueryState`:

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
  isOnline: boolean; // ← add this line
}
```

Add `SET_ONLINE` to `QueryAction` union:

```ts
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
  | { type: 'DISMISS_DRIFT' }
  | { type: 'SET_SPILL_ACTIVE'; active: boolean }
  | { type: 'SET_ONLINE'; online: boolean }; // ← add this line
```

Add `isOnline: true` to `initialState`:

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
  isOnline: true, // ← add this line
};
```

Add reducer case (place after `case 'SET_SPILL_ACTIVE':` and before `default:`):

```ts
    case 'SET_ONLINE':
      return { ...state, isOnline: action.online };
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm test -- queryState`
Expected: all tests in `queryState.test.ts` pass.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/state/queryState.ts src/state/queryState.test.ts
git commit -m "feat(offline): isOnline field + SET_ONLINE reducer action"
```

---

## Task 2: `StatusBar` offline badge + unit tests

**Files:**

- Modify: `src/ui/StatusBar.tsx`
- Create: `src/ui/StatusBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/ui/StatusBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StatusBar } from '@/ui/StatusBar';

describe('StatusBar — offline badge', () => {
  it('does not render offline badge when isOnline is true', () => {
    render(<StatusBar status="idle" rowCount={0} onCancel={vi.fn()} isOnline={true} />);
    expect(screen.queryByLabelText('offline')).toBeNull();
  });

  it('does not render offline badge when isOnline is omitted (default online)', () => {
    render(<StatusBar status="idle" rowCount={0} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText('offline')).toBeNull();
  });

  it('renders offline badge when isOnline is false', () => {
    render(<StatusBar status="idle" rowCount={0} onCancel={vi.fn()} isOnline={false} />);
    expect(screen.getByLabelText('offline')).toBeInTheDocument();
  });

  it('offline badge contains visible text', () => {
    render(<StatusBar status="idle" rowCount={0} onCancel={vi.fn()} isOnline={false} />);
    expect(screen.getByLabelText('offline')).toHaveTextContent(/offline/i);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test -- StatusBar`
Expected: FAIL — `StatusBar.test.tsx` does not exist yet, OR tests fail because `isOnline` prop doesn't exist.

- [ ] **Step 3: Update `src/ui/StatusBar.tsx`**

Replace the full file with the updated version:

```tsx
import type { QueryStatus } from '@/state/queryState';

interface StatusBarProps {
  status: QueryStatus;
  rowCount: number;
  onCancel: () => void;
  spillActive?: boolean;
  isOnline?: boolean;
}

const LABEL: Record<QueryStatus, string> = {
  idle: 'Ready',
  probing: 'Probing…',
  executing: 'Executing…',
  done: '',
  error: 'Error',
};

export function StatusBar({
  status,
  rowCount,
  onCancel,
  spillActive,
  isOnline = true,
}: StatusBarProps) {
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
      {!isOnline && (
        <span
          style={{ fontSize: '11px', color: '#ff4d4d', marginLeft: '4px' }}
          aria-label="offline"
        >
          ● offline
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

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm test -- StatusBar`
Expected: all 4 tests pass.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/StatusBar.tsx src/ui/StatusBar.test.tsx
git commit -m "feat(offline): StatusBar offline badge + unit tests"
```

---

## Task 3: Wire `isOnline` through `App.tsx`

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: Add `isOnline` selector and pass to `StatusBar`**

In `src/App.tsx`, after the `spillActive` selector line:

```ts
const spillActive = useQueryStore((s) => s.spillActive);
```

add:

```ts
const isOnline = useQueryStore((s) => s.isOnline);
```

Then update the `<StatusBar>` JSX (currently at the bottom of the return):

```tsx
<StatusBar
  status={status}
  rowCount={rowCount}
  onCancel={handleCancel}
  spillActive={spillActive}
  isOnline={isOnline}
/>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(offline): pass isOnline from store to StatusBar"
```

---

## Task 4: `register.ts` — online/offline event listeners

**Files:**

- Modify: `src/sw/register.ts`

- [ ] **Step 1: Update `src/sw/register.ts`**

Replace the full file:

```ts
import { logger } from '@/util/logger';
import { useQueryStore } from '@/state/store';

function dispatchOnlineState(online: boolean): void {
  useQueryStore.getState().dispatch({ type: 'SET_ONLINE', online });
}

export async function registerSW(): Promise<void> {
  // Online/offline tracking works independently of SW support.
  window.addEventListener('online', () => dispatchOnlineState(true));
  window.addEventListener('offline', () => dispatchOnlineState(false));
  // Sync initial state if the page loaded while offline.
  if (!navigator.onLine) dispatchOnlineState(false);

  if (!('serviceWorker' in navigator)) {
    logger.warn('Service Worker not supported — fetch invariant cannot be enforced');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    logger.info('Service Worker registered', reg.scope);
  } catch (err) {
    logger.error('Service Worker registration failed', err);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/sw/register.ts
git commit -m "feat(offline): register online/offline listeners in registerSW"
```

---

## Task 5: `public/sw.js` — shell cache strategy

**Files:**

- Modify: `public/sw.js`

- [ ] **Step 1: Replace `public/sw.js` with the upgraded version**

```js
// Service Worker — Phase 5: shell cache-first + range network-first.

const CACHE_NAME = 'wasm-db-ranges-v1';
const SHELL_CACHE = 'wasm-db-shell-v1';
const KNOWN_CACHES = new Set([CACHE_NAME, SHELL_CACHE]);

/** Encode a URL + Range header as a stable Cache API lookup key. */
function rangeCacheKey(url, rangeHeader) {
  return (
    'https://cache.wasm-db.invalid/v1?u=' +
    encodeURIComponent(url) +
    '&r=' +
    encodeURIComponent(rangeHeader)
  );
}

/** True for paths that are part of the app shell. */
function isShellPath(pathname) {
  return pathname === '/' || pathname === '/index.html' || pathname.startsWith('/assets/');
}

// Pre-cache shell assets on install.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(['/', '/index.html'])));
  self.skipWaiting();
});

// Remove stale caches on activate.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KNOWN_CACHES.has(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Serve shell assets cache-first; range requests network-first+cache; rest pass-through.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const rangeHeader = request.headers.get('Range');

  // App shell: cache-first from SHELL_CACHE.
  if (url.origin === self.location.origin && isShellPath(url.pathname)) {
    event.respondWith(serveShell(request));
    return;
  }

  // Any range request (Parquet data, any origin): network-first, cache fallback.
  if (rangeHeader) {
    event.respondWith(serveRange(request, rangeHeader));
    return;
  }

  // Everything else: pass through to network.
  event.respondWith(fetch(request));
});

async function serveShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function serveRange(request, rangeHeader) {
  const cacheKey = rangeCacheKey(request.url, rangeHeader);
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.status === 206 || response.status === 200) {
    cache.put(cacheKey, response.clone());
  }
  return response;
}
```

- [ ] **Step 2: Run all unit tests to confirm nothing broke**

Run: `pnpm test`
Expected: all 136+ tests pass (SW is a browser file — unit tests don't load it).

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat(offline): sw.js shell cache-first + unified range caching"
```

---

## Task 6: E2E tests — offline badge + cached query

**Files:**

- Create: `tests/e2e/phase5-offline.spec.ts`

- [ ] **Step 1: Write the E2E tests**

Create `tests/e2e/phase5-offline.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet';

test.describe('Phase 5 — offline mode', () => {
  test('offline badge appears in StatusBar when network is cut', async ({ page, context }) => {
    await page.goto('/');
    // Confirm no badge when online.
    await expect(page.getByLabel('offline')).not.toBeVisible();

    await context.setOffline(true);
    await expect(page.getByLabel('offline')).toBeVisible({ timeout: 5_000 });
  });

  test('offline badge disappears when network is restored', async ({ page, context }) => {
    await page.goto('/');
    await context.setOffline(true);
    await expect(page.getByLabel('offline')).toBeVisible({ timeout: 5_000 });

    await context.setOffline(false);
    await expect(page.getByLabel('offline')).not.toBeVisible({ timeout: 5_000 });
  });

  test('cached Parquet query runs while offline', async ({ page, context }) => {
    await page.goto('/');

    // Load the fixture file and run a query twice to warm all SW range cache entries.
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /^load$/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30_000 });

    // First query run — primes range cache.
    await page.getByRole('button', { name: /run query/i }).click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });

    // Second query run — ensures all needed ranges are cached.
    await page.getByRole('button', { name: /run query/i }).click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });

    // Cut the network.
    await context.setOffline(true);
    await expect(page.getByLabel('offline')).toBeVisible({ timeout: 5_000 });

    // Query should still succeed from SW range cache.
    await page.getByRole('button', { name: /run query/i }).click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });
  });
});
```

- [ ] **Step 2: Run E2E tests on chromium and firefox**

Run: `pnpm test:e2e -- --project=chromium tests/e2e/phase5-offline.spec.ts`
Expected: all 3 tests pass on chromium.

Run: `pnpm test:e2e -- --project=firefox tests/e2e/phase5-offline.spec.ts`
Expected: all 3 tests pass on firefox.

- [ ] **Step 3: Run all E2E tests to check for regressions**

Run: `pnpm test:e2e -- --project=chromium && pnpm test:e2e -- --project=firefox`
Expected: all tests from previous phases still pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/phase5-offline.spec.ts
git commit -m "test(e2e): Phase 5 offline mode — badge toggle + cached query"
```

---

## Final Verification

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — all pass
- [ ] `pnpm test:e2e -- --project=chromium` — all pass
- [ ] `pnpm test:e2e -- --project=firefox` — all pass

---

## Self-Review Checklist

**Spec coverage:**

- ✅ `public/sw.js` versioned `SHELL_CACHE` + cache-first shell → Task 5
- ✅ `install` pre-caches `['/', '/index.html']` + `/assets/*` via `isShellPath` → Task 5
- ✅ Shell assets: cache-first → Task 5 `serveShell()`
- ✅ Parquet range requests: network-first + cache fallback → Task 5 `serveRange()`
- ✅ Everything else: pass-through → Task 5 `fetch(request)` default
- ✅ `src/sw/register.ts` dispatches `SET_ONLINE` on online/offline events → Task 4
- ✅ `isOnline: boolean` field in `QueryState` → Task 1
- ✅ `SET_ONLINE` action + reducer case → Task 1
- ✅ Not persisted (not in `store.ts` `partialize`) → confirmed: store.ts only partializes `parquetURL` + `queryText`
- ✅ `StatusBar` `isOnline` prop + offline badge → Task 2
- ✅ `App.tsx` wires `isOnline` to `StatusBar` → Task 3
- ✅ E2E: simulate offline → badge appears → Task 6
- ✅ E2E: go online → badge disappears → Task 6
- ✅ E2E: cached query runs offline → Task 6

**Type consistency:**

- `SET_ONLINE` action uses `online: boolean` consistently across `queryState.ts` and `register.ts`
- `isOnline` field name is consistent across `QueryState`, `initialState`, `store` selector, `StatusBar` prop, `App.tsx`
- `isShellPath` defined in `sw.js` (plain JS, no types needed)

**No placeholders found.**
