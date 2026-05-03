# UI Overhaul Iteration 4 — Editor & Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Format SQL (sql-formatter + Ctrl+Shift+F), persistent query history (Zustand + sidebar panel), and a full keyboard shortcut system (Ctrl+L, Escape, ?, cheatsheet overlay) to the wasm-db editor.

**Architecture:** A new `src/util/formatSql.ts` wraps `sql-formatter`; a new `src/state/historyStore.ts` (Zustand `persist`, key `wasm-db-history`) holds up to 50 deduplicated history entries; `SQLEditor` gains an `onFormat` prop wired to a `Ctrl-Shift-f` keymap entry; `Topbar` accepts a forwarded `inputRef` for `Ctrl+L` focus; `Sidebar` gains a `<QueryHistory>` section; `App.tsx` wires all global keydown listeners and calls `addEntry` after each successful query. No new deps beyond `sql-formatter`; `nanoid` is absent from `package.json` so `crypto.randomUUID()` is used instead.

**Tech Stack:** React 18, TypeScript strict, Zustand persist, sql-formatter, CSS custom properties, Vitest + @testing-library/react, pnpm.

---

## File Map

| File                               | Action | Responsibility                                                                      |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `src/util/formatSql.ts`            | Create | `formatSql(sql)` — sql-formatter wrapper                                            |
| `src/util/formatSql.test.ts`       | Create | Keywords uppercased, indentation applied, invalid SQL passes through                |
| `src/util/relativeTime.ts`         | Create | `relativeTime(timestamp)` — human-readable age                                      |
| `src/util/relativeTime.test.ts`    | Create | just now / N min ago / yesterday / date string                                      |
| `src/state/historyStore.ts`        | Create | Zustand history store with persist, addEntry, clearHistory                          |
| `src/state/historyStore.test.ts`   | Create | addEntry, dedup, 50-entry cap, clearHistory                                         |
| `src/ui/QueryHistory.tsx`          | Create | Sidebar history panel with onSelect callback                                        |
| `src/ui/QueryHistory.test.tsx`     | Create | Renders entries, click fires onSelect, Clear calls clearHistory                     |
| `src/ui/ShortcutsOverlay.tsx`      | Create | `?` key cheatsheet overlay (fixed, dismisses on Escape/outside-click)               |
| `src/ui/ShortcutsOverlay.test.tsx` | Create | open/close behaviour, Escape calls onClose                                          |
| `src/ui/SQLEditor.tsx`             | Modify | `onFormat?: () => void` prop + `Ctrl-Shift-f` keymap entry                          |
| `src/ui/Topbar.tsx`                | Modify | `inputRef?: React.Ref<HTMLInputElement>` prop forwarded to URL input                |
| `src/ui/Sidebar.tsx`               | Modify | Add `onSelect` prop + render `<QueryHistory>` section below FilePanel               |
| `src/App.tsx`                      | Modify | `handleFormatSql`; `addEntry` after run; `Ctrl+L`/`Escape`/`?` listeners; pass refs |

---

## Task 1: Install sql-formatter + `src/util/formatSql.ts`

**Files:**

- `package.json` (modified by pnpm)
- Create: `src/util/formatSql.ts`
- Create: `src/util/formatSql.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/util/formatSql.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatSql } from './formatSql';

describe('formatSql', () => {
  it('uppercases SQL keywords', () => {
    const result = formatSql('select id from t');
    expect(result).toMatch(/SELECT/);
    expect(result).toMatch(/FROM/);
  });

  it('applies indentation (2-space tab width)', () => {
    const result = formatSql('select id, name from t where id = 1');
    // Each selected column on its own line with leading spaces
    expect(result).toMatch(/\n/);
  });

  it('does not throw on invalid / partial SQL', () => {
    expect(() => formatSql('SELECT ??? FROM')).not.toThrow();
  });

  it('returns a non-empty string for non-empty input', () => {
    expect(formatSql("SELECT * FROM parquet_scan('x.parquet')").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests — they must fail (RED)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- formatSql 2>&1 | tail -20
```

Expected: `Cannot find module './formatSql'` or similar import error.

- [ ] **Step 3: Install `sql-formatter`**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm add sql-formatter 2>&1 | tail -10
```

Expected: `+ sql-formatter@X.X.X` in output, no errors.

- [ ] **Step 4: Create `src/util/formatSql.ts`**

```ts
import { format } from 'sql-formatter';

export function formatSql(sql: string): string {
  return format(sql, {
    language: 'sql',
    tabWidth: 2,
    keywordCase: 'upper',
    linesBetweenQueries: 1,
  });
}
```

- [ ] **Step 5: Run tests — must pass (GREEN)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- formatSql 2>&1 | tail -10
```

Expected: `4 passed`.

- [ ] **Step 6: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add package.json pnpm-lock.yaml src/util/formatSql.ts src/util/formatSql.test.ts && git commit -m "feat(util): formatSql wrapper around sql-formatter"
```

---

## Task 2: `src/util/relativeTime.ts`

**Files:**

- Create: `src/util/relativeTime.ts`
- Create: `src/util/relativeTime.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/util/relativeTime.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { relativeTime } from './relativeTime';

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps < 60 seconds ago', () => {
    const now = Date.now();
    vi.setSystemTime(now + 30_000);
    expect(relativeTime(now)).toBe('just now');
  });

  it('returns "N min ago" for timestamps 1–59 minutes ago', () => {
    const now = Date.now();
    vi.setSystemTime(now + 5 * 60_000);
    expect(relativeTime(now)).toBe('5 min ago');
  });

  it('returns "N hours ago" for timestamps 1–23 hours ago', () => {
    const now = Date.now();
    vi.setSystemTime(now + 3 * 60 * 60_000);
    expect(relativeTime(now)).toBe('3 hours ago');
  });

  it('returns "yesterday" for timestamps 24–47 hours ago', () => {
    const now = Date.now();
    vi.setSystemTime(now + 25 * 60 * 60_000);
    expect(relativeTime(now)).toBe('yesterday');
  });

  it('returns a locale date string for timestamps >= 48 hours ago', () => {
    const past = new Date('2024-01-01T00:00:00Z').getTime();
    vi.setSystemTime(new Date('2024-01-10T00:00:00Z').getTime());
    const result = relativeTime(past);
    // Should be a date string, not one of the relative labels
    expect(result).not.toBe('just now');
    expect(result).not.toMatch(/ago/);
    expect(result).not.toBe('yesterday');
    expect(result.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests — they must fail (RED)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- relativeTime 2>&1 | tail -10
```

Expected: import error (file does not exist yet).

- [ ] **Step 3: Create `src/util/relativeTime.ts`**

```ts
export function relativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffHours < 48) return 'yesterday';
  return new Date(timestamp).toLocaleDateString();
}
```

- [ ] **Step 4: Run tests — must pass (GREEN)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- relativeTime 2>&1 | tail -10
```

Expected: `5 passed`.

- [ ] **Step 5: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/util/relativeTime.ts src/util/relativeTime.test.ts && git commit -m "feat(util): relativeTime — human-readable timestamp age"
```

---

## Task 3: `src/state/historyStore.ts`

**Files:**

- Create: `src/state/historyStore.ts`
- Create: `src/state/historyStore.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/state/historyStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('useHistoryStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('starts with an empty entries list', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it('addEntry inserts a new entry at the front', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    useHistoryStore.getState().addEntry('SELECT 1', 1);
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].sql).toBe('SELECT 1');
    expect(entries[0].rowCount).toBe(1);
    expect(typeof entries[0].id).toBe('string');
    expect(entries[0].id.length).toBeGreaterThan(0);
    expect(typeof entries[0].timestamp).toBe('number');
  });

  it('does not add a duplicate consecutive entry (same trimmed SQL)', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    useHistoryStore.getState().addEntry('SELECT 1', 1);
    useHistoryStore.getState().addEntry('SELECT 1', 1);
    expect(useHistoryStore.getState().entries).toHaveLength(1);
  });

  it('does add the same SQL if it is not consecutive', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    useHistoryStore.getState().addEntry('SELECT 1', 1);
    useHistoryStore.getState().addEntry('SELECT 2', 2);
    useHistoryStore.getState().addEntry('SELECT 1', 1);
    expect(useHistoryStore.getState().entries).toHaveLength(3);
  });

  it('caps entries at 50, dropping the oldest', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    for (let i = 0; i < 55; i++) {
      useHistoryStore.getState().addEntry(`SELECT ${i}`, i);
    }
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(50);
    // Most recent (SELECT 54) is at front
    expect(entries[0].sql).toBe('SELECT 54');
  });

  it('clearHistory empties the list', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    useHistoryStore.getState().addEntry('SELECT 1', 1);
    useHistoryStore.getState().clearHistory();
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it('persists entries to localStorage under wasm-db-history', async () => {
    const { useHistoryStore } = await import('@/state/historyStore');
    useHistoryStore.getState().addEntry('SELECT persisted', 42);
    const stored = JSON.parse(localStorage.getItem('wasm-db-history') ?? '{}');
    expect(stored.state.entries[0].sql).toBe('SELECT persisted');
  });
});
```

- [ ] **Step 2: Run the tests — they must fail (RED)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- historyStore 2>&1 | tail -10
```

Expected: import error (file does not exist yet).

- [ ] **Step 3: Create `src/state/historyStore.ts`**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_ENTRIES = 50;

export interface HistoryEntry {
  id: string;
  sql: string;
  timestamp: number;
  rowCount: number;
}

interface HistoryState {
  entries: HistoryEntry[];
  addEntry: (sql: string, rowCount: number) => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      addEntry: (sql: string, rowCount: number) => {
        const trimmed = sql.trim();
        const current = get().entries;
        // Dedup: skip if most-recent entry has identical trimmed SQL
        if (current.length > 0 && current[0].sql.trim() === trimmed) return;
        const entry: HistoryEntry = {
          id: crypto.randomUUID(),
          sql: trimmed,
          timestamp: Date.now(),
          rowCount,
        };
        const next = [entry, ...current];
        // Cap at MAX_ENTRIES, dropping oldest (tail)
        set({ entries: next.slice(0, MAX_ENTRIES) });
      },
      clearHistory: () => set({ entries: [] }),
    }),
    { name: 'wasm-db-history' },
  ),
);
```

- [ ] **Step 4: Run tests — must pass (GREEN)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- historyStore 2>&1 | tail -10
```

Expected: `7 passed`.

- [ ] **Step 5: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/state/historyStore.ts src/state/historyStore.test.ts && git commit -m "feat(state): historyStore — Zustand persist, 50-entry cap, dedup"
```

---

## Task 4: `src/ui/QueryHistory.tsx`

**Files:**

- Create: `src/ui/QueryHistory.tsx`
- Create: `src/ui/QueryHistory.test.tsx`

- [ ] **Step 1: Write the failing tests first**

Create `src/ui/QueryHistory.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useHistoryStore } from '@/state/historyStore';
import { QueryHistory } from '@/ui/QueryHistory';

const seedEntry = (sql: string, rowCount = 0) => useHistoryStore.getState().addEntry(sql, rowCount);

describe('QueryHistory', () => {
  beforeEach(() => {
    useHistoryStore.setState({ entries: [] });
  });

  it('renders "HISTORY (0)" when empty', () => {
    render(<QueryHistory onSelect={vi.fn()} />);
    expect(screen.getByText(/HISTORY \(0\)/i)).toBeInTheDocument();
  });

  it('renders entry count in header', () => {
    seedEntry('SELECT 1');
    seedEntry('SELECT 2');
    render(<QueryHistory onSelect={vi.fn()} />);
    expect(screen.getByText(/HISTORY \(2\)/i)).toBeInTheDocument();
  });

  it('renders first line of SQL truncated to 60 chars', () => {
    seedEntry('SELECT id FROM t');
    render(<QueryHistory onSelect={vi.fn()} />);
    expect(screen.getByText('SELECT id FROM t')).toBeInTheDocument();
  });

  it('truncates long SQL preview to 60 chars', () => {
    const longSql = 'SELECT ' + 'a, '.repeat(30) + 'z FROM t';
    seedEntry(longSql);
    render(<QueryHistory onSelect={vi.fn()} />);
    // The preview element text should be ≤ 63 chars (60 + '...')
    const preview = screen.getByText(/\.\.\./);
    expect(preview.textContent!.length).toBeLessThanOrEqual(63);
  });

  it('calls onSelect with the full SQL when entry is clicked', () => {
    const onSelect = vi.fn();
    seedEntry('SELECT id FROM t', 5);
    render(<QueryHistory onSelect={onSelect} />);
    fireEvent.click(screen.getByText('SELECT id FROM t'));
    expect(onSelect).toHaveBeenCalledWith('SELECT id FROM t');
  });

  it('calls clearHistory when Clear is clicked (after confirm)', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    seedEntry('SELECT 1');
    render(<QueryHistory onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it('does not clear when confirm returns false', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    seedEntry('SELECT 1');
    render(<QueryHistory onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(useHistoryStore.getState().entries).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests — they must fail (RED)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- QueryHistory 2>&1 | tail -10
```

Expected: import error (file does not exist yet).

- [ ] **Step 3: Create `src/ui/QueryHistory.tsx`**

```tsx
import { useHistoryStore } from '@/state/historyStore';
import { relativeTime } from '@/util/relativeTime';

interface QueryHistoryProps {
  onSelect: (sql: string) => void;
}

const sectionLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px 4px',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: 'var(--text-faint)',
  textTransform: 'uppercase',
};

function truncatePreview(sql: string): string {
  const firstLine = sql.split('\n')[0];
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine;
}

export function QueryHistory({ onSelect }: QueryHistoryProps) {
  const entries = useHistoryStore((s) => s.entries);
  const clearHistory = useHistoryStore((s) => s.clearHistory);

  function handleClear() {
    if (window.confirm('Clear query history?')) clearHistory();
  }

  return (
    <div>
      <div style={sectionLabelStyle}>
        <span>History ({entries.length})</span>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            aria-label="Clear history"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '11px',
              padding: 0,
              textTransform: 'none',
              letterSpacing: 'normal',
            }}
          >
            Clear
          </button>
        )}
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {entries.map((entry) => (
          <li
            key={entry.id}
            onClick={() => onSelect(entry.sql)}
            style={{
              padding: '5px 12px',
              cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {truncatePreview(entry.sql)}
            </div>
            <div
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                marginTop: '2px',
              }}
            >
              {entry.rowCount} rows · {relativeTime(entry.timestamp)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — must pass (GREEN)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- QueryHistory 2>&1 | tail -10
```

Expected: `7 passed`.

- [ ] **Step 5: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/QueryHistory.tsx src/ui/QueryHistory.test.tsx && git commit -m "feat(ui): QueryHistory sidebar panel"
```

---

## Task 5: `src/ui/ShortcutsOverlay.tsx`

**Files:**

- Create: `src/ui/ShortcutsOverlay.tsx`
- Create: `src/ui/ShortcutsOverlay.test.tsx`

- [ ] **Step 1: Write the failing tests first**

Create `src/ui/ShortcutsOverlay.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShortcutsOverlay } from '@/ui/ShortcutsOverlay';

describe('ShortcutsOverlay', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<ShortcutsOverlay open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the overlay when open=true', () => {
    render(<ShortcutsOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows keyboard shortcut entries', () => {
    render(<ShortcutsOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/Ctrl\+Enter/i)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+Shift\+F/i)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+L/i)).toBeInTheDocument();
    expect(screen.getByText(/Escape/i)).toBeInTheDocument();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<ShortcutsOverlay open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<ShortcutsOverlay open={true} onClose={onClose} />);
    // Click the backdrop (the outermost element with role=dialog)
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does NOT call onClose when the card itself is clicked', () => {
    const onClose = vi.fn();
    render(<ShortcutsOverlay open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('table'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests — they must fail (RED)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- ShortcutsOverlay 2>&1 | tail -10
```

Expected: import error (file does not exist yet).

- [ ] **Step 3: Create `src/ui/ShortcutsOverlay.tsx`**

```tsx
import { useEffect } from 'react';

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { key: string; description: string }[] = [
  { key: 'Ctrl+Enter / Cmd+Enter', description: 'Run query' },
  { key: 'Ctrl+Shift+F / Cmd+Shift+F', description: 'Format SQL' },
  { key: 'Ctrl+L / Cmd+L', description: 'Focus URL input' },
  { key: 'Escape', description: 'Cancel running query' },
  { key: '?', description: 'Toggle this cheatsheet' },
];

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px 32px',
          minWidth: '360px',
        }}
      >
        <h2
          style={{
            margin: '0 0 16px',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          Keyboard Shortcuts
        </h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {SHORTCUTS.map(({ key, description }) => (
              <tr key={key}>
                <td
                  style={{
                    padding: '5px 16px 5px 0',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: 'var(--accent)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {key}
                </td>
                <td
                  style={{
                    padding: '5px 0',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p
          style={{
            margin: '16px 0 0',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          Press Escape or click outside to close
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — must pass (GREEN)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- ShortcutsOverlay 2>&1 | tail -10
```

Expected: `6 passed`.

- [ ] **Step 5: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/ShortcutsOverlay.tsx src/ui/ShortcutsOverlay.test.tsx && git commit -m "feat(ui): ShortcutsOverlay cheatsheet panel"
```

---

## Task 6: Modify `src/ui/SQLEditor.tsx` — add `onFormat` prop + `Ctrl-Shift-f` keymap

**Files:**

- Modify: `src/ui/SQLEditor.tsx`

This task adds `onFormat?: () => void` to the props interface, stores it in a ref (following the same pattern as `onRunRef`), and adds the `Ctrl-Shift-f` / `Cmd-Shift-f` entry to `runKeymap`.

- [ ] **Step 1: Update `SQLEditorProps` interface — add `onFormat`**

In `src/ui/SQLEditor.tsx`, update the `SQLEditorProps` interface from:

```ts
interface SQLEditorProps {
  value: string;
  disabled: boolean;
  onChange: (sql: string) => void;
  onRun: () => void;
}
```

to:

```ts
interface SQLEditorProps {
  value: string;
  disabled: boolean;
  onChange: (sql: string) => void;
  onRun: () => void;
  onFormat?: () => void;
}
```

- [ ] **Step 2: Destructure `onFormat` in the component signature and add `onFormatRef`**

Update the component opening from:

```ts
export const SQLEditor = forwardRef<SQLEditorHandle, SQLEditorProps>(function SQLEditor(
  { value, disabled, onChange, onRun },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartment = useRef(new Compartment());
  const onRunRef = useRef(onRun);
  const onChangeRef = useRef(onChange);

  useLayoutEffect(() => {
    onRunRef.current = onRun;
    onChangeRef.current = onChange;
  });
```

to:

```ts
export const SQLEditor = forwardRef<SQLEditorHandle, SQLEditorProps>(function SQLEditor(
  { value, disabled, onChange, onRun, onFormat },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartment = useRef(new Compartment());
  const onRunRef = useRef(onRun);
  const onChangeRef = useRef(onChange);
  const onFormatRef = useRef(onFormat);

  useLayoutEffect(() => {
    onRunRef.current = onRun;
    onChangeRef.current = onChange;
    onFormatRef.current = onFormat;
  });
```

- [ ] **Step 3: Add the `Ctrl-Shift-f` binding inside `runKeymap`**

Update the `runKeymap` constant inside the `useEffect` from:

```ts
const runKeymap = keymap.of([
  {
    key: 'Ctrl-Enter',
    mac: 'Cmd-Enter',
    run: () => {
      onRunRef.current();
      return true;
    },
  },
]);
```

to:

```ts
const runKeymap = keymap.of([
  {
    key: 'Ctrl-Enter',
    mac: 'Cmd-Enter',
    run: () => {
      onRunRef.current();
      return true;
    },
  },
  {
    key: 'Ctrl-Shift-f',
    mac: 'Cmd-Shift-f',
    run: () => {
      onFormatRef.current?.();
      return true;
    },
  },
]);
```

- [ ] **Step 4: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test 2>&1 | tail -15
```

Expected: all existing tests still pass (SQLEditor has no dedicated unit tests for the keymap — those are covered by the E2E layer; RTL tests for new components pass).

- [ ] **Step 6: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/SQLEditor.tsx && git commit -m "feat(editor): onFormat prop + Ctrl-Shift-F keymap binding"
```

---

## Task 7: Modify `src/ui/Topbar.tsx` — add `inputRef` prop

**Files:**

- Modify: `src/ui/Topbar.tsx`

`Topbar` gains an optional `inputRef?: React.Ref<HTMLInputElement>` prop that is forwarded directly to the URL `<input>` element. App.tsx will hold the ref and focus/select it on `Ctrl+L`.

- [ ] **Step 1: Add React import and update `TopbarProps`**

Update the top of `src/ui/Topbar.tsx`. The file currently has no imports (it uses React JSX transform). Add the import and update the interface from:

```ts
interface TopbarProps {
  url: string;
  isProbing: boolean;
  onUrlChange: (url: string) => void;
  onLoad: () => void;
  onShare: () => void;
  shareLabel: string;
  shareDisabled: boolean;
}
```

to:

```ts
import type React from 'react';

interface TopbarProps {
  url: string;
  isProbing: boolean;
  onUrlChange: (url: string) => void;
  onLoad: () => void;
  onShare: () => void;
  shareLabel: string;
  shareDisabled: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}
```

- [ ] **Step 2: Destructure `inputRef` in the component function**

Update the function signature from:

```ts
export function Topbar({
  url,
  isProbing,
  onUrlChange,
  onLoad,
  onShare,
  shareLabel,
  shareDisabled,
}: TopbarProps) {
```

to:

```ts
export function Topbar({
  url,
  isProbing,
  onUrlChange,
  onLoad,
  onShare,
  shareLabel,
  shareDisabled,
  inputRef,
}: TopbarProps) {
```

- [ ] **Step 3: Forward `inputRef` to the URL input element**

Update the URL `<input>` element from:

```tsx
<input
  type="url"
  value={url}
  onChange={(e) => onUrlChange(e.target.value)}
  placeholder="https://example.com/data.parquet"
  disabled={isProbing}
  aria-label="Parquet file URL"
  style={{
    flex: 1,
    fontFamily: 'monospace',
    fontSize: '12px',
    padding: '5px 10px',
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    outline: 'none',
  }}
/>
```

to:

```tsx
<input
  ref={inputRef}
  type="url"
  value={url}
  onChange={(e) => onUrlChange(e.target.value)}
  placeholder="https://example.com/data.parquet"
  disabled={isProbing}
  aria-label="Parquet file URL"
  style={{
    flex: 1,
    fontFamily: 'monospace',
    fontSize: '12px',
    padding: '5px 10px',
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    outline: 'none',
  }}
/>
```

- [ ] **Step 4: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- Topbar 2>&1 | tail -10
```

Expected: all 5 existing Topbar tests pass (inputRef is optional — existing tests are unaffected).

- [ ] **Step 6: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/Topbar.tsx && git commit -m "feat(ui): Topbar inputRef prop for Ctrl+L focus"
```

---

## Task 8: Modify `src/ui/Sidebar.tsx` — render `<QueryHistory>`

**Files:**

- Modify: `src/ui/Sidebar.tsx`

`Sidebar` gains an `onHistorySelect` prop and renders `<QueryHistory>` in a new section below `<FilePanel>`.

- [ ] **Step 1: Add `onHistorySelect` to `SidebarProps` and add the `QueryHistory` import**

Update the top of `src/ui/Sidebar.tsx`:

Change the import block from:

```ts
import type { ColumnInfo } from '@/state/queryState';
import type { RegisteredFile } from '@/state/filesState';
import { SchemaTree } from '@/ui/SchemaTree';
import { FilePanel } from '@/ui/FilePanel';

interface SidebarProps {
  columns: ColumnInfo[] | null;
  schemaStatus: 'idle' | 'loading' | 'loaded' | 'error';
  onColumnClick?: (columnName: string) => void;
  files: RegisteredFile[];
  onAddFile: () => void;
  onRemoveFile: (id: string) => void;
  onChangeAlias: (id: string, alias: string) => void;
  onChangeUrl: (id: string, url: string) => void;
  onProbeFile: (id: string) => void;
}
```

to:

```ts
import type { ColumnInfo } from '@/state/queryState';
import type { RegisteredFile } from '@/state/filesState';
import { SchemaTree } from '@/ui/SchemaTree';
import { FilePanel } from '@/ui/FilePanel';
import { QueryHistory } from '@/ui/QueryHistory';

interface SidebarProps {
  columns: ColumnInfo[] | null;
  schemaStatus: 'idle' | 'loading' | 'loaded' | 'error';
  onColumnClick?: (columnName: string) => void;
  files: RegisteredFile[];
  onAddFile: () => void;
  onRemoveFile: (id: string) => void;
  onChangeAlias: (id: string, alias: string) => void;
  onChangeUrl: (id: string, url: string) => void;
  onProbeFile: (id: string) => void;
  onHistorySelect: (sql: string) => void;
}
```

- [ ] **Step 2: Destructure `onHistorySelect` in the function signature**

Update the function signature from:

```ts
export function Sidebar({
  columns,
  schemaStatus,
  onColumnClick,
  files,
  onAddFile,
  onRemoveFile,
  onChangeAlias,
  onChangeUrl,
  onProbeFile,
}: SidebarProps) {
```

to:

```ts
export function Sidebar({
  columns,
  schemaStatus,
  onColumnClick,
  files,
  onAddFile,
  onRemoveFile,
  onChangeAlias,
  onChangeUrl,
  onProbeFile,
  onHistorySelect,
}: SidebarProps) {
```

- [ ] **Step 3: Render `<QueryHistory>` below `<FilePanel>`**

Add the history section after the closing `</FilePanel>` tag. Update the return JSX body — find the end of the FilePanel block:

```tsx
      <div style={sectionLabelStyle}>Files</div>
      <FilePanel
        files={files}
        onAdd={onAddFile}
        onRemove={onRemoveFile}
        onChangeAlias={onChangeAlias}
        onChangeUrl={onChangeUrl}
        onProbe={onProbeFile}
      />
    </div>
  );
```

and replace with:

```tsx
      <div style={sectionLabelStyle}>Files</div>
      <FilePanel
        files={files}
        onAdd={onAddFile}
        onRemove={onRemoveFile}
        onChangeAlias={onChangeAlias}
        onChangeUrl={onChangeUrl}
        onProbe={onProbeFile}
      />

      <div style={dividerStyle} />

      <QueryHistory onSelect={onHistorySelect} />
    </div>
  );
```

- [ ] **Step 4: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

Expected: TypeScript will report that `<Sidebar>` in `App.tsx` is missing the required `onHistorySelect` prop. This is expected — it will be fixed in Task 9. Note the error; it must not appear after Task 9 is complete.

- [ ] **Step 5: Update the Sidebar test to pass `onHistorySelect`**

In `src/ui/Sidebar.test.tsx`, update `defaultProps` to add:

```ts
const defaultProps = {
  columns: [{ name: 'id', type: 'INTEGER', nullable: false }],
  schemaStatus: 'loaded' as const,
  onColumnClick: vi.fn(),
  files: [],
  onAddFile: vi.fn(),
  onRemoveFile: vi.fn(),
  onChangeAlias: vi.fn(),
  onChangeUrl: vi.fn(),
  onProbeFile: vi.fn(),
  onHistorySelect: vi.fn(),
};
```

Also add this test case at the end of the `describe('Sidebar')` block:

```tsx
it('renders HISTORY section via QueryHistory', () => {
  render(<Sidebar {...defaultProps} />);
  expect(screen.getByText(/HISTORY \(0\)/i)).toBeInTheDocument();
});
```

- [ ] **Step 6: Run Sidebar tests**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- Sidebar 2>&1 | tail -10
```

Expected: `4 passed` (3 original + 1 new).

- [ ] **Step 7: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/Sidebar.tsx src/ui/Sidebar.test.tsx && git commit -m "feat(ui): Sidebar — QueryHistory section below FilePanel"
```

---

## Task 9: Modify `src/App.tsx` — wire everything together

**Files:**

- Modify: `src/App.tsx`

This is the final assembly task. It adds:

1. `handleFormatSql` callback using `formatSql` util
2. `useHistoryStore.getState().addEntry(...)` call after a successful query in `handleRun`
3. A `urlInputRef` ref forwarded to `<Topbar inputRef={...}>`
4. A `showShortcuts` state + `<ShortcutsOverlay>` rendered at root level
5. A global `keydown` listener for `Ctrl+L`, `Escape`, and `?`
6. `onFormat={handleFormatSql}` passed to `<SQLEditor>`
7. `onHistorySelect` passed to `<Sidebar>`

- [ ] **Step 1: Add new imports**

Update the imports at the top of `src/App.tsx`. Add after the existing imports:

```ts
import { formatSql } from '@/util/formatSql';
import { useHistoryStore } from '@/state/historyStore';
import { ShortcutsOverlay } from '@/ui/ShortcutsOverlay';
```

- [ ] **Step 2: Add new refs and state inside `App()`**

Add after the existing `const [shareLabel, setShareLabel] = useState('Share');` line:

```ts
const urlInputRef = useRef<HTMLInputElement>(null);
const [showShortcuts, setShowShortcuts] = useState(false);
```

- [ ] **Step 3: Add `handleFormatSql` callback**

Add after the `handleShare` callback:

```ts
const handleFormatSql = useCallback(() => {
  const formatted = formatSql(queryText);
  dispatch({ type: 'SET_QUERY', sql: formatted });
}, [queryText, dispatch]);
```

- [ ] **Step 4: Record history after a successful query in `handleRun`**

In the existing `handleRun` callback, after `dispatch({ type: 'QUERY_DONE', rowCount: total });` add:

```ts
useHistoryStore.getState().addEntry(queryText, total);
```

The `QUERY_DONE` dispatch and the `addEntry` call should be adjacent:

```ts
dispatch({ type: 'QUERY_DONE', rowCount: total });
useHistoryStore.getState().addEntry(queryText, total);
```

- [ ] **Step 5: Add the global keyboard shortcut listener**

Add a new `useEffect` after the existing `useEffect` blocks (before the `isExecuting` constant):

```ts
// Global keyboard shortcuts:
//   Ctrl+L / Cmd+L — focus URL input
//   Escape         — cancel in-flight query
//   ?              — toggle shortcuts overlay (only when editor not focused)
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl+L / Cmd+L — focus URL input
    if (ctrlOrCmd && e.key === 'l') {
      e.preventDefault();
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
      return;
    }

    // Escape — cancel running query (only when executing)
    if (e.key === 'Escape' && (status === 'executing' || status === 'probing')) {
      handleCancel();
      return;
    }

    // ? — toggle shortcuts overlay (skip when any input/textarea/CodeMirror is focused)
    if (e.key === '?') {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active?.closest('.cm-editor') !== null
      ) {
        return;
      }
      setShowShortcuts((prev) => !prev);
    }
  }

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [status, handleCancel]);
```

- [ ] **Step 6: Pass new props to `<Topbar>`**

Update the `<Topbar>` JSX from:

```tsx
<Topbar
  url={parquetURL}
  isProbing={status === 'probing'}
  onUrlChange={(url) => dispatch({ type: 'SET_URL', url })}
  onLoad={() => void handleProbe()}
  onShare={() => void handleShare()}
  shareLabel={shareLabel}
  shareDisabled={isExecuting}
/>
```

to:

```tsx
<Topbar
  url={parquetURL}
  isProbing={status === 'probing'}
  onUrlChange={(url) => dispatch({ type: 'SET_URL', url })}
  onLoad={() => void handleProbe()}
  onShare={() => void handleShare()}
  shareLabel={shareLabel}
  shareDisabled={isExecuting}
  inputRef={urlInputRef}
/>
```

- [ ] **Step 7: Pass `onHistorySelect` to `<Sidebar>`**

Update the `<Sidebar>` JSX to add the new prop:

```tsx
<Sidebar
  columns={schema}
  schemaStatus={schemaStatus}
  onColumnClick={handleColumnClick}
  files={files}
  onAddFile={() => filesDispatch({ type: 'ADD_FILE', id: crypto.randomUUID() })}
  onRemoveFile={handleRemoveFile}
  onChangeAlias={(id, alias) => filesDispatch({ type: 'UPDATE_FILE_ALIAS', id, alias })}
  onChangeUrl={(id, url) => filesDispatch({ type: 'UPDATE_FILE_URL', id, url })}
  onProbeFile={handleProbeFile}
  onHistorySelect={(sql) => dispatch({ type: 'SET_QUERY', sql })}
/>
```

- [ ] **Step 8: Pass `onFormat` to `<SQLEditor>`**

Update the `<SQLEditor>` JSX to add the new prop:

```tsx
<SQLEditor
  ref={editorRef}
  value={queryText}
  disabled={isExecuting}
  onChange={(sql) => dispatch({ type: 'SET_QUERY', sql })}
  onRun={handleRun}
  onFormat={handleFormatSql}
/>
```

- [ ] **Step 9: Add Format button to the Run toolbar and render `<ShortcutsOverlay>`**

Update the "Run toolbar" div in `App.tsx`. Change the existing toolbar from:

```tsx
{
  /* Run toolbar */
}
<div
  style={{
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '6px 12px',
    background: 'var(--bg-elevated)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  }}
>
  <button
    onClick={handleRun}
    disabled={isExecuting || !parquetURL.trim()}
    aria-label="Run query"
    style={{
      padding: '5px 18px',
      background: isExecuting ? 'var(--bg-surface)' : 'var(--accent)',
      color: isExecuting ? 'var(--text-muted)' : 'var(--text-primary)',
      border: 'none',
      borderRadius: 'var(--radius)',
      fontSize: '13px',
      fontWeight: 600,
      cursor: isExecuting ? 'default' : 'pointer',
    }}
  >
    {status === 'executing' ? 'Running…' : '▶ Run'}
  </button>
</div>;
```

to:

```tsx
{
  /* Run toolbar */
}
<div
  style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    padding: '6px 12px',
    background: 'var(--bg-elevated)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  }}
>
  <button
    onClick={handleFormatSql}
    disabled={isExecuting}
    aria-label="Format SQL (Ctrl+Shift+F)"
    title="Format SQL (Ctrl+Shift+F)"
    style={{
      padding: '5px 14px',
      background: 'var(--bg-elevated)',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      fontSize: '13px',
      cursor: isExecuting ? 'default' : 'pointer',
    }}
  >
    Format
  </button>
  <button
    onClick={handleRun}
    disabled={isExecuting || !parquetURL.trim()}
    aria-label="Run query"
    style={{
      padding: '5px 18px',
      background: isExecuting ? 'var(--bg-surface)' : 'var(--accent)',
      color: isExecuting ? 'var(--text-muted)' : 'var(--text-primary)',
      border: 'none',
      borderRadius: 'var(--radius)',
      fontSize: '13px',
      fontWeight: 600,
      cursor: isExecuting ? 'default' : 'pointer',
    }}
  >
    {status === 'executing' ? 'Running…' : '▶ Run'}
  </button>
</div>;
```

Then, at the very end of the returned JSX (just before the closing `</div>` of the root element), add the overlay:

```tsx
<ShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
```

- [ ] **Step 10: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 11: Run full test suite**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test 2>&1 | tail -20
```

Expected: all tests pass. Coverage remains ≥ 80%.

- [ ] **Step 12: Lint**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm lint 2>&1 | tail -10
```

Expected: no warnings or errors.

- [ ] **Step 13: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/App.tsx && git commit -m "feat(app): wire Format SQL, history addEntry, Ctrl+L/Escape/? shortcuts"
```

---

## Final Verification

- [ ] **Run all checks**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck && pnpm lint && pnpm test 2>&1 | tail -30
```

Expected output contains:

- `Found 0 errors.` (typecheck)
- No lint warnings
- All test suites pass
- Coverage thresholds met (lines ≥ 80%, functions ≥ 80%, branches ≥ 80%, statements ≥ 80%)

- [ ] **Smoke-test in the browser**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm dev
```

Manual checks:

1. Open `http://localhost:5173`. Press `?` — ShortcutsOverlay appears. Press Escape — it closes.
2. Enter a URL and click Load. Type a query in the editor. Click "Format" — SQL is prettified with uppercase keywords.
3. Press `Ctrl+Shift+F` — same format behaviour from inside the editor.
4. Run a query. Open the Sidebar — "HISTORY (1)" appears with the query preview. Click the entry — editor restores it.
5. Press `Ctrl+L` — URL input receives focus and is selected.
6. Run a slow query, then press Escape — query is cancelled.
