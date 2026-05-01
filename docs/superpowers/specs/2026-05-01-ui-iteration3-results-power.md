# UI Overhaul — Iteration 3: Results Table Power

**Date:** 2026-05-01
**Status:** Approved
**Depends on:** Iteration 1 (CSS variables, layout)

---

## Goal

Turn the results table into a full data exploration surface: sortable columns, global row filter, one-click cell copy, and CSV/JSON export. All operations are client-side — no new queries fired.

---

## Feature 1 — Sortable Columns

Clicking a result column header sorts the displayed rows ascending. Clicking again sorts descending. A third click clears the sort. Sort state is local to ResultsTable (`useState`) and resets when new results arrive (via `useEffect` watching `batches`).

TanStack Table already in use — enable via:

```ts
const table = useReactTable({
  data: rows,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(), // ADD
  state: { sorting },
  onSortingChange: setSorting,
});
```

Header cell renders a sort indicator:

- No sort: `⇅` in `--text-faint`
- Asc: `↑` in `--accent`
- Desc: `↓` in `--accent`

Header becomes `cursor: pointer`. Click calls `header.column.toggleSorting()`.

Row numbers (from Iteration 1) are recalculated after sort — they reflect the sorted order, not the original fetch order.

---

## Feature 2 — Global Row Filter

A search input above the results table (inside ResultsTable, not a new component). Filters all visible rows client-side — matches if ANY cell value contains the filter string (case-insensitive `String(value).toLowerCase().includes(term)`).

TanStack Table integration:

```ts
const table = useReactTable({
  ...
  getFilteredRowModel: getFilteredRowModel(),  // ADD
  globalFilter,
  onGlobalFilterChange: setGlobalFilter,
  globalFilterFn: 'includesString',
});
```

The input sits in a toolbar strip above the table:

```
[🔍 Filter rows…               ]  [100 rows · 42ms]  [↓ CSV]  [↓ JSON]
```

Input: `background: var(--bg-elevated)`, `border: 1px solid var(--border)`, `border-radius: var(--radius)`, `color: var(--text-primary)`, `font-size: 12px`, `padding: 4px 10px`, `width: 220px`. Placeholder: "Filter rows…".

Filter state resets (`setGlobalFilter('')`) via `useEffect` watching `batches`.

Row count label updates to show filtered count: "42 of 100 rows" when filter is active.

---

## Feature 3 — Copy Cell

Clicking a result cell already inserts a WHERE clause into the editor (`onCellClick` from Phase 5 Feature 4). This feature adds a **secondary action**: hovering a cell reveals a `Copy` chip in the top-right corner of the cell. Clicking the chip copies the raw cell value to the clipboard (`navigator.clipboard.writeText(String(value))`). It does NOT trigger `onCellClick`.

The chip is a `<button>` inside the `<td>`, `position: absolute` (td gets `position: relative`). Visible only on `td:hover` (via CSS class toggled with `useState<string | null>(hoveredCellId)`). The chip shows "Copy" normally and "✓" for 1500ms after a successful copy.

Chip styling: `background: var(--bg-elevated)`, `border: 1px solid var(--border)`, `color: var(--text-secondary)`, `font-size: 10px`, `padding: 2px 5px`, `border-radius: var(--radius)`, `position: absolute; top: 2px; right: 4px`.

**Right-click context menu is out of scope** — the Copy chip covers the copy-value use case.

---

## Feature 4 — Export Results

A results toolbar (same strip as the global filter) shows two export buttons: `↓ CSV` and `↓ JSON`. They export the currently visible rows (after sort + filter) — not all fetched rows.

### CSV export

```ts
function exportCSV(rows: Record<string, unknown>[], filename: string): void;
```

Builds a CSV string (header row + data rows). Values containing commas, quotes, or newlines are double-quoted with interior quotes escaped. Uses `URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))` and a temporary `<a download>` click. File name: `query-results-<timestamp>.csv`.

### JSON export

```ts
function exportJSON(rows: Record<string, unknown>[], filename: string): void;
```

`JSON.stringify(rows, null, 2)` — pretty-printed array of objects. Same Blob + anchor approach. File name: `query-results-<timestamp>.json`.

Both functions live in `src/util/exportResults.ts` — pure, no side effects beyond the DOM anchor click.

### New file: `src/util/exportResults.ts`

Exports: `exportCSV(rows, filename)`, `exportJSON(rows, filename)`.

---

## Results Toolbar

New internal component (`ResultsToolbar`) inside `ResultsTable.tsx` (not a separate file — small enough to live inline):

```tsx
// Rendered above the table when rows.length > 0
<div style={toolbarStyle}>
  <input ... placeholder="Filter rows…" />
  <span style={countStyle}>{filteredCount} {globalFilter ? `of ${totalCount} ` : ''}rows</span>
  <div style={{ display: 'flex', gap: '6px' }}>
    <button onClick={() => exportCSV(visibleRows, filename)}>↓ CSV</button>
    <button onClick={() => exportJSON(visibleRows, filename)}>↓ JSON</button>
  </div>
</div>
```

Button styling: `background: var(--bg-elevated)`, `border: 1px solid var(--border)`, `color: var(--text-secondary)`, `border-radius: var(--radius)`, `font-size: 11px`, `padding: 3px 8px`, `cursor: pointer`. Hover: border color `var(--accent)`.

---

## File Map

| File                             | Action | Responsibility                                                                                |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `src/util/exportResults.ts`      | Create | `exportCSV`, `exportJSON` — pure export functions                                             |
| `src/util/exportResults.test.ts` | Create | CSV escaping, JSON output, filename format                                                    |
| `src/ui/ResultsTable.tsx`        | Modify | Sorting, global filter, copy chip, results toolbar                                            |
| `src/ui/ResultsTable.test.tsx`   | Modify | Sort indicator renders; filter hides rows; copy chip visible on hover; export buttons present |

---

## Testing Strategy

**Unit (`exportResults.test.ts`):** CSV with commas in values; CSV with quotes; JSON round-trips; filename contains timestamp.

**RTL (`ResultsTable.test.tsx` additions):**

- Sort: clicking header once shows `↑`, data reorders; twice shows `↓`; row #1 changes value
- Filter: typing "Paris" hides rows that don't contain "Paris"; count label shows "1 of 2 rows"
- Copy chip: hovering a cell shows the chip; clicking it calls `navigator.clipboard.writeText`
- Export buttons: `↓ CSV` and `↓ JSON` buttons render when rows present

---

## Out of Scope

- Column-level filter (per-column filter inputs in headers)
- Pagination controls (virtual scroll handles large sets)
- Pinned/frozen columns
- Column reordering
- Chart/visualization of results
