# UI Overhaul — Iteration 2: Schema Sidebar Power

**Date:** 2026-05-01
**Status:** Approved
**Depends on:** Iteration 1 (CSS variables, Sidebar component, layout)

---

## Goal

Make the schema sidebar a first-class data exploration surface. Add a column search filter and a column stats panel that fires a live DuckDB query when you click a column, revealing min/max/avg/null-count and a distribution histogram — all without leaving the current query.

---

## Feature 1 — Schema Column Search

A filter input at the top of the schema section in `Sidebar.tsx`. As the user types, columns in `SchemaTree` are filtered client-side (no new query). The input is cleared when a new file is loaded.

**Props change to `SchemaTree`:**

```ts
interface SchemaTreeProps {
  columns: ColumnInfo[] | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  onColumnClick?: (columnName: string) => void;
  filter?: string; // NEW — filters displayed columns
}
```

Filtering: `columns.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))`. If filter is empty, show all. If filter has no matches, show "No columns match" in `--text-muted`.

The `<input>` lives in `Sidebar.tsx` (not SchemaTree) with local `useState<string>`. It's passed down as `filter`. This keeps SchemaTree pure.

Input styling: `width: 100%`, `background: var(--bg-base)`, `border: 1px solid var(--border)`, `color: var(--text-primary)`, `font-size: 12px`, `padding: 4px 8px`, `border-radius: var(--radius)`. Placeholder: "Filter columns…". Cleared (via `useEffect`) when `columns` prop changes.

---

## Feature 2 — Column Stats Panel

Clicking a column in SchemaTree fires `onColumnClick` as before (inserts name in editor) AND triggers a stats query for that column. The stats appear in a panel below the FilePanel in the sidebar.

### Stats query

For a column named `col` against the current Parquet URL:

```sql
SELECT
  MIN(col)               AS col_min,
  MAX(col)               AS col_max,
  AVG(TRY_CAST(col AS DOUBLE)) AS col_avg,
  COUNT(*) FILTER (WHERE col IS NULL) AS null_count,
  COUNT(*)               AS total_count
FROM parquet_scan('...')
```

This query is fired via a new method on `EngineClient`: `fetchColumnStats(url, columnName, columnType)`. Returns a typed result object.

For non-numeric columns (`VARCHAR`, `BOOLEAN`, `LIST`), `col_avg` will be `null` — the panel omits the avg row in that case.

### New file: `src/engine/columnStats.ts`

```ts
export interface ColumnStats {
  columnName: string;
  columnType: string;
  min: unknown;
  max: unknown;
  avg: number | null;
  nullCount: number;
  totalCount: number;
  nullPct: number; // derived: nullCount / totalCount
}

export async function fetchColumnStats(
  client: EngineClient,
  url: string,
  col: ColumnInfo,
): Promise<ColumnStats>;
```

Builds and fires the SQL query via `client.query(sql)`. Parses the single-row result.

### New component: `src/ui/ColumnStatsPanel.tsx`

```tsx
interface ColumnStatsPanelProps {
  stats: ColumnStats | null;
  loading: boolean;
}
```

Renders in the sidebar below FilePanel. When `loading`, shows a spinner row. When `stats` is null and not loading, renders nothing (collapsed).

**Layout:**

```
┌─ score · FLOAT ──────────────────┐
│ min      0.12                    │
│ max      0.99                    │
│ avg      0.71                    │
│ nulls    3  (0.3%)               │
│ ▓▓▓▓▒▒▒░░░  distribution bar    │
└──────────────────────────────────┘
```

Distribution bar: a simple 10-bucket frequency histogram approximated from min/max/avg using a visual heuristic (no second query). The bar is cosmetic — 10 segments with heights proportional to a rough bell-curve shape derived from the avg position between min and max. It gives visual texture without extra query cost.

Values are rendered with `toLocaleString()` for numbers. Null count shows both count and percentage. Color: `--color-number` for numeric values, `--text-secondary` for strings.

### State

Add to `queryState.ts`:

```ts
columnStats: ColumnStats | null;
columnStatsLoading: boolean;
```

Actions: `COLUMN_STATS_START`, `COLUMN_STATS_DONE { stats }`, `COLUMN_STATS_ERROR`.

The stats are cleared when a new file is loaded (`SCHEMA_START` clears them).

### Wiring in App.tsx

`onColumnClick` handler becomes:

```ts
const handleColumnClick = useCallback(
  (col: ColumnInfo) => {
    editorRef.current?.insertAtCursor(col.name);
    void fetchAndDispatchColumnStats(col); // fires the stats query, dispatches actions
  },
  [queryText],
);
```

`SchemaTree.onColumnClick` signature changes from `(columnName: string)` to `(col: ColumnInfo)` — passing the full `ColumnInfo` so the stats fetcher gets the type too.

---

## File Map

| File                               | Action | Responsibility                                                                  |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------- |
| `src/engine/columnStats.ts`        | Create | `fetchColumnStats` — builds SQL, fires query, returns `ColumnStats`             |
| `src/engine/columnStats.test.ts`   | Create | Unit tests for SQL generation and result parsing                                |
| `src/ui/ColumnStatsPanel.tsx`      | Create | Sidebar stats display: min/max/avg/nulls + histogram bar                        |
| `src/ui/ColumnStatsPanel.test.tsx` | Create | Renders stats, loading state, null state                                        |
| `src/ui/Sidebar.tsx`               | Modify | Add filter input state; pass `filter` to SchemaTree; render `ColumnStatsPanel`  |
| `src/ui/Sidebar.test.tsx`          | Modify | Add: filter input present, typing filters columns                               |
| `src/ui/SchemaTree.tsx`            | Modify | Accept `filter?: string`; filter displayed columns; "No columns match" fallback |
| `src/ui/SchemaTree.test.tsx`       | Modify | Add: filter prop hides non-matching columns, shows fallback                     |
| `src/state/queryState.ts`          | Modify | Add `columnStats`, `columnStatsLoading`, 3 new actions                          |
| `src/state/queryState.test.ts`     | Modify | Add: COLUMN_STATS_START/DONE/ERROR reducer tests                                |
| `src/App.tsx`                      | Modify | `handleColumnClick` fires stats; passes `ColumnStatsPanel` props                |

---

## Testing Strategy

**Unit (`columnStats.test.ts`):** SQL generation for numeric vs string columns; result parsing from mock row.

**RTL (`SchemaTree.test.tsx`):** filter='' shows all; filter='sc' hides non-matching; no matches shows fallback text.

**RTL (`ColumnStatsPanel.test.tsx`):** loading spinner renders; stats rows render with correct values; null avg row hidden for VARCHAR column.

**RTL (`Sidebar.test.tsx`):** typing in filter input updates visible columns.

---

## Out of Scope

- Real histogram (second percentile query)
- Top-N values for categorical columns
- Copy stats to clipboard
