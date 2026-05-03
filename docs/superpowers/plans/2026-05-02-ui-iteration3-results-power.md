# UI Overhaul Iteration 3 — Results Table Power Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade ResultsTable into a full data exploration surface with sortable columns, global row filter, one-click copy chip per cell, and CSV/JSON export — all client-side, no new queries fired.

**Architecture:** `src/util/exportResults.ts` provides pure `exportCSV` and `exportJSON` functions (Blob + anchor download). `ResultsTable.tsx` is extended with three new pieces of TanStack Table state (`sorting`, `globalFilter`, `hoveredCellId`) and a `ResultsToolbar` inline section (filter input + row count label + export buttons). The `_rownum` column is explicitly excluded from sorting; row numbers always reflect the sorted/filtered view index. All new state resets via `useEffect` when `batches` changes.

**Tech Stack:** React 18, TypeScript strict, TanStack Table v8, CSS custom properties, Vitest + @testing-library/react, pnpm.

---

## File Map

| File                             | Action | Responsibility                                                                        |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `src/util/exportResults.ts`      | Create | `exportCSV`, `exportJSON` — pure export functions, Blob + anchor download             |
| `src/util/exportResults.test.ts` | Create | CSV escaping, JSON output, filename format                                            |
| `src/ui/ResultsTable.tsx`        | Modify | Sorting, global filter, copy chip, results toolbar wired to export functions          |
| `src/ui/ResultsTable.test.tsx`   | Modify | Sort indicator renders; filter hides rows; copy chip visible on hover; export buttons |

---

## Task 1: `src/util/exportResults.ts` — Pure Export Functions

**Files:**

- Create: `src/util/exportResults.ts`
- Create: `src/util/exportResults.test.ts`

- [ ] **Step 1: Write failing tests first**

Create `src/util/exportResults.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportCSV, exportJSON } from '@/util/exportResults';

// Mock URL and DOM anchor APIs that don't exist in jsdom
beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Helper: capture the CSV string passed to Blob constructor
function captureCSV(rows: Record<string, unknown>[], filename: string): string {
  let captured = '';
  vi.spyOn(globalThis, 'Blob').mockImplementationOnce((parts) => {
    captured = (parts as string[])[0] ?? '';
    return new Blob(parts as BlobPart[]);
  });
  // Stub anchor click so no real DOM interaction
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor as unknown as HTMLElement);
  vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => anchor as unknown as Node);
  exportCSV(rows, filename);
  return captured;
}

function captureJSON(rows: Record<string, unknown>[], filename: string): string {
  let captured = '';
  vi.spyOn(globalThis, 'Blob').mockImplementationOnce((parts) => {
    captured = (parts as string[])[0] ?? '';
    return new Blob(parts as BlobPart[]);
  });
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor as unknown as HTMLElement);
  vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => anchor as unknown as Node);
  exportJSON(rows, filename);
  return captured;
}

describe('exportCSV', () => {
  it('generates a header row from object keys', () => {
    const csv = captureCSV([{ id: 1, city: 'Paris' }], 'out.csv');
    const lines = csv.split('\n');
    expect(lines[0]).toBe('id,city');
  });

  it('generates a data row with values', () => {
    const csv = captureCSV([{ id: 1, city: 'Paris' }], 'out.csv');
    const lines = csv.split('\n');
    expect(lines[1]).toBe('1,Paris');
  });

  it('double-quotes values that contain commas', () => {
    const csv = captureCSV([{ name: 'Smith, John' }], 'out.csv');
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"Smith, John"');
  });

  it('escapes interior double-quotes by doubling them', () => {
    const csv = captureCSV([{ note: 'say "hi"' }], 'out.csv');
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"say ""hi"""');
  });

  it('double-quotes values that contain newlines', () => {
    const csv = captureCSV([{ text: 'line1\nline2' }], 'out.csv');
    const lines = csv.split('\n');
    // entire field is quoted
    expect(lines[1]!.startsWith('"')).toBe(true);
  });

  it('renders null as empty string', () => {
    const csv = captureCSV([{ val: null }], 'out.csv');
    const lines = csv.split('\n');
    expect(lines[1]).toBe('');
  });

  it('uses the provided filename for the download anchor', () => {
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => anchor as unknown as Node);
    exportCSV([{ x: 1 }], 'query-results-12345.csv');
    expect(anchor.download).toBe('query-results-12345.csv');
  });
});

describe('exportJSON', () => {
  it('produces a pretty-printed JSON array', () => {
    const json = captureJSON([{ id: 1, city: 'Paris' }], 'out.json');
    const parsed = JSON.parse(json) as unknown[];
    expect(parsed).toHaveLength(1);
    expect((parsed[0] as Record<string, unknown>)['city']).toBe('Paris');
  });

  it('round-trips null values', () => {
    const json = captureJSON([{ score: null }], 'out.json');
    const parsed = JSON.parse(json) as unknown[];
    expect((parsed[0] as Record<string, unknown>)['score']).toBeNull();
  });

  it('uses the provided filename for the download anchor', () => {
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => anchor as unknown as Node);
    exportJSON([{ x: 1 }], 'query-results-99999.json');
    expect(anchor.download).toBe('query-results-99999.json');
  });
});
```

- [ ] **Step 2: Run to confirm all tests fail (module not found)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- exportResults 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '@/util/exportResults'`.

- [ ] **Step 3: Create `src/util/exportResults.ts`**

```ts
/**
 * Escapes a single CSV field value.
 * Values containing commas, double-quotes, or newlines are wrapped in double-quotes.
 * Interior double-quotes are doubled.
 */
function escapeCSVField(value: unknown): string {
  const str = value == null ? '' : String(value);
  const needsQuoting =
    str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r');
  if (!needsQuoting) return str;
  return '"' + str.replace(/"/g, '""') + '"';
}

/**
 * Exports rows as a CSV file download.
 * Header row is derived from the keys of the first row.
 * Uses Blob + temporary <a download> click.
 */
export function exportCSV(rows: Record<string, unknown>[], filename: string): void {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]!);
  const headerRow = headers.join(',');
  const dataRows = rows.map((row) => headers.map((h) => escapeCSVField(row[h])).join(','));
  const csv = [headerRow, ...dataRows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Exports rows as a pretty-printed JSON file download.
 * Uses Blob + temporary <a download> click.
 */
export function exportJSON(rows: Record<string, unknown>[], filename: string): void {
  if (rows.length === 0) return;

  const json = JSON.stringify(rows, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- exportResults 2>&1 | tail -10
```

Expected: all 10 tests pass.

- [ ] **Step 5: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/util/exportResults.ts src/util/exportResults.test.ts && git commit -m "feat(ui): exportCSV and exportJSON — pure Blob download helpers"
```

---

## Task 2: ResultsTable — Feature 1: Sortable Columns

**Files:**

- Modify: `src/ui/ResultsTable.tsx`

- [ ] **Step 1: Write the failing sort tests**

Append the following describe block to `src/ui/ResultsTable.test.tsx` (before the final closing brace of the file):

```tsx
describe('ResultsTable — sorting', () => {
  it('renders ⇅ sort indicator on data column headers by default', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const headers = screen.getAllByRole('columnheader');
    // headers[1] = 'id', headers[2] = 'city'
    expect(headers[1]).toHaveTextContent('⇅');
    expect(headers[2]).toHaveTextContent('⇅');
  });

  it('does NOT render a sort indicator on the # column', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const headers = screen.getAllByRole('columnheader');
    // headers[0] is the # column
    expect(headers[0]).not.toHaveTextContent('⇅');
    expect(headers[0]).not.toHaveTextContent('↑');
    expect(headers[0]).not.toHaveTextContent('↓');
  });

  it('shows ↑ on the id header after one click and sorts rows ascending', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const headers = screen.getAllByRole('columnheader');
    fireEvent.click(headers[1]!); // click 'id' header
    expect(headers[1]).toHaveTextContent('↑');
    const cells = screen.getAllByRole('cell');
    // First data row # cell should show 1 (id=1 is smallest, sorts first asc)
    expect(cells[0]).toHaveTextContent('1');
  });

  it('shows ↓ on the id header after two clicks', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const headers = screen.getAllByRole('columnheader');
    fireEvent.click(headers[1]!);
    fireEvent.click(headers[1]!);
    expect(headers[1]).toHaveTextContent('↓');
  });

  it('clears sort after three clicks and shows ⇅ again', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const headers = screen.getAllByRole('columnheader');
    fireEvent.click(headers[1]!);
    fireEvent.click(headers[1]!);
    fireEvent.click(headers[1]!);
    expect(headers[1]).toHaveTextContent('⇅');
  });
});
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- ResultsTable 2>&1 | tail -15
```

Expected: 5 new tests FAIL (sort indicator not found).

- [ ] **Step 3: Update `src/ui/ResultsTable.tsx` with sorting support**

Replace the entire file content:

```tsx
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState, useEffect } from 'react';
import type { Batch } from '@/engine/types';
import { exportCSV, exportJSON } from '@/util/exportResults';

const MAX_DISPLAY_ROWS = 500;

interface ResultsTableProps {
  batches: Batch[];
  rowCount: number;
  onCellClick?: (columnName: string, value: unknown) => void;
}

function renderCell(v: unknown): React.ReactNode {
  if (v == null) {
    return (
      <span style={{ color: 'var(--color-null)', fontStyle: 'italic', fontSize: '11px' }}>
        NULL
      </span>
    );
  }
  if (typeof v === 'boolean') {
    return (
      <span style={{ color: v ? 'var(--color-bool-t)' : 'var(--color-bool-f)' }}>{String(v)}</span>
    );
  }
  if (typeof v === 'number' || typeof v === 'bigint') {
    return <span style={{ color: 'var(--color-number)' }}>{String(v)}</span>;
  }
  if (Array.isArray(v)) {
    const str = '[' + (v as unknown[]).map(String).join(', ') + ']';
    const display = str.length > 60 ? str.slice(0, 60) + '…' : str;
    return <span style={{ color: 'var(--text-secondary)' }}>{display}</span>;
  }
  return String(v);
}

function getSortIcon(isSorted: false | 'asc' | 'desc'): React.ReactNode {
  if (isSorted === 'asc') {
    return <span style={{ color: 'var(--accent)', marginLeft: '4px', fontSize: '10px' }}>↑</span>;
  }
  if (isSorted === 'desc') {
    return <span style={{ color: 'var(--accent)', marginLeft: '4px', fontSize: '10px' }}>↓</span>;
  }
  return <span style={{ color: 'var(--text-faint)', marginLeft: '4px', fontSize: '10px' }}>⇅</span>;
}

export function ResultsTable({ batches, rowCount, onCellClick }: ResultsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [hoveredCellId, setHoveredCellId] = useState<string | null>(null);
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);

  // Reset sort and filter state when new results arrive
  useEffect(() => {
    setSorting([]);
    setGlobalFilter('');
  }, [batches]);

  const rows = useMemo(() => {
    const all: Record<string, unknown>[] = [];
    for (const batch of batches) {
      for (const row of batch.rows) {
        all.push(row);
        if (all.length >= MAX_DISPLAY_ROWS) return all;
      }
    }
    return all;
  }, [batches]);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (rows.length === 0) return [];

    const rowNumCol: ColumnDef<Record<string, unknown>> = {
      id: '_rownum',
      header: '#',
      cell: (info) => info.row.index + 1,
      enableSorting: false,
    };

    const dataCols = Object.keys(rows[0]!).map<ColumnDef<Record<string, unknown>>>((key) => ({
      id: key,
      accessorFn: (row) => row[key],
      header: key,
      cell: (info) => renderCell(info.getValue()),
    }));

    return [rowNumCol, ...dataCols];
  }, [rows]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
  });

  if (rows.length === 0) return null;

  const truncated = rowCount > MAX_DISPLAY_ROWS;
  const filteredRows = table.getRowModel().rows;
  const totalCount = table.getCoreRowModel().rows.length;
  const filteredCount = filteredRows.length;

  const visibleRowData = filteredRows.map((r) => r.original);
  const exportFilename = `query-results-${Date.now()}`;

  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 10px',
    background: 'var(--bg-elevated)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  };

  const filterInputStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    padding: '4px 10px',
    width: '220px',
    outline: 'none',
  };

  const countStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    flex: 1,
    whiteSpace: 'nowrap',
  };

  const exportBtnStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius)',
    fontSize: '11px',
    padding: '3px 8px',
    cursor: 'pointer',
  };

  return (
    <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
      {truncated && (
        <div
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          Showing first {MAX_DISPLAY_ROWS} of {rowCount.toLocaleString()} rows
        </div>
      )}

      {/* Results toolbar */}
      <div style={toolbarStyle}>
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Filter rows…"
          aria-label="Filter rows"
          style={filterInputStyle}
        />
        <span style={countStyle}>
          {globalFilter ? `${filteredCount} of ${totalCount}` : String(filteredCount)}{' '}
          {filteredCount === 1 ? 'row' : 'rows'}
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => exportCSV(visibleRowData, `${exportFilename}.csv`)}
            style={exportBtnStyle}
            aria-label="Export CSV"
          >
            ↓ CSV
          </button>
          <button
            onClick={() => exportJSON(visibleRowData, `${exportFilename}.json`)}
            style={exportBtnStyle}
            aria-label="Export JSON"
          >
            ↓ JSON
          </button>
        </div>
      </div>

      <div style={{ overflow: 'auto', flex: 1 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  return (
                    <th
                      key={h.id}
                      onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                      style={{
                        padding: '6px 10px',
                        textAlign: h.id === '_rownum' ? 'right' : 'left',
                        borderBottom: '2px solid var(--border)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        top: 0,
                        width: h.id === '_rownum' ? '48px' : undefined,
                        userSelect: 'none',
                        cursor: canSort ? 'pointer' : 'default',
                      }}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {canSort && getSortIcon(h.column.getIsSorted())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr key={row.id} style={{ background: i % 2 === 0 ? 'var(--bg-base)' : '#111520' }}>
                {row.getVisibleCells().map((cell) => {
                  const isRowNum = cell.column.id === '_rownum';
                  const val = cell.getValue();
                  const isNull = val == null;
                  const cellId = cell.id;
                  const isHovered = hoveredCellId === cellId;
                  const isCopied = copiedCellId === cellId;

                  const handleCopy = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    void navigator.clipboard.writeText(String(val ?? '')).then(() => {
                      setCopiedCellId(cellId);
                      setTimeout(() => setCopiedCellId(null), 1500);
                    });
                  };

                  return (
                    <td
                      key={cellId}
                      onMouseEnter={() => setHoveredCellId(cellId)}
                      onMouseLeave={() => setHoveredCellId(null)}
                      onClick={
                        !isRowNum && onCellClick
                          ? () => onCellClick(cell.column.id, val)
                          : undefined
                      }
                      style={{
                        padding: '4px 10px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        cursor: !isRowNum && onCellClick ? 'pointer' : 'default',
                        textAlign:
                          isRowNum || typeof val === 'number' || typeof val === 'bigint'
                            ? 'right'
                            : 'left',
                        color: isRowNum ? 'var(--text-faint)' : 'var(--text-primary)',
                        background: isNull ? 'rgba(55,65,81,0.15)' : undefined,
                        userSelect: isRowNum ? 'none' : undefined,
                        position: 'relative',
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      {!isRowNum && isHovered && (
                        <button
                          onClick={handleCopy}
                          aria-label="Copy cell value"
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '4px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            fontSize: '10px',
                            padding: '2px 5px',
                            borderRadius: 'var(--radius)',
                            cursor: 'pointer',
                          }}
                        >
                          {isCopied ? '✓' : 'Copy'}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run ResultsTable tests to confirm all prior tests + 5 new sort tests pass**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- ResultsTable 2>&1 | tail -20
```

Expected: all existing tests pass + 5 new sorting tests pass.

- [ ] **Step 5: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/ResultsTable.tsx && git commit -m "feat(ui): ResultsTable — sortable columns with ⇅/↑/↓ indicators"
```

---

## Task 3: ResultsTable — Feature 2: Global Row Filter

**Files:**

- Modify: `src/ui/ResultsTable.test.tsx`

(The implementation is already in place from Task 2. This task only adds + runs the filter tests.)

- [ ] **Step 1: Write failing filter tests**

Append to `src/ui/ResultsTable.test.tsx`:

```tsx
describe('ResultsTable — global filter', () => {
  it('renders the filter input with placeholder "Filter rows…"', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    expect(screen.getByPlaceholderText('Filter rows…')).toBeInTheDocument();
  });

  it('hides rows that do not match the filter', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const input = screen.getByPlaceholderText('Filter rows…');
    fireEvent.change(input, { target: { value: 'Paris' } });
    // 'Berlin' row should no longer be in the document
    expect(screen.queryByText('Berlin')).not.toBeInTheDocument();
    expect(screen.getByText('Paris')).toBeInTheDocument();
  });

  it('shows "1 of 2 rows" label when filter narrows results', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const input = screen.getByPlaceholderText('Filter rows…');
    fireEvent.change(input, { target: { value: 'Paris' } });
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
  });

  it('shows total row count with no "of" when filter is empty', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    // No filter: should show "2 rows" without "of"
    expect(screen.getByText(/^2 rows$/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm the 4 new filter tests pass (implementation already in place)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- ResultsTable 2>&1 | tail -20
```

Expected: all tests pass including the 4 new filter tests.

- [ ] **Step 3: Commit test additions**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/ResultsTable.test.tsx && git commit -m "test(ui): ResultsTable — global filter tests"
```

---

## Task 4: ResultsTable — Feature 3: Copy Cell Chip

**Files:**

- Modify: `src/ui/ResultsTable.test.tsx`

(The copy chip implementation is already in place from Task 2. This task adds + runs the copy chip tests.)

- [ ] **Step 1: Write failing copy chip tests**

Append to `src/ui/ResultsTable.test.tsx`:

```tsx
describe('ResultsTable — copy cell chip', () => {
  it('copy chip is not visible when no cell is hovered', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    // No "Copy" button should be in the document initially
    expect(screen.queryByRole('button', { name: /copy cell value/i })).not.toBeInTheDocument();
  });

  it('copy chip appears when a data cell is hovered', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const cells = screen.getAllByRole('cell');
    // cells[2] = 'Paris' (city column, row 1) — a non-rownum cell
    fireEvent.mouseEnter(cells[2]!);
    expect(screen.getByRole('button', { name: /copy cell value/i })).toBeInTheDocument();
  });

  it('copy chip is hidden when mouse leaves the cell', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.mouseEnter(cells[2]!);
    fireEvent.mouseLeave(cells[2]!);
    expect(screen.queryByRole('button', { name: /copy cell value/i })).not.toBeInTheDocument();
  });

  it('clicking Copy chip calls navigator.clipboard.writeText with the raw value', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<ResultsTable batches={batches} rowCount={2} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.mouseEnter(cells[2]!); // 'Paris' cell
    const copyBtn = screen.getByRole('button', { name: /copy cell value/i });
    fireEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith('Paris');
    vi.unstubAllGlobals();
  });

  it('copy chip does NOT appear on the # row-number cell', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.mouseEnter(cells[0]!); // # column cell
    expect(screen.queryByRole('button', { name: /copy cell value/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm all copy chip tests pass (implementation already in place)**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- ResultsTable 2>&1 | tail -20
```

Expected: all tests pass including the 5 new copy chip tests.

- [ ] **Step 3: Commit test additions**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/ResultsTable.test.tsx && git commit -m "test(ui): ResultsTable — copy chip visibility and clipboard tests"
```

---

## Task 5: ResultsTable — Feature 4: Export Buttons

**Files:**

- Modify: `src/ui/ResultsTable.test.tsx`

(The export buttons are already wired in Task 2. This task adds + runs the export button tests.)

- [ ] **Step 1: Write failing export button tests**

Append to `src/ui/ResultsTable.test.tsx`:

```tsx
describe('ResultsTable — export buttons', () => {
  it('renders ↓ CSV button when rows are present', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  it('renders ↓ JSON button when rows are present', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    expect(screen.getByRole('button', { name: /export json/i })).toBeInTheDocument();
  });

  it('does not render export buttons when there are no rows', () => {
    render(<ResultsTable batches={[]} rowCount={0} />);
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export json/i })).not.toBeInTheDocument();
  });

  it('calls exportCSV when ↓ CSV is clicked', () => {
    // Stub the Blob + URL APIs
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => anchor as unknown as Node);

    render(<ResultsTable batches={batches} rowCount={2} />);
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

    expect(anchor.click).toHaveBeenCalled();
    expect(anchor.download).toMatch(/query-results-\d+\.csv$/);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls exportJSON when ↓ JSON is clicked', () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => anchor as unknown as Node);

    render(<ResultsTable batches={batches} rowCount={2} />);
    fireEvent.click(screen.getByRole('button', { name: /export json/i }));

    expect(anchor.click).toHaveBeenCalled();
    expect(anchor.download).toMatch(/query-results-\d+\.json$/);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run to confirm all export button tests pass**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- ResultsTable 2>&1 | tail -20
```

Expected: all tests pass including the 5 new export tests.

- [ ] **Step 3: Commit test additions**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/ResultsTable.test.tsx && git commit -m "test(ui): ResultsTable — export CSV and JSON button tests"
```

---

## Final Verification

- [ ] **Run the full test suite**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck && pnpm lint && pnpm test 2>&1 | tail -20
```

Expected: typecheck clean, lint 0 warnings, all tests pass.

- [ ] **Confirm total test counts**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- ResultsTable exportResults 2>&1 | grep -E "Tests|passed|failed"
```

Expected summary:

- `exportResults.test.ts`: 10 tests pass
- `ResultsTable.test.tsx`: existing 12 + new 5 (sort) + 4 (filter) + 5 (copy) + 5 (export) = 31 tests pass

- [ ] **Manual smoke test**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm dev
```

Open `http://localhost:5174` in browser. Load a Parquet URL and run a query. Verify:

1. Toolbar renders above the table: filter input, row count label, ↓ CSV, ↓ JSON
2. Click a data column header — ↑ indicator appears, rows reorder
3. Click again — ↓ indicator, rows reverse
4. Click a third time — ⇅ indicator, original order restored
5. Click the `#` header — no sort, no indicator changes
6. Type in the filter input — only matching rows display; label shows "N of M rows"
7. Clear filter — all rows return; label shows "N rows"
8. Hover a data cell — Copy chip appears in top-right of cell
9. Click Copy chip — raw value is in clipboard; chip shows ✓ for ~1.5 seconds
10. Hover the `#` column cell — no Copy chip appears
11. Click ↓ CSV — a `.csv` file downloads; open it and confirm header + data rows correct
12. Click ↓ JSON — a `.json` file downloads; open it and confirm pretty-printed array

- [ ] **Push to GitHub**

```bash
cd /home/zenitsu/Desktop/wasm-db && git push
```

---

## Self-Review

**Spec coverage:**

- Feature 1 (Sortable Columns): `getSortedRowModel`, `SortingState`, `enableSorting: false` on `_rownum`, sort indicators ⇅/↑/↓ with correct colors, sort resets on new `batches` — Task 2 ✅
- Feature 2 (Global Filter): `getFilteredRowModel`, `globalFilterFn: 'includesString'`, filter input with correct styling, row count label "N of M rows" vs "N rows", filter resets on new `batches` — Task 2 ✅, tests Task 3 ✅
- Feature 3 (Copy Cell Chip): `position: absolute` button in `td` (`position: relative`), visible only on hover via `hoveredCellId` state, `navigator.clipboard.writeText`, ✓ for 1500ms, blocked on `_rownum` — Task 2 ✅, tests Task 4 ✅
- Feature 4 (Export): `exportCSV` + `exportJSON` in `src/util/exportResults.ts`, export buttons in toolbar, export uses `visibleRowData` (post sort+filter), filename `query-results-<timestamp>.<ext>` — Task 1 ✅, Task 2 ✅, tests Task 5 ✅
- Results Toolbar layout (filter input + count + export buttons) — Task 2 ✅
- TDD (write test → fail → implement → pass) — followed per task ✅
- `_rownum` column excluded from sorting via `enableSorting: false` ✅
- Row numbers reflect sorted order (`info.row.index + 1` from sorted `getRowModel`) ✅
- All new state resets on `batches` change via single `useEffect` ✅

**Type consistency:**

- `SortingState` imported from `@tanstack/react-table` ✅
- `getSortedRowModel`, `getFilteredRowModel` imported from `@tanstack/react-table` ✅
- `exportCSV(rows: Record<string, unknown>[], filename: string): void` — matches call site in ResultsTable ✅
- `exportJSON(rows: Record<string, unknown>[], filename: string): void` — matches call site in ResultsTable ✅
- `hoveredCellId: string | null` — `useState<string | null>(null)` ✅
- `copiedCellId: string | null` — `useState<string | null>(null)` ✅
- `visibleRowData: Record<string, unknown>[]` derived from `filteredRows.map((r) => r.original)` ✅
- `getSortIcon(isSorted: false | 'asc' | 'desc')` — return type matches `h.column.getIsSorted()` ✅

**No placeholders found.**
