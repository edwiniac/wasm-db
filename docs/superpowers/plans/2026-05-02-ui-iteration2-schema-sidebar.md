# UI Overhaul Iteration 2 — Schema Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live column search filter to the schema sidebar and a column stats panel that fires a DuckDB query on column click to reveal min/max/avg/null-count and a visual distribution bar.

**Architecture:** A new `src/engine/columnStats.ts` module builds and fires the stats SQL via `EngineClient.runQuery`, returns a typed `ColumnStats` object. Two new fields (`columnStats`, `columnStatsLoading`) and three new actions (`COLUMN_STATS_START`, `COLUMN_STATS_DONE`, `COLUMN_STATS_ERROR`) extend the reducer in `queryState.ts`. `SchemaTree` gains a `filter?: string` prop for client-side column filtering; `Sidebar` owns the filter `<input>` state and renders `ColumnStatsPanel` below `FilePanel`. `App.tsx` wires `handleColumnClick` to insert the column name into the editor AND dispatch the stats fetch concurrently.

**Tech Stack:** React 18, TypeScript strict, CSS custom properties, Vitest + @testing-library/react, pnpm.

---

## File Map

| File                               | Action | Responsibility                                                                                                            |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `src/engine/columnStats.ts`        | Create | `fetchColumnStats` — builds SQL, fires query, returns `ColumnStats`                                                       |
| `src/engine/columnStats.test.ts`   | Create | Unit tests for SQL generation and result parsing                                                                          |
| `src/ui/ColumnStatsPanel.tsx`      | Create | Sidebar stats display: header, min/max/avg/nulls, histogram bar                                                           |
| `src/ui/ColumnStatsPanel.test.tsx` | Create | RTL tests: loading spinner, stats rows, null avg hidden for VARCHAR                                                       |
| `src/state/queryState.ts`          | Modify | Add `columnStats`, `columnStatsLoading`, 3 new actions                                                                    |
| `src/state/queryState.test.ts`     | Modify | Tests for COLUMN_STATS_START/DONE/ERROR reducer cases                                                                     |
| `src/ui/SchemaTree.tsx`            | Modify | Accept `filter?: string`; filter displayed columns; "No columns match" fallback; `onColumnClick` passes full `ColumnInfo` |
| `src/ui/SchemaTree.test.tsx`       | Modify | Tests for filter prop: shows all, hides non-matching, shows fallback                                                      |
| `src/ui/Sidebar.tsx`               | Modify | Add filter input state; pass `filter` to SchemaTree; render ColumnStatsPanel; accept stats props                          |
| `src/ui/Sidebar.test.tsx`          | Modify | Tests for filter input presence and typing                                                                                |
| `src/App.tsx`                      | Modify | `handleColumnClick` fires stats; passes `columnStats`/`columnStatsLoading` to Sidebar                                     |

---

## Task 1: `src/engine/columnStats.ts` — fetchColumnStats

**Files:**

- Create: `src/engine/columnStats.ts`
- Create: `src/engine/columnStats.test.ts`

### Background

`fetchSchema` in `src/engine/schema.ts` shows the exact pattern: call `engine.runQuery(sql)`, iterate `handle.stream`, parse rows. `columnStats.ts` follows the same approach with a different SQL template.

Numeric types (those whose `type` string starts with `INT`, `FLOAT`, `DOUBLE`, `DECIMAL`, `BIGINT`, `HUGEINT`, `SMALLINT`, `TINYINT`, `UBIGINT`, `UINTEGER`, `USMALLINT`, `UTINYINT`, `REAL`) get a non-null `avg`; everything else gets `null` (the panel omits the avg row).

`nullPct` is derived: `nullCount / totalCount` — computed in the function before returning, never stored.

URL sanitization: same single-quote escaping as `schema.ts` (`url.replace(/'/g, "''")`).

- [ ] **Step 1.1: Write failing tests first (`columnStats.test.ts`)**

Create `src/engine/columnStats.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { fetchColumnStats } from '@/engine/columnStats';
import type { EngineClient } from '@/engine/client';
import type { ColumnInfo } from '@/engine/schema';

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

const numericCol: ColumnInfo = { name: 'score', type: 'FLOAT', nullable: true };
const varcharCol: ColumnInfo = { name: 'label', type: 'VARCHAR', nullable: false };

describe('fetchColumnStats — SQL generation', () => {
  it('uses parquet_scan with the given URL', async () => {
    const engine = mockEngine([
      { col_min: 0, col_max: 1, col_avg: 0.5, null_count: 0, total_count: 10 },
    ]);
    await fetchColumnStats(engine, 'https://example.com/a.parquet', numericCol);
    const sql = (engine.runQuery as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain("parquet_scan('https://example.com/a.parquet')");
  });

  it('sanitizes single quotes in the URL', async () => {
    const engine = mockEngine([
      { col_min: 0, col_max: 1, col_avg: 0.5, null_count: 0, total_count: 10 },
    ]);
    await fetchColumnStats(engine, "https://example.com/it's.parquet", numericCol);
    const sql = (engine.runQuery as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain("parquet_scan('https://example.com/it''s.parquet')");
  });

  it('includes MIN, MAX, AVG, null count, total count in SELECT', async () => {
    const engine = mockEngine([
      { col_min: 0, col_max: 1, col_avg: 0.5, null_count: 0, total_count: 10 },
    ]);
    await fetchColumnStats(engine, 'https://example.com/a.parquet', numericCol);
    const sql = (engine.runQuery as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toMatch(/MIN\(score\)/i);
    expect(sql).toMatch(/MAX\(score\)/i);
    expect(sql).toMatch(/AVG\(TRY_CAST\(score AS DOUBLE\)\)/i);
    expect(sql).toMatch(/COUNT\(\*\) FILTER/i);
    expect(sql).toMatch(/COUNT\(\*\)/i);
  });
});

describe('fetchColumnStats — result parsing', () => {
  it('returns correct ColumnStats for a numeric column', async () => {
    const engine = mockEngine([
      { col_min: 0.12, col_max: 0.99, col_avg: 0.71, null_count: 3, total_count: 1000 },
    ]);
    const result = await fetchColumnStats(engine, 'https://example.com/a.parquet', numericCol);
    expect(result.columnName).toBe('score');
    expect(result.columnType).toBe('FLOAT');
    expect(result.min).toBe(0.12);
    expect(result.max).toBe(0.99);
    expect(result.avg).toBeCloseTo(0.71);
    expect(result.nullCount).toBe(3);
    expect(result.totalCount).toBe(1000);
    expect(result.nullPct).toBeCloseTo(0.003);
  });

  it('returns avg=null for a VARCHAR column', async () => {
    const engine = mockEngine([
      { col_min: 'apple', col_max: 'zebra', col_avg: null, null_count: 0, total_count: 50 },
    ]);
    const result = await fetchColumnStats(engine, 'https://example.com/a.parquet', varcharCol);
    expect(result.avg).toBeNull();
  });

  it('computes nullPct=0 when nullCount is 0', async () => {
    const engine = mockEngine([
      { col_min: 1, col_max: 10, col_avg: 5, null_count: 0, total_count: 100 },
    ]);
    const result = await fetchColumnStats(engine, 'https://example.com/a.parquet', numericCol);
    expect(result.nullPct).toBe(0);
  });

  it('computes nullPct=1 when all rows are null', async () => {
    const engine = mockEngine([
      { col_min: null, col_max: null, col_avg: null, null_count: 100, total_count: 100 },
    ]);
    const result = await fetchColumnStats(engine, 'https://example.com/a.parquet', numericCol);
    expect(result.nullPct).toBe(1);
  });
});
```

Run to confirm they fail:

```bash
pnpm test -- columnStats
# Expected: several test failures (module not found or exports missing)
```

- [ ] **Step 1.2: Implement `src/engine/columnStats.ts`**

Create `src/engine/columnStats.ts`:

```ts
import type { EngineClient } from '@/engine/client';
import type { ColumnInfo } from '@/engine/schema';

export interface ColumnStats {
  columnName: string;
  columnType: string;
  min: unknown;
  max: unknown;
  avg: number | null;
  nullCount: number;
  totalCount: number;
  nullPct: number;
}

const NUMERIC_PREFIXES = [
  'INT',
  'FLOAT',
  'DOUBLE',
  'DECIMAL',
  'BIGINT',
  'HUGEINT',
  'SMALLINT',
  'TINYINT',
  'UBIGINT',
  'UINTEGER',
  'USMALLINT',
  'UTINYINT',
  'REAL',
];

function isNumeric(type: string): boolean {
  const upper = type.toUpperCase();
  return NUMERIC_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

function sanitizeURL(url: string): string {
  return url.replace(/'/g, "''");
}

export async function fetchColumnStats(
  client: EngineClient,
  url: string,
  col: ColumnInfo,
): Promise<ColumnStats> {
  const safeURL = sanitizeURL(url);
  const colName = col.name;

  const sql = `
SELECT
  MIN(${colName})                              AS col_min,
  MAX(${colName})                              AS col_max,
  AVG(TRY_CAST(${colName} AS DOUBLE))         AS col_avg,
  COUNT(*) FILTER (WHERE ${colName} IS NULL)  AS null_count,
  COUNT(*)                                     AS total_count
FROM parquet_scan('${safeURL}')
`.trim();

  const handle = await client.runQuery(sql);
  let row: Record<string, unknown> = {};
  for await (const batch of handle.stream) {
    if (batch.rows.length > 0) {
      row = batch.rows[0] as Record<string, unknown>;
    }
  }

  const nullCount = Number(row['null_count'] ?? 0);
  const totalCount = Number(row['total_count'] ?? 0);
  const rawAvg = row['col_avg'];
  const avg = isNumeric(col.type) && rawAvg != null ? Number(rawAvg) : null;

  return {
    columnName: colName,
    columnType: col.type,
    min: row['col_min'] ?? null,
    max: row['col_max'] ?? null,
    avg,
    nullCount,
    totalCount,
    nullPct: totalCount > 0 ? nullCount / totalCount : 0,
  };
}
```

- [ ] **Step 1.3: Run tests and confirm they pass**

```bash
pnpm test -- columnStats
# Expected output: all tests pass (green)
# Expected: Test Files 1 passed (1), Tests 8 passed (8)
```

- [ ] **Step 1.4: Run typecheck**

```bash
pnpm typecheck
# Expected: no errors
```

- [ ] **Step 1.5: Commit**

```bash
git add src/engine/columnStats.ts src/engine/columnStats.test.ts
git commit -m "feat(engine): add fetchColumnStats — SQL stats query with typed result"
```

---

## Task 2: `src/ui/ColumnStatsPanel.tsx` — Stats Display Component

**Files:**

- Create: `src/ui/ColumnStatsPanel.tsx`
- Create: `src/ui/ColumnStatsPanel.test.tsx`

### Background

The panel renders in the sidebar below FilePanel. When both `stats` and `loading` are false/null, it renders nothing (collapsed). When `loading` is true, it shows a spinner row. When `stats` is present, it renders the column header, stat rows, and a 10-segment cosmetic histogram bar.

**Histogram heuristic:** The bar uses 10 fixed segments. To create a rough bell-curve visual approximation without a second query, compute the "avg position" as `(avg - min) / (max - min)` clamped to [0, 1]. Generate heights using a Gaussian-like function: for segment index `i` in [0..9], height = `Math.exp(-0.5 * ((i / 9 - avgPos) / 0.25) ** 2)`. Normalise heights to [2, 14]px range. For non-numeric columns (avg is null), render uniform bars at 8px height.

The panel renders values with `toLocaleString()` for numbers. Null count shows count and percentage (e.g. "3 (0.3%)"). Numeric values use `--color-number`; string values use `--text-secondary`.

- [ ] **Step 2.1: Write failing tests first (`ColumnStatsPanel.test.tsx`)**

Create `src/ui/ColumnStatsPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ColumnStatsPanel } from '@/ui/ColumnStatsPanel';
import type { ColumnStats } from '@/engine/columnStats';

const numericStats: ColumnStats = {
  columnName: 'score',
  columnType: 'FLOAT',
  min: 0.12,
  max: 0.99,
  avg: 0.71,
  nullCount: 3,
  totalCount: 1000,
  nullPct: 0.003,
};

const varcharStats: ColumnStats = {
  columnName: 'label',
  columnType: 'VARCHAR',
  min: 'apple',
  max: 'zebra',
  avg: null,
  nullCount: 0,
  totalCount: 50,
  nullPct: 0,
};

describe('ColumnStatsPanel', () => {
  it('renders nothing when stats is null and not loading', () => {
    const { container } = render(<ColumnStatsPanel stats={null} loading={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a loading indicator when loading is true', () => {
    render(<ColumnStatsPanel stats={null} loading={true} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders column name and type in header', () => {
    render(<ColumnStatsPanel stats={numericStats} loading={false} />);
    expect(screen.getByText(/score/)).toBeInTheDocument();
    expect(screen.getByText(/FLOAT/)).toBeInTheDocument();
  });

  it('renders min, max, avg rows for a numeric column', () => {
    render(<ColumnStatsPanel stats={numericStats} loading={false} />);
    expect(screen.getByText('min')).toBeInTheDocument();
    expect(screen.getByText('max')).toBeInTheDocument();
    expect(screen.getByText('avg')).toBeInTheDocument();
  });

  it('hides avg row for VARCHAR column (avg is null)', () => {
    render(<ColumnStatsPanel stats={varcharStats} loading={false} />);
    expect(screen.queryByText('avg')).not.toBeInTheDocument();
  });

  it('renders null count and percentage', () => {
    render(<ColumnStatsPanel stats={numericStats} loading={false} />);
    expect(screen.getByText(/nulls/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.3%/)).toBeInTheDocument();
  });

  it('renders 10 histogram bar segments', () => {
    render(<ColumnStatsPanel stats={numericStats} loading={false} />);
    const bars = document.querySelectorAll('[data-bar-segment]');
    expect(bars).toHaveLength(10);
  });
});
```

Run to confirm failures:

```bash
pnpm test -- ColumnStatsPanel
# Expected: failures (module not found)
```

- [ ] **Step 2.2: Implement `src/ui/ColumnStatsPanel.tsx`**

Create `src/ui/ColumnStatsPanel.tsx`:

```tsx
import type { ColumnStats } from '@/engine/columnStats';

interface ColumnStatsPanelProps {
  stats: ColumnStats | null;
  loading: boolean;
}

function buildHistogramHeights(stats: ColumnStats): number[] {
  const segments = 10;
  if (stats.avg === null) {
    return Array(segments).fill(8) as number[];
  }

  const minVal = typeof stats.min === 'number' ? stats.min : 0;
  const maxVal = typeof stats.max === 'number' ? stats.max : 1;
  const range = maxVal - minVal;
  const avgPos = range > 0 ? Math.max(0, Math.min(1, (stats.avg - minVal) / range)) : 0.5;

  const rawHeights = Array.from({ length: segments }, (_, i) => {
    const pos = i / (segments - 1);
    return Math.exp(-0.5 * ((pos - avgPos) / 0.25) ** 2);
  });

  const maxH = Math.max(...rawHeights);
  const minH = Math.min(...rawHeights);
  const span = maxH - minH || 1;

  return rawHeights.map((h) => Math.round(2 + ((h - minH) / span) * 12));
}

const panelStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  padding: '8px 12px 10px',
  fontSize: '12px',
};

const headerStyle: React.CSSProperties = {
  fontWeight: 600,
  marginBottom: '6px',
  color: 'var(--text-primary)',
  display: 'flex',
  gap: '6px',
  alignItems: 'baseline',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '2px 0',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
};

export function ColumnStatsPanel({ stats, loading }: ColumnStatsPanelProps) {
  if (!loading && !stats) return null;

  if (loading) {
    return (
      <div style={panelStyle}>
        <div role="status" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Loading stats…
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const heights = buildHistogramHeights(stats);
  const nullPctDisplay = (stats.nullPct * 100).toFixed(1) + '%';
  const isNumericColumn = stats.avg !== null;

  function formatValue(val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'number') return val.toLocaleString();
    return String(val);
  }

  const valueColor = isNumericColumn ? 'var(--color-number)' : 'var(--text-secondary)';

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span>{stats.columnName}</span>
        <span style={{ color: 'var(--text-faint)', fontSize: '11px', fontWeight: 400 }}>
          {stats.columnType}
        </span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>min</span>
        <span style={{ color: valueColor }}>{formatValue(stats.min)}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>max</span>
        <span style={{ color: valueColor }}>{formatValue(stats.max)}</span>
      </div>
      {stats.avg !== null && (
        <div style={rowStyle}>
          <span style={labelStyle}>avg</span>
          <span style={{ color: 'var(--color-number)' }}>{stats.avg.toLocaleString()}</span>
        </div>
      )}
      <div style={rowStyle}>
        <span style={labelStyle}>nulls</span>
        <span style={{ color: 'var(--text-secondary)' }}>
          {stats.nullCount.toLocaleString()} ({nullPctDisplay})
        </span>
      </div>

      {/* Cosmetic histogram */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          alignItems: 'flex-end',
          height: '16px',
          marginTop: '8px',
        }}
      >
        {heights.map((h, i) => (
          <div
            key={i}
            data-bar-segment
            style={{
              flex: 1,
              height: `${h}px`,
              background: 'var(--accent)',
              opacity: 0.6,
              borderRadius: '1px',
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2.3: Run tests and confirm they pass**

```bash
pnpm test -- ColumnStatsPanel
# Expected: all 7 tests pass
```

- [ ] **Step 2.4: Run typecheck**

```bash
pnpm typecheck
# Expected: no errors
```

- [ ] **Step 2.5: Commit**

```bash
git add src/ui/ColumnStatsPanel.tsx src/ui/ColumnStatsPanel.test.tsx
git commit -m "feat(ui): add ColumnStatsPanel — min/max/avg/nulls + histogram bar"
```

---

## Task 3: `src/state/queryState.ts` — Column Stats State

**Files:**

- Modify: `src/state/queryState.ts`
- Modify: `src/state/queryState.test.ts`

### Background

`queryState.ts` uses a plain reducer pattern (no Zustand inside the reducer itself — `store.ts` wraps it). We add two new fields to `QueryState` and three new action types to `QueryAction`. The `SCHEMA_START` case (triggered when a new file is loaded/probed) must also clear `columnStats` to avoid stale stats from a previous file.

- [ ] **Step 3.1: Write failing reducer tests first**

Append to `src/state/queryState.test.ts`:

```ts
import type { ColumnStats } from '@/engine/columnStats';

// Add this describe block at the end of the file:

describe('queryReducer — column stats actions', () => {
  const mockStats: ColumnStats = {
    columnName: 'score',
    columnType: 'FLOAT',
    min: 0.12,
    max: 0.99,
    avg: 0.71,
    nullCount: 3,
    totalCount: 1000,
    nullPct: 0.003,
  };

  it('COLUMN_STATS_START sets columnStatsLoading to true and clears columnStats', () => {
    const withStats = queryReducer(initialState, { type: 'COLUMN_STATS_DONE', stats: mockStats });
    const next = queryReducer(withStats, { type: 'COLUMN_STATS_START' });
    expect(next.columnStatsLoading).toBe(true);
    expect(next.columnStats).toBeNull();
  });

  it('COLUMN_STATS_DONE stores stats and sets columnStatsLoading to false', () => {
    const loading = queryReducer(initialState, { type: 'COLUMN_STATS_START' });
    const next = queryReducer(loading, { type: 'COLUMN_STATS_DONE', stats: mockStats });
    expect(next.columnStats).toEqual(mockStats);
    expect(next.columnStatsLoading).toBe(false);
  });

  it('COLUMN_STATS_ERROR sets columnStatsLoading to false and leaves columnStats null', () => {
    const loading = queryReducer(initialState, { type: 'COLUMN_STATS_START' });
    const next = queryReducer(loading, { type: 'COLUMN_STATS_ERROR' });
    expect(next.columnStatsLoading).toBe(false);
    expect(next.columnStats).toBeNull();
  });

  it('SCHEMA_START clears columnStats', () => {
    const withStats = queryReducer(initialState, { type: 'COLUMN_STATS_DONE', stats: mockStats });
    const next = queryReducer(withStats, { type: 'SCHEMA_START' });
    expect(next.columnStats).toBeNull();
    expect(next.columnStatsLoading).toBe(false);
  });
});
```

Run to confirm failures:

```bash
pnpm test -- queryState
# Expected: 4 new failures (unknown action types / missing fields)
```

- [ ] **Step 3.2: Add `columnStats` and `columnStatsLoading` to `QueryState` and `initialState`**

In `src/state/queryState.ts`, add the import at the top:

```ts
import type { ColumnStats } from '@/engine/columnStats';
```

Add these two fields to the `QueryState` interface after `isOnline`:

```ts
columnStats: ColumnStats | null;
columnStatsLoading: boolean;
```

Add these two fields to `initialState` after `isOnline: true`:

```ts
  columnStats: null,
  columnStatsLoading: false,
```

- [ ] **Step 3.3: Add three new action types to `QueryAction`**

In `src/state/queryState.ts`, extend the `QueryAction` union after `{ type: 'SET_ONLINE'; online: boolean }`:

```ts
  | { type: 'COLUMN_STATS_START' }
  | { type: 'COLUMN_STATS_DONE'; stats: ColumnStats }
  | { type: 'COLUMN_STATS_ERROR' }
```

- [ ] **Step 3.4: Add reducer cases for the three new actions**

In `queryReducer`, add before the `default` case:

```ts
    case 'COLUMN_STATS_START':
      return { ...state, columnStatsLoading: true, columnStats: null };

    case 'COLUMN_STATS_DONE':
      return { ...state, columnStatsLoading: false, columnStats: action.stats };

    case 'COLUMN_STATS_ERROR':
      return { ...state, columnStatsLoading: false, columnStats: null };
```

Also update the `SCHEMA_START` case to clear column stats:

```ts
    case 'SCHEMA_START':
      return { ...state, schemaStatus: 'loading', columnStats: null, columnStatsLoading: false };
```

- [ ] **Step 3.5: Expose `columnStats` and `columnStatsLoading` from `queryService.ts`**

No changes needed — the store in `store.ts` wraps the full `QueryState`, so both new fields are automatically surfaced via `useQueryStore`. Confirm with:

```bash
pnpm typecheck
# Expected: no errors
```

- [ ] **Step 3.6: Run tests and confirm they all pass**

```bash
pnpm test -- queryState
# Expected: all existing + 4 new tests pass
```

- [ ] **Step 3.7: Commit**

```bash
git add src/state/queryState.ts src/state/queryState.test.ts
git commit -m "feat(state): add columnStats/columnStatsLoading state + COLUMN_STATS_START/DONE/ERROR actions"
```

---

## Task 4: `src/ui/SchemaTree.tsx` — Column Filter + ColumnInfo Click

**Files:**

- Modify: `src/ui/SchemaTree.tsx`
- Modify: `src/ui/SchemaTree.test.tsx`

### Background

Two changes in one task (tightly coupled):

1. `onColumnClick` signature changes from `(columnName: string)` to `(col: ColumnInfo)` so App can get both name and type for stats.
2. New `filter?: string` prop filters the rendered columns list client-side.

The existing `SchemaTree.test.tsx` tests call `onColumnClick` with `'id'` (a string) — those tests must be updated to expect the full `ColumnInfo` object.

- [ ] **Step 4.1: Update existing tests and add new filter tests in `SchemaTree.test.tsx`**

Replace the entire `SchemaTree.test.tsx` with:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SchemaTree } from '@/ui/SchemaTree';
import type { ColumnInfo } from '@/state/queryState';

const cols: ColumnInfo[] = [
  { name: 'id', type: 'INTEGER', nullable: false },
  { name: 'label', type: 'VARCHAR', nullable: true },
  { name: 'score', type: 'FLOAT', nullable: false },
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
    expect(screen.getByText(/columns \(3\)/i)).toBeInTheDocument();
  });
});

describe('SchemaTree — onColumnClick', () => {
  it('calls onColumnClick with the full ColumnInfo when a row is clicked', () => {
    const onColumnClick = vi.fn();
    render(<SchemaTree columns={cols} status="loaded" onColumnClick={onColumnClick} />);
    fireEvent.click(screen.getByText('id'));
    expect(onColumnClick).toHaveBeenCalledWith({ name: 'id', type: 'INTEGER', nullable: false });
  });

  it('does not throw when onColumnClick is omitted and a row is clicked', () => {
    render(<SchemaTree columns={cols} status="loaded" />);
    expect(() => fireEvent.click(screen.getByText('id'))).not.toThrow();
  });
});

describe('SchemaTree — filter prop', () => {
  it('shows all columns when filter is empty string', () => {
    render(<SchemaTree columns={cols} status="loaded" filter="" />);
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('label')).toBeInTheDocument();
    expect(screen.getByText('score')).toBeInTheDocument();
  });

  it('shows all columns when filter is undefined', () => {
    render(<SchemaTree columns={cols} status="loaded" />);
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('label')).toBeInTheDocument();
    expect(screen.getByText('score')).toBeInTheDocument();
  });

  it('hides non-matching columns when filter matches a substring', () => {
    render(<SchemaTree columns={cols} status="loaded" filter="sc" />);
    expect(screen.queryByText('id')).not.toBeInTheDocument();
    expect(screen.queryByText('label')).not.toBeInTheDocument();
    expect(screen.getByText('score')).toBeInTheDocument();
  });

  it('is case-insensitive', () => {
    render(<SchemaTree columns={cols} status="loaded" filter="SCORE" />);
    expect(screen.getByText('score')).toBeInTheDocument();
    expect(screen.queryByText('id')).not.toBeInTheDocument();
  });

  it('shows "No columns match" fallback when no columns match the filter', () => {
    render(<SchemaTree columns={cols} status="loaded" filter="zzz" />);
    expect(screen.getByText(/no columns match/i)).toBeInTheDocument();
  });

  it('passes full ColumnInfo to onColumnClick even when filter is active', () => {
    const onColumnClick = vi.fn();
    render(<SchemaTree columns={cols} status="loaded" filter="sc" onColumnClick={onColumnClick} />);
    fireEvent.click(screen.getByText('score'));
    expect(onColumnClick).toHaveBeenCalledWith({ name: 'score', type: 'FLOAT', nullable: false });
  });
});
```

Run to confirm failures:

```bash
pnpm test -- SchemaTree
# Expected: existing onColumnClick test fails (called with 'id' not ColumnInfo object), new filter tests fail
```

- [ ] **Step 4.2: Update `src/ui/SchemaTree.tsx` — add filter prop and change click signature**

Replace the entire `src/ui/SchemaTree.tsx` with:

```tsx
import { useState } from 'react';
import type { ColumnInfo } from '@/state/queryState';

interface SchemaTreeProps {
  columns: ColumnInfo[] | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  onColumnClick?: (col: ColumnInfo) => void;
  filter?: string;
}

export function SchemaTree({ columns, status, onColumnClick, filter }: SchemaTreeProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  if (status === 'idle') return null;

  if (status === 'loading') {
    return (
      <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>
        Loading schema…
      </div>
    );
  }

  if (status === 'error' || !columns) {
    return (
      <div style={{ padding: '8px 12px', color: 'var(--color-error)', fontSize: '12px' }}>
        Schema unavailable
      </div>
    );
  }

  const lowerFilter = filter ? filter.toLowerCase() : '';
  const visible = lowerFilter
    ? columns.filter((c) => c.name.toLowerCase().includes(lowerFilter))
    : columns;

  function handleClick(col: ColumnInfo) {
    onColumnClick?.(col);
    setHighlighted(col.name);
    setTimeout(() => setHighlighted(null), 300);
  }

  return (
    <div
      aria-label="Schema tree"
      style={{
        padding: '4px 0',
        overflowY: 'auto',
        maxHeight: '200px',
        fontSize: '12px',
      }}
    >
      <div style={{ color: 'var(--text-muted)', padding: '3px 12px', fontSize: '11px' }}>
        Columns ({columns.length})
      </div>

      {visible.length === 0 && lowerFilter ? (
        <div style={{ padding: '6px 12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No columns match
        </div>
      ) : (
        visible.map((col) => {
          const isHighlighted = highlighted === col.name;
          return (
            <div
              key={col.name}
              data-column={col.name}
              onClick={() => handleClick(col)}
              style={{
                display: 'flex',
                gap: '6px',
                padding: '3px 12px',
                alignItems: 'baseline',
                cursor: onColumnClick ? 'pointer' : 'default',
                background: isHighlighted ? 'var(--accent-dim)' : 'transparent',
                borderLeft: isHighlighted ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <span style={{ color: 'var(--text-primary)' }}>{col.name}</span>
              <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>{col.type}</span>
              {col.nullable && (
                <span style={{ color: 'var(--text-faint)', fontSize: '10px' }}>NULL</span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 4.3: Run tests and confirm they pass**

```bash
pnpm test -- SchemaTree
# Expected: all tests pass (original 5 + new 6 = 11 total)
```

- [ ] **Step 4.4: Run typecheck**

```bash
pnpm typecheck
# Expected: error in App.tsx — handleColumnClick still passes a string; we fix that in Task 6
# For now note the error; proceed to commit SchemaTree only
```

- [ ] **Step 4.5: Commit**

```bash
git add src/ui/SchemaTree.tsx src/ui/SchemaTree.test.tsx
git commit -m "feat(ui): SchemaTree — add filter prop + change onColumnClick to pass full ColumnInfo"
```

---

## Task 5: `src/ui/Sidebar.tsx` — Filter Input + ColumnStatsPanel

**Files:**

- Modify: `src/ui/Sidebar.tsx`
- Modify: `src/ui/Sidebar.test.tsx`

### Background

`Sidebar` gains:

1. A local `useState<string>('')` for the filter value.
2. A `useEffect` that resets the filter when the `columns` prop changes (new file loaded).
3. A filter `<input>` rendered below the "COLUMNS" section label.
4. The `filter` value passed down to `SchemaTree`.
5. `ColumnStatsPanel` rendered below `FilePanel`, receiving `stats` and `loading` from new props.
6. `onColumnClick` type changes to `(col: ColumnInfo) => void`.

The input styling from the spec: `width: 100%`, `background: var(--bg-base)`, `border: 1px solid var(--border)`, `color: var(--text-primary)`, `font-size: 12px`, `padding: 4px 8px`, `border-radius: var(--radius)`. Placeholder: "Filter columns…".

New props added to `SidebarProps`:

```ts
  columnStats: ColumnStats | null;
  columnStatsLoading: boolean;
  onColumnClick?: (col: ColumnInfo) => void;
```

- [ ] **Step 5.1: Write failing tests for the new Sidebar features**

Replace the entire `src/ui/Sidebar.test.tsx` with:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar } from '@/ui/Sidebar';
import type { ColumnStats } from '@/engine/columnStats';

const defaultProps = {
  columns: [
    { name: 'id', type: 'INTEGER', nullable: false },
    { name: 'score', type: 'FLOAT', nullable: false },
  ],
  schemaStatus: 'loaded' as const,
  onColumnClick: vi.fn(),
  columnStats: null,
  columnStatsLoading: false,
  files: [],
  onAddFile: vi.fn(),
  onRemoveFile: vi.fn(),
  onChangeAlias: vi.fn(),
  onChangeUrl: vi.fn(),
  onProbeFile: vi.fn(),
};

describe('Sidebar', () => {
  it('renders COLUMNS section label', () => {
    render(<Sidebar {...defaultProps} />);
    const labels = screen.getAllByText(/COLUMNS/i);
    expect(labels[0]).toBeInTheDocument();
    expect(labels[0]).toHaveStyle('textTransform: uppercase');
  });

  it('renders FILES section label', () => {
    render(<Sidebar {...defaultProps} />);
    const labels = screen.getAllByText(/FILES/i);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]).toHaveStyle('textTransform: uppercase');
  });

  it('renders SchemaTree inside (column name visible)', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('id')).toBeInTheDocument();
  });

  it('renders the filter input with correct placeholder', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByPlaceholderText('Filter columns…')).toBeInTheDocument();
  });

  it('typing in filter input hides non-matching columns', () => {
    render(<Sidebar {...defaultProps} />);
    const input = screen.getByPlaceholderText('Filter columns…');
    fireEvent.change(input, { target: { value: 'sc' } });
    expect(screen.queryByText('id')).not.toBeInTheDocument();
    expect(screen.getByText('score')).toBeInTheDocument();
  });

  it('shows loading spinner when columnStatsLoading is true', () => {
    render(<Sidebar {...defaultProps} columnStatsLoading={true} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders ColumnStatsPanel when stats are present', () => {
    const stats: ColumnStats = {
      columnName: 'score',
      columnType: 'FLOAT',
      min: 0.12,
      max: 0.99,
      avg: 0.71,
      nullCount: 3,
      totalCount: 1000,
      nullPct: 0.003,
    };
    render(<Sidebar {...defaultProps} columnStats={stats} />);
    expect(screen.getByText('score')).toBeInTheDocument();
    expect(screen.getByText('min')).toBeInTheDocument();
  });
});
```

Run to confirm failures:

```bash
pnpm test -- Sidebar
# Expected: new tests fail (missing props, missing filter input)
```

- [ ] **Step 5.2: Update `src/ui/Sidebar.tsx`**

Replace the entire `src/ui/Sidebar.tsx` with:

```tsx
import { useState, useEffect } from 'react';
import type { ColumnInfo } from '@/state/queryState';
import type { RegisteredFile } from '@/state/filesState';
import type { ColumnStats } from '@/engine/columnStats';
import { SchemaTree } from '@/ui/SchemaTree';
import { FilePanel } from '@/ui/FilePanel';
import { ColumnStatsPanel } from '@/ui/ColumnStatsPanel';

interface SidebarProps {
  columns: ColumnInfo[] | null;
  schemaStatus: 'idle' | 'loading' | 'loaded' | 'error';
  onColumnClick?: (col: ColumnInfo) => void;
  columnStats: ColumnStats | null;
  columnStatsLoading: boolean;
  files: RegisteredFile[];
  onAddFile: () => void;
  onRemoveFile: (id: string) => void;
  onChangeAlias: (id: string, alias: string) => void;
  onChangeUrl: (id: string, url: string) => void;
  onProbeFile: (id: string) => void;
}

const sectionLabelStyle: React.CSSProperties = {
  padding: '8px 12px 4px',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: 'var(--text-faint)',
  textTransform: 'uppercase',
};

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  margin: '4px 0',
};

const filterInputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-base)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  fontSize: '12px',
  padding: '4px 8px',
  borderRadius: 'var(--radius)',
  boxSizing: 'border-box',
  outline: 'none',
};

export function Sidebar({
  columns,
  schemaStatus,
  onColumnClick,
  columnStats,
  columnStatsLoading,
  files,
  onAddFile,
  onRemoveFile,
  onChangeAlias,
  onChangeUrl,
  onProbeFile,
}: SidebarProps) {
  const [filter, setFilter] = useState('');
  const colCount = columns?.length ?? 0;

  // Reset filter when the column set changes (new file loaded)
  useEffect(() => {
    setFilter('');
  }, [columns]);

  return (
    <div
      style={{
        width: 'var(--sidebar-width)',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflowY: 'auto',
      }}
    >
      <div style={sectionLabelStyle}>
        Columns{schemaStatus === 'loaded' ? ` (${colCount})` : ''}
      </div>

      {schemaStatus === 'loaded' && columns && columns.length > 0 && (
        <div style={{ padding: '0 8px 4px' }}>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter columns…"
            style={filterInputStyle}
          />
        </div>
      )}

      <SchemaTree
        columns={columns}
        status={schemaStatus}
        onColumnClick={onColumnClick}
        filter={filter}
      />

      <div style={dividerStyle} />

      <div style={sectionLabelStyle}>Files</div>
      <FilePanel
        files={files}
        onAdd={onAddFile}
        onRemove={onRemoveFile}
        onChangeAlias={onChangeAlias}
        onChangeUrl={onChangeUrl}
        onProbe={onProbeFile}
      />

      <ColumnStatsPanel stats={columnStats} loading={columnStatsLoading} />
    </div>
  );
}
```

- [ ] **Step 5.3: Run tests and confirm they pass**

```bash
pnpm test -- Sidebar
# Expected: all tests pass
```

- [ ] **Step 5.4: Run typecheck**

```bash
pnpm typecheck
# Expected: error in App.tsx — Sidebar now requires columnStats/columnStatsLoading props and changed onColumnClick sig; fixed in Task 6
```

- [ ] **Step 5.5: Commit**

```bash
git add src/ui/Sidebar.tsx src/ui/Sidebar.test.tsx
git commit -m "feat(ui): Sidebar — add filter input, pass filter to SchemaTree, render ColumnStatsPanel"
```

---

## Task 6: `src/App.tsx` — Wire handleColumnClick + Stats Dispatch

**Files:**

- Modify: `src/App.tsx`

### Background

`App.tsx` must:

1. Subscribe to `columnStats` and `columnStatsLoading` from the store.
2. Change `handleColumnClick` to accept `(col: ColumnInfo)` instead of `(columnName: string)`.
3. Inside `handleColumnClick`, insert `col.name` into the editor AND fire `fetchAndDispatchColumnStats(col)`.
4. Pass `columnStats` and `columnStatsLoading` to `<Sidebar>`.
5. Pass `onColumnClick` with the new `ColumnInfo` signature.

`fetchAndDispatchColumnStats` is a local async helper defined inside the component that dispatches `COLUMN_STATS_START`, then calls `fetchColumnStats(getEngine(), parquetURL, col)`, then dispatches `COLUMN_STATS_DONE` or `COLUMN_STATS_ERROR`.

There are no tests to add for `App.tsx` directly (it is exercised by the E2E suite). Run `pnpm typecheck` to verify correctness.

- [ ] **Step 6.1: Add imports to `App.tsx`**

Add to the existing import block at the top of `src/App.tsx`:

```ts
import { fetchColumnStats } from '@/engine/columnStats';
import type { ColumnInfo } from '@/state/queryState';
```

- [ ] **Step 6.2: Subscribe to new store fields in `App.tsx`**

After the line `const isOnline = useQueryStore((s) => s.isOnline);`, add:

```ts
const columnStats = useQueryStore((s) => s.columnStats);
const columnStatsLoading = useQueryStore((s) => s.columnStatsLoading);
```

- [ ] **Step 6.3: Replace `handleColumnClick` in `App.tsx`**

Replace the existing `handleColumnClick`:

```ts
const handleColumnClick = useCallback((columnName: string) => {
  editorRef.current?.insertAtCursor(columnName);
}, []);
```

With:

```ts
const handleColumnClick = useCallback(
  (col: ColumnInfo) => {
    editorRef.current?.insertAtCursor(col.name);

    async function fetchAndDispatchColumnStats() {
      if (!parquetURL) return;
      dispatch({ type: 'COLUMN_STATS_START' });
      try {
        const stats = await fetchColumnStats(getEngine(), parquetURL, col);
        dispatch({ type: 'COLUMN_STATS_DONE', stats });
      } catch {
        dispatch({ type: 'COLUMN_STATS_ERROR' });
      }
    }

    void fetchAndDispatchColumnStats();
  },
  [parquetURL, dispatch],
);
```

- [ ] **Step 6.4: Update `<Sidebar>` props in the JSX**

In the `<Sidebar>` JSX block, add the two new props and update `onColumnClick`:

```tsx
<Sidebar
  columns={schema}
  schemaStatus={schemaStatus}
  onColumnClick={handleColumnClick}
  columnStats={columnStats}
  columnStatsLoading={columnStatsLoading}
  files={files}
  onAddFile={() => filesDispatch({ type: 'ADD_FILE', id: crypto.randomUUID() })}
  onRemoveFile={handleRemoveFile}
  onChangeAlias={(id, alias) => filesDispatch({ type: 'UPDATE_FILE_ALIAS', id, alias })}
  onChangeUrl={(id, url) => filesDispatch({ type: 'UPDATE_FILE_URL', id, url })}
  onProbeFile={handleProbeFile}
/>
```

- [ ] **Step 6.5: Run typecheck — all errors must be resolved**

```bash
pnpm typecheck
# Expected: no errors
```

- [ ] **Step 6.6: Run the full test suite**

```bash
pnpm test
# Expected: all tests pass
# Key counts: columnStats.test.ts (8), ColumnStatsPanel.test.tsx (7), queryState.test.ts (existing + 4), SchemaTree.test.tsx (11), Sidebar.test.tsx (7)
```

- [ ] **Step 6.7: Run lint**

```bash
pnpm lint
# Expected: no errors or warnings
```

- [ ] **Step 6.8: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire handleColumnClick — insert column name + dispatch column stats fetch"
```

---

## Final Verification

- [ ] **Step V.1: Full suite clean pass**

```bash
pnpm typecheck && pnpm lint && pnpm test
# Expected: exit code 0
```

- [ ] **Step V.2: Smoke-test in dev browser**

```bash
pnpm dev
```

Manual checks:

1. Load a Parquet URL — schema appears in sidebar.
2. Type "id" in the filter input — only columns matching "id" appear; others are hidden.
3. Clear the filter — all columns reappear.
4. Load a new URL — filter input resets to empty automatically.
5. Click a column — the column name is inserted in the SQL editor AND a stats panel appears below the Files panel showing min/max/avg/nulls + histogram bar.
6. Click a VARCHAR column — stats panel shows min/max/nulls but no avg row.
7. Click another column while stats are loading — spinner appears briefly, then new stats replace them.

- [ ] **Step V.3: Final commit (if any cleanup needed)**

```bash
git add -p  # stage only intentional changes
git commit -m "chore(ui): post-review cleanup for iteration 2 schema sidebar"
```
