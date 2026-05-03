# Phase 5 Feature 4: Visual Query Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SchemaTree column rows and ResultsTable cells clickable so that clicking inserts the column name or a WHERE/AND filter expression at the cursor in the SQL editor.

**Architecture:** A new pure-function module `querySnippets.ts` handles all value formatting and WHERE/AND logic. `SQLEditor` gains an imperative `insertAtCursor` handle via `React.forwardRef` + `useImperativeHandle`. `SchemaTree` and `ResultsTable` each get an optional callback prop (`onColumnClick`, `onCellClick`). `App.tsx` holds the editor ref and wires both callbacks through it. No new state, no new stores.

**Tech Stack:** React 18 `forwardRef` + `useImperativeHandle`, CodeMirror 6 dispatch API, Vitest + `@testing-library/react`, Playwright E2E. TypeScript strict, `pnpm`.

---

## File Map

| File                                     | Action | Responsibility                                                                                                     |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| `src/util/querySnippets.ts`              | Create | `buildWhereClause(col, value, sql)` + private `formatValue(value)`                                                 |
| `src/util/querySnippets.test.ts`         | Create | 12 unit tests covering all value types and WHERE/AND branching                                                     |
| `src/ui/SQLEditor.tsx`                   | Modify | Export `SQLEditorHandle` interface; wrap with `forwardRef`; add `useImperativeHandle` exposing `insertAtCursor`    |
| `src/ui/SchemaTree.tsx`                  | Modify | Add optional `onColumnClick` prop; make column rows clickable with 300ms highlight; add `data-column` attr for E2E |
| `src/ui/SchemaTree.test.tsx`             | Modify | Add 2 tests: click fires callback with name; omitting prop causes no error                                         |
| `src/ui/ResultsTable.tsx`                | Modify | Add optional `onCellClick(columnName, value)` prop; add onClick + `cursor: pointer` to each `<td>`                 |
| `src/ui/ResultsTable.test.tsx`           | Create | 4 RTL tests: no-prop safe, number cell, string cell, null cell                                                     |
| `src/App.tsx`                            | Modify | Add `editorRef`, `handleColumnClick`, `handleCellClick`; pass to all three components                              |
| `tests/e2e/phase5-query-builder.spec.ts` | Create | Click column → name in editor; click cell → WHERE in editor                                                        |

---

## Task 1: `querySnippets.ts` — value formatting + WHERE/AND logic

**Files:**

- Create: `src/util/querySnippets.ts`
- Create: `src/util/querySnippets.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/util/querySnippets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildWhereClause } from './querySnippets';

const noWhere = "SELECT * FROM parquet_scan('x.parquet') LIMIT 100";
const withWhere = "SELECT * FROM parquet_scan('x.parquet') WHERE id = 1";

describe('buildWhereClause — keyword selection', () => {
  it('uses WHERE when no WHERE keyword in sql', () => {
    expect(buildWhereClause('id', 1, noWhere)).toMatch(/^WHERE /);
  });

  it('uses AND when WHERE already present', () => {
    expect(buildWhereClause('id', 2, withWhere)).toMatch(/^AND /);
  });

  it('WHERE detection is case-insensitive', () => {
    expect(buildWhereClause('id', 1, 'select * from t where x = 1')).toMatch(/^AND /);
  });
});

describe('buildWhereClause — value formatting', () => {
  it('formats null as IS NULL', () => {
    expect(buildWhereClause('col', null, noWhere)).toBe('WHERE col IS NULL');
  });

  it('formats undefined as IS NULL', () => {
    expect(buildWhereClause('col', undefined, noWhere)).toBe('WHERE col IS NULL');
  });

  it('formats integer as bare literal', () => {
    expect(buildWhereClause('col', 42, noWhere)).toBe('WHERE col = 42');
  });

  it('formats float as bare literal', () => {
    expect(buildWhereClause('col', 3.14, noWhere)).toBe('WHERE col = 3.14');
  });

  it('formats bigint as bare literal', () => {
    expect(buildWhereClause('col', BigInt(9007199254740993), noWhere)).toBe(
      'WHERE col = 9007199254740993',
    );
  });

  it('formats boolean true as bare literal', () => {
    expect(buildWhereClause('col', true, noWhere)).toBe('WHERE col = true');
  });

  it('formats boolean false as bare literal', () => {
    expect(buildWhereClause('col', false, noWhere)).toBe('WHERE col = false');
  });

  it('formats string as single-quoted', () => {
    expect(buildWhereClause('col', 'Paris', noWhere)).toBe("WHERE col = 'Paris'");
  });

  it('escapes interior single quotes in strings', () => {
    expect(buildWhereClause('col', "O'Brien", noWhere)).toBe("WHERE col = 'O''Brien'");
  });

  it('formats Date as single-quoted string', () => {
    const d = new Date('2024-01-15');
    const result = buildWhereClause('col', d, noWhere);
    expect(result).toMatch(/^WHERE col = '/);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test -- querySnippets`
Expected: FAIL — `buildWhereClause` not defined.

- [ ] **Step 3: Create `src/util/querySnippets.ts`**

```ts
function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return String(value);
  return "'" + String(value).replace(/'/g, "''") + "'";
}

export function buildWhereClause(columnName: string, value: unknown, existingSql: string): string {
  const keyword = /\bWHERE\b/i.test(existingSql) ? 'AND' : 'WHERE';
  const formatted = formatValue(value);
  const predicate = formatted === null ? `${columnName} IS NULL` : `${columnName} = ${formatted}`;
  return `${keyword} ${predicate}`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm test -- querySnippets`
Expected: all 12 tests pass.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/util/querySnippets.ts src/util/querySnippets.test.ts
git commit -m "feat(query-builder): querySnippets — buildWhereClause with value formatting"
```

---

## Task 2: `SQLEditor.tsx` — forwardRef + insertAtCursor handle

**Files:**

- Modify: `src/ui/SQLEditor.tsx`

- [ ] **Step 1: Replace `src/ui/SQLEditor.tsx` with the updated version**

```tsx
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';

interface SQLEditorProps {
  value: string;
  disabled: boolean;
  onChange: (sql: string) => void;
  onRun: () => void;
}

export interface SQLEditorHandle {
  insertAtCursor: (text: string) => void;
}

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

  useImperativeHandle(ref, () => ({
    insertAtCursor(text: string) {
      const view = viewRef.current;
      if (!view) return;
      const from = view.state.selection.main.from;
      view.dispatch({
        changes: { from, insert: text },
        selection: { anchor: from + text.length },
      });
      view.focus();
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

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

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          sql(),
          oneDark,
          keymap.of([...defaultKeymap, indentWithTab]),
          runKeymap,
          updateListener,
          editableCompartment.current.of(EditorView.editable.of(true)),
          EditorView.theme({
            '&': { height: '140px' },
            '.cm-scroller': { overflow: 'auto', fontFamily: 'monospace', fontSize: '13px' },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editableCompartment.current.reconfigure(EditorView.editable.of(!disabled)),
    });
  }, [disabled]);

  return (
    <div
      ref={containerRef}
      style={{ border: '1px solid #444', borderRadius: '4px', overflow: 'hidden' }}
      aria-label="SQL editor"
    />
  );
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. `SQLEditorHandle` is now exported; `forwardRef` typing is satisfied.

- [ ] **Step 3: Run all tests to confirm no regressions**

Run: `pnpm test`
Expected: all tests pass (SQLEditor has no unit tests; checking for import/type regressions).

- [ ] **Step 4: Commit**

```bash
git add src/ui/SQLEditor.tsx
git commit -m "feat(query-builder): SQLEditor forwardRef + insertAtCursor imperative handle"
```

---

## Task 3: `SchemaTree.tsx` — onColumnClick prop + highlight + tests

**Files:**

- Modify: `src/ui/SchemaTree.tsx`
- Modify: `src/ui/SchemaTree.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/SchemaTree.test.tsx` after the existing `describe` block:

```tsx
import { fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
```

Add these imports to the top of the file (merge with existing imports):

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
```

Append a new describe block at the bottom of `src/ui/SchemaTree.test.tsx`:

```tsx
describe('SchemaTree — onColumnClick', () => {
  it('calls onColumnClick with the column name when a row is clicked', () => {
    const onColumnClick = vi.fn();
    render(<SchemaTree columns={cols} status="loaded" onColumnClick={onColumnClick} />);
    fireEvent.click(screen.getByText('id'));
    expect(onColumnClick).toHaveBeenCalledWith('id');
  });

  it('does not throw when onColumnClick is omitted and a row is clicked', () => {
    render(<SchemaTree columns={cols} status="loaded" />);
    expect(() => fireEvent.click(screen.getByText('id'))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test -- SchemaTree`
Expected: FAIL — `onColumnClick` prop does not exist yet.

- [ ] **Step 3: Replace `src/ui/SchemaTree.tsx`**

```tsx
import { useState } from 'react';
import type { ColumnInfo } from '@/state/queryState';

interface SchemaTreeProps {
  columns: ColumnInfo[] | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  onColumnClick?: (columnName: string) => void;
}

export function SchemaTree({ columns, status, onColumnClick }: SchemaTreeProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null);

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

  function handleClick(name: string) {
    onColumnClick?.(name);
    setHighlighted(name);
    setTimeout(() => setHighlighted(null), 300);
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
        <div
          key={col.name}
          data-column={col.name}
          onClick={() => handleClick(col.name)}
          style={{
            display: 'flex',
            gap: '8px',
            padding: '2px 0',
            alignItems: 'baseline',
            cursor: onColumnClick ? 'pointer' : 'default',
            background: highlighted === col.name ? '#2a3a4a' : 'transparent',
            transition: 'background 0.15s',
            borderRadius: '2px',
          }}
        >
          <span style={{ color: '#9cdcfe' }}>{col.name}</span>
          <span style={{ color: '#888', fontSize: '12px' }}>{col.type}</span>
          {col.nullable && <span style={{ color: '#666', fontSize: '11px' }}>NULL</span>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm test -- SchemaTree`
Expected: all 7 tests pass (5 existing + 2 new).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/SchemaTree.tsx src/ui/SchemaTree.test.tsx
git commit -m "feat(query-builder): SchemaTree onColumnClick prop + 300ms highlight"
```

---

## Task 4: `ResultsTable.tsx` — onCellClick prop + tests

**Files:**

- Modify: `src/ui/ResultsTable.tsx`
- Create: `src/ui/ResultsTable.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/ui/ResultsTable.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ResultsTable } from '@/ui/ResultsTable';
import type { Batch } from '@/engine/types';

const batches: Batch[] = [
  {
    rows: [
      { id: 1, city: 'Paris' },
      { id: 2, city: 'Berlin' },
    ],
  },
];

describe('ResultsTable — onCellClick', () => {
  it('does not throw when onCellClick is omitted and a cell is clicked', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const cells = screen.getAllByRole('cell');
    expect(() => fireEvent.click(cells[0]!)).not.toThrow();
  });

  it('calls onCellClick with column name and number value', () => {
    const onCellClick = vi.fn();
    render(<ResultsTable batches={batches} rowCount={2} onCellClick={onCellClick} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.click(cells[0]!); // first cell: id=1
    expect(onCellClick).toHaveBeenCalledWith('id', 1);
  });

  it('calls onCellClick with column name and string value', () => {
    const onCellClick = vi.fn();
    render(<ResultsTable batches={batches} rowCount={2} onCellClick={onCellClick} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.click(cells[1]!); // second cell: city='Paris'
    expect(onCellClick).toHaveBeenCalledWith('city', 'Paris');
  });

  it('calls onCellClick with null for null values', () => {
    const nullBatches: Batch[] = [{ rows: [{ score: null }] }];
    const onCellClick = vi.fn();
    render(<ResultsTable batches={nullBatches} rowCount={1} onCellClick={onCellClick} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.click(cells[0]!);
    expect(onCellClick).toHaveBeenCalledWith('score', null);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test -- ResultsTable`
Expected: FAIL — `onCellClick` prop does not exist yet.

- [ ] **Step 3: Update `src/ui/ResultsTable.tsx`**

Replace the full file:

```tsx
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import type { Batch } from '@/engine/types';

const MAX_DISPLAY_ROWS = 500;

interface ResultsTableProps {
  batches: Batch[];
  rowCount: number;
  onCellClick?: (columnName: string, value: unknown) => void;
}

export function ResultsTable({ batches, rowCount, onCellClick }: ResultsTableProps) {
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
    return Object.keys(rows[0]!).map((key) => ({
      id: key,
      accessorFn: (row) => row[key],
      header: key,
      cell: (info) => {
        const v = info.getValue();
        return v == null ? <span style={{ color: '#888' }}>NULL</span> : String(v);
      },
    }));
  }, [rows]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (rows.length === 0) return null;

  const truncated = rowCount > MAX_DISPLAY_ROWS;

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {truncated && (
        <div style={{ padding: '4px 8px', fontSize: '12px', color: '#aaa', background: '#1a1a1a' }}>
          Showing first {MAX_DISPLAY_ROWS} of {rowCount.toLocaleString()} rows
        </div>
      )}
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  style={{
                    padding: '6px 10px',
                    textAlign: 'left',
                    borderBottom: '2px solid #444',
                    background: '#1e1e1e',
                    whiteSpace: 'nowrap',
                    position: 'sticky',
                    top: 0,
                  }}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <tr key={row.id} style={{ background: i % 2 === 0 ? '#141414' : '#181818' }}>
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  onClick={
                    onCellClick ? () => onCellClick(cell.column.id, cell.getValue()) : undefined
                  }
                  style={{
                    padding: '4px 10px',
                    borderBottom: '1px solid #2a2a2a',
                    whiteSpace: 'nowrap',
                    cursor: onCellClick ? 'pointer' : 'default',
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm test -- ResultsTable`
Expected: all 4 tests pass.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ResultsTable.tsx src/ui/ResultsTable.test.tsx
git commit -m "feat(query-builder): ResultsTable onCellClick prop + unit tests"
```

---

## Task 5: `App.tsx` — wire editorRef + click handlers

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports to `src/App.tsx`**

Change the existing `SQLEditor` import line from:

```ts
import { SQLEditor } from '@/ui/SQLEditor';
```

to:

```ts
import { SQLEditor, type SQLEditorHandle } from '@/ui/SQLEditor';
import { buildWhereClause } from '@/util/querySnippets';
```

- [ ] **Step 2: Add `editorRef` and handlers inside the component**

After the existing `const cancelRef = useRef<...>` line, add:

```ts
const editorRef = useRef<SQLEditorHandle>(null);
```

After the existing `handleCancel` callback (around line 162), add:

```ts
const handleColumnClick = useCallback((columnName: string) => {
  editorRef.current?.insertAtCursor(columnName);
}, []);

const handleCellClick = useCallback(
  (columnName: string, value: unknown) => {
    editorRef.current?.insertAtCursor(buildWhereClause(columnName, value, queryText));
  },
  [queryText],
);
```

- [ ] **Step 3: Update the three JSX elements**

In the JSX return, update `<SQLEditor>` to pass the ref:

```tsx
<SQLEditor
  ref={editorRef}
  value={queryText}
  disabled={isExecuting}
  onChange={(sql) => dispatch({ type: 'SET_QUERY', sql })}
  onRun={handleRun}
/>
```

Update `<SchemaTree>` to pass `onColumnClick`:

```tsx
<SchemaTree columns={schema} status={schemaStatus} onColumnClick={handleColumnClick} />
```

Update `<ResultsTable>` to pass `onCellClick`:

```tsx
<ResultsTable batches={results} rowCount={rowCount} onCellClick={handleCellClick} />
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Run all tests to confirm no regressions**

Run: `pnpm test`
Expected: all tests pass (154+ tests across 20 files).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(query-builder): wire editorRef, handleColumnClick, handleCellClick in App"
```

---

## Task 6: E2E tests

**Files:**

- Create: `tests/e2e/phase5-query-builder.spec.ts`

- [ ] **Step 1: Write the E2E tests**

Create `tests/e2e/phase5-query-builder.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const FIXTURE_URL = 'http://localhost:5173/fixtures/tiny.parquet';

test.describe('Phase 5 — visual query builder', () => {
  test('clicking a schema column inserts its name into the SQL editor', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /^load$/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30_000 });

    // Read the first column name from the data attribute and click its row.
    const firstRow = page.getByLabel('Schema tree').locator('[data-column]').first();
    const colName = await firstRow.getAttribute('data-column');
    await firstRow.click();

    // The column name should now appear in the editor content.
    await expect(page.locator('.cm-content')).toContainText(colName!, { timeout: 5_000 });
  });

  test('clicking a result cell inserts a WHERE filter into the SQL editor', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Parquet file URL').fill(FIXTURE_URL);
    await page.getByRole('button', { name: /^load$/i }).click();
    await expect(page.getByLabel('Schema tree')).toBeVisible({ timeout: 30_000 });

    // Run the default query to populate the results table.
    await page.getByRole('button', { name: /run query/i }).click();
    await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });

    // Click the first data cell in the results table.
    await page.getByRole('table').locator('tbody tr:first-child td:first-child').click();

    // The editor should now contain a WHERE or AND clause.
    await expect(page.locator('.cm-content')).toContainText(/WHERE|AND/i, { timeout: 5_000 });
  });
});
```

- [ ] **Step 2: Run on chromium**

Run: `npx playwright test --project=chromium tests/e2e/phase5-query-builder.spec.ts`
Expected: both tests pass.

- [ ] **Step 3: Run on firefox**

Run: `npx playwright test --project=firefox tests/e2e/phase5-query-builder.spec.ts`
Expected: both tests pass.

- [ ] **Step 4: Run full E2E suite to confirm no regressions**

Run: `npx playwright test --project=chromium && npx playwright test --project=firefox`
Expected: all prior phase tests still pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/phase5-query-builder.spec.ts
git commit -m "test(e2e): Phase 5 visual query builder — column click + cell click"
```

---

## Final Verification

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — all pass
- [ ] `npx playwright test --project=chromium` — all pass
- [ ] `npx playwright test --project=firefox` — all pass

---

## Self-Review

**Spec coverage:**

- ✅ Column click → insert at cursor — Task 3 (SchemaTree) + Task 5 (App wiring)
- ✅ 300ms highlight on clicked column — Task 3 `highlighted` state + `setTimeout`
- ✅ Cell click → WHERE/AND filter — Task 1 (logic) + Task 4 (ResultsTable) + Task 5 (App wiring)
- ✅ Smart WHERE vs AND — Task 1 `buildWhereClause` + `/\bWHERE\b/i` regex
- ✅ Value type formatting (null, number, bigint, boolean, string) — Task 1 `formatValue`
- ✅ `cursor: pointer` on hover for both surfaces — Task 3 + Task 4
- ✅ `insertAtCursor` via `forwardRef` + `useImperativeHandle` — Task 2
- ✅ `data-column` attribute for E2E testability — Task 3
- ✅ E2E: column click + cell click — Task 6

**Type consistency:**

- `SQLEditorHandle.insertAtCursor(text: string): void` — defined Task 2, used Task 5
- `onColumnClick: (columnName: string) => void` — defined Task 3, wired Task 5
- `onCellClick: (columnName: string, value: unknown) => void` — defined Task 4, wired Task 5
- `buildWhereClause(columnName: string, value: unknown, existingSql: string): string` — defined Task 1, used Task 5

**No placeholders found.**
