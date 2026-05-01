# Visual Query Builder — Design Spec

**Date:** 2026-04-30
**Status:** Approved
**Phase:** Phase 5 Feature 4 (optional)

---

## Goal

Turn the existing SchemaTree and ResultsTable into interactive query-building surfaces. Clicking a column name inserts it at the cursor in the SQL editor; clicking a result cell inserts a WHERE/AND filter expression. No new panels, no mode switches — the feature is an invisible layer on top of what already exists.

---

## User Experience

### Interaction 1 — Schema column click

User clicks a column name in the SchemaTree panel. The column name is inserted at the current cursor position in the SQL editor. A 300ms highlight on the clicked row gives visual confirmation.

Example: cursor is between `SELECT` and `FROM` — clicking `city` inserts `city` there. Clicking `revenue` adds `revenue`. The user builds `SELECT city, revenue FROM ...` by clicking instead of typing.

### Interaction 2 — Results cell click

User clicks any data cell in the ResultsTable. A WHERE/AND filter expression is inserted at the cursor in the SQL editor.

Rules:

- If the current query contains no `WHERE` keyword (case-insensitive) → insert `WHERE col = val`
- If a `WHERE` already exists → insert `AND col = val`
- The value is formatted by type:
  - `null` / `undefined` → `col IS NULL`
  - `number` / `bigint` → bare literal (`col = 42`)
  - `boolean` → bare literal (`col = true`)
  - anything else (string, Date, etc.) → single-quoted, with interior single quotes escaped (`col = 'O''Brien'`)
- NULL header cells and NULL value cells (rendered as "NULL" in grey) produce the `IS NULL` form
- Cells have `cursor: pointer` on hover; a brief background flash confirms the click

---

## Architecture

### New file: `src/util/querySnippets.ts`

Pure functions, no side effects, fully unit-tested.

```ts
export function buildWhereClause(columnName: string, value: unknown, existingSql: string): string;
// Returns: "WHERE col = val" or "AND col = val" depending on existingSql
// Uses /\bWHERE\b/i to detect existing WHERE clause
```

Value formatting is handled by a private `formatValue(value: unknown): string` helper inside the same file.

### Modified: `src/ui/SQLEditor.tsx`

Wrap with `React.forwardRef` and expose an imperative handle:

```ts
export interface SQLEditorHandle {
  insertAtCursor: (text: string) => void;
}
```

`insertAtCursor` dispatches a CodeMirror transaction at `view.state.selection.main.from`, inserting the text and advancing the cursor to the end of the inserted text.

### Modified: `src/ui/SchemaTree.tsx`

Add optional prop:

```ts
onColumnClick?: (columnName: string) => void;
```

Each column row becomes clickable when the prop is present:

- `cursor: pointer` on hover
- On click: call `onColumnClick(col.name)`
- 300ms highlight: local `useState<string | null>(highlightedCol)`, cleared by `setTimeout`

### Modified: `src/ui/ResultsTable.tsx`

Add optional prop:

```ts
onCellClick?: (columnName: string, value: unknown) => void;
```

Each `<td>` gains `onClick` and `cursor: pointer` when the prop is present. The column name is already available via `cell.column.id` in TanStack Table's cell context. The raw value is `info.getValue()` (already used in the cell renderer — pass it through to the handler).

### Modified: `src/App.tsx`

```ts
const editorRef = useRef<SQLEditorHandle>(null);

// onColumnClick handler:
(columnName) => editorRef.current?.insertAtCursor(columnName)

// onCellClick handler:
(columnName, value) =>
  editorRef.current?.insertAtCursor(buildWhereClause(columnName, value, queryText))
```

`<SQLEditor ref={editorRef} ... />`

---

## File Map

| File                                     | Action | Responsibility                                                    |
| ---------------------------------------- | ------ | ----------------------------------------------------------------- |
| `src/util/querySnippets.ts`              | Create | `buildColumnInsert`, `buildWhereClause`, `formatValue` (private)  |
| `src/util/querySnippets.test.ts`         | Create | Unit tests for all formatting branches + WHERE/AND logic          |
| `src/ui/SQLEditor.tsx`                   | Modify | `forwardRef` + `SQLEditorHandle` with `insertAtCursor`            |
| `src/ui/SchemaTree.tsx`                  | Modify | `onColumnClick` prop + highlight state                            |
| `src/ui/SchemaTree.test.tsx`             | Modify | Add tests: click fires callback, highlight appears                |
| `src/ui/ResultsTable.tsx`                | Modify | `onCellClick` prop, `cursor: pointer` on cells                    |
| `src/ui/ResultsTable.test.tsx`           | Create | Click fires callback with correct column name + value             |
| `src/App.tsx`                            | Modify | `editorRef`, wire `onColumnClick` and `onCellClick`               |
| `tests/e2e/phase5-query-builder.spec.ts` | Create | Click column → text appears in editor; click cell → WHERE appears |

---

## Testing Strategy

**Unit (`querySnippets.test.ts`):** All branches of `buildWhereClause` — null, number, bigint, boolean, string with quotes, no-WHERE query, query-with-WHERE. ~12 tests.

**RTL (`SchemaTree.test.tsx` additions):** Click a column row → `onColumnClick` called with correct name; visual highlight class/style present immediately after click.

**RTL (`ResultsTable.test.tsx`):** Render a batch with known rows; click a cell → `onCellClick` called with `(columnName, value)`.

**RTL (`SQLEditor` — no new tests needed):** `forwardRef` is plumbing; behaviour tested in E2E.

**E2E (`phase5-query-builder.spec.ts`):**

1. Load a Parquet file, wait for schema → click a column → editor contains column name
2. Run a query → click a result cell → editor contains `WHERE col = val`

---

## Out of Scope

- Drag-and-drop columns
- Type-aware aggregate snippets (SUM, AVG, DATE_TRUNC)
- Multi-select (hold Shift to select multiple columns)
- Query history / undo grouping
- Autocomplete integration (CodeMirror lang-sql already provides basic completion)
- Visual display of active filters
