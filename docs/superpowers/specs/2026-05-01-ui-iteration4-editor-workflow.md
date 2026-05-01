# UI Overhaul — Iteration 4: Editor & Workflow

**Date:** 2026-05-01
**Status:** Approved
**Depends on:** Iteration 1 (CSS variables, layout)

---

## Goal

Make the SQL editor feel like a real workbench: auto-format SQL with one click, persistent query history you can browse and restore, and a complete keyboard shortcut system with a discoverable cheatsheet.

---

## Feature 1 — Format SQL

A "Format" button in the editor toolbar (beside the Run button) that auto-prettifies the SQL in the editor using `sql-formatter`.

### Dependency

```bash
pnpm add sql-formatter
```

`sql-formatter` is ~35KB gzipped — within the 50KB dependency budget stated in CLAUDE.md.

### Implementation

```ts
// src/util/formatSql.ts
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

In App.tsx, a `handleFormatSql` callback calls `formatSql(queryText)` and dispatches `{ type: 'SET_QUERY', sql: formatted }`. The editor `value` prop updates, which triggers the CodeMirror sync `useEffect` in SQLEditor, replacing the editor content.

**Editor toolbar:**

```
[Format]  [▶ Run]
```

Format button: `background: var(--bg-elevated)`, `border: 1px solid var(--border)`, `color: var(--text-secondary)`. On hover, border `var(--accent)`. Keyboard shortcut: `Ctrl+Shift+F` / `Cmd+Shift+F`.

### Keyboard shortcut wiring

Add to the `runKeymap` in `SQLEditor.tsx`:

```ts
{
  key: 'Ctrl-Shift-f',
  mac: 'Cmd-Shift-f',
  run: () => { onFormatRef.current?.(); return true; },
}
```

`SQLEditor` gains a new prop `onFormat?: () => void` and a matching `onFormatRef`.

---

## Feature 2 — Query History

Every successfully executed query is saved to a persistent history list. The history is visible in a collapsible section in the sidebar (below FilePanel, above ColumnStatsPanel), showing up to 50 entries. Clicking any entry restores it to the editor.

### State

New Zustand store `src/state/historyStore.ts` (separate from `queryStore` to avoid polluting the query state shape):

```ts
interface HistoryEntry {
  id: string; // nanoid — unique, stable key
  sql: string;
  timestamp: number;
  rowCount: number;
}

interface HistoryState {
  entries: HistoryEntry[];
  addEntry: (sql: string, rowCount: number) => void;
  clearHistory: () => void;
}
```

Persisted via Zustand `persist` middleware to `localStorage` under key `wasm-db-history`. Capped at 50 entries — oldest entry dropped when limit is exceeded. Duplicate consecutive queries (same SQL after trimming) are not added again.

### New component: `src/ui/QueryHistory.tsx`

```tsx
interface QueryHistoryProps {
  onSelect: (sql: string) => void;
}
```

Collapsible section in the sidebar with header "HISTORY (N)". Each entry shows:

- First line of SQL, truncated to 60 chars
- Row count + relative time ("2 min ago", "yesterday")
- Click restores SQL to editor

Relative time uses a simple pure function `relativeTime(timestamp: number): string` in `src/util/relativeTime.ts`.

Entries are listed newest-first. A "Clear" link in the header clears all history after confirmation (no modal — just a `window.confirm`).

### Wiring

In App.tsx, inside the `handleRun` callback, after a successful query result:

```ts
useHistoryStore.getState().addEntry(queryText, result.rowCount);
```

`<QueryHistory onSelect={(sql) => dispatch({ type: 'SET_QUERY', sql })} />` rendered in Sidebar.

---

## Feature 3 — Keyboard Shortcuts

### Shortcuts implemented

| Shortcut                       | Action                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| `Ctrl+Enter` / `Cmd+Enter`     | Run query (already exists)                                      |
| `Ctrl+Shift+F` / `Cmd+Shift+F` | Format SQL (new)                                                |
| `Ctrl+L` / `Cmd+L`             | Focus URL input (new)                                           |
| `Escape`                       | Cancel running query (new, only when query running)             |
| `?`                            | Toggle shortcuts cheatsheet (new, only when editor not focused) |

### `Ctrl+L` — Focus URL

In `Topbar.tsx`, expose a ref on the URL `<input>` via `useImperativeHandle` or a DOM ref passed from App.tsx. In App.tsx, `useEffect` adds a `keydown` listener: if `Ctrl+L` / `Cmd+L` and not inside an input, call `urlInputRef.current?.focus()` and `urlInputRef.current?.select()`.

`Topbar` gains an optional `inputRef?: React.Ref<HTMLInputElement>` prop.

### `Escape` — Cancel

In App.tsx, `useEffect` adds a `keydown` listener: if `Escape` and `isExecuting`, call `handleCancel()`.

### `?` — Shortcuts cheatsheet

A minimal overlay (`position: fixed`, `inset: 0`, `background: rgba(0,0,0,0.7)`, `z-index: 100`) with a centred card listing all shortcuts. Toggled by `?` keypress when the editor is not focused. Dismissed by `Escape` or clicking outside.

New component: `src/ui/ShortcutsOverlay.tsx` — renders the overlay when `open` prop is true, accepts `onClose` prop.

---

## New Files

### `src/util/formatSql.ts`

Pure function wrapping `sql-formatter`. No side effects.

### `src/util/formatSql.test.ts`

Tests: keywords uppercased; indentation applied; invalid SQL passed through without throwing (sql-formatter is lenient).

### `src/util/relativeTime.ts`

Pure function: `relativeTime(timestamp: number): string`. Returns "just now" / "N min ago" / "N hours ago" / "yesterday" / date string. No external dependency.

### `src/util/relativeTime.test.ts`

Tests: <1min → "just now"; 5min → "5 min ago"; 25h → "yesterday"; 8d → date string.

### `src/state/historyStore.ts`

Zustand store with `persist`. Exports `useHistoryStore`.

### `src/state/historyStore.test.ts`

Tests: `addEntry` adds entry; duplicate consecutive SQL not added; capped at 50; `clearHistory` empties list.

### `src/ui/QueryHistory.tsx`

Sidebar history panel.

### `src/ui/QueryHistory.test.tsx`

Tests: renders entries; clicking entry fires `onSelect` with correct SQL; "Clear" button calls `clearHistory`.

### `src/ui/ShortcutsOverlay.tsx`

Keyboard shortcuts reference overlay.

### `src/ui/ShortcutsOverlay.test.tsx`

Tests: renders when `open=true`; hidden when `open=false`; `onClose` called on Escape.

---

## File Map

| File                               | Action | Responsibility                                                                       |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `src/util/formatSql.ts`            | Create | `formatSql(sql)` — sql-formatter wrapper                                             |
| `src/util/formatSql.test.ts`       | Create | Formatting output tests                                                              |
| `src/util/relativeTime.ts`         | Create | `relativeTime(timestamp)` — human-readable age                                       |
| `src/util/relativeTime.test.ts`    | Create | Time bucket tests                                                                    |
| `src/state/historyStore.ts`        | Create | Zustand history store with persist                                                   |
| `src/state/historyStore.test.ts`   | Create | addEntry, dedup, cap, clear                                                          |
| `src/ui/QueryHistory.tsx`          | Create | Sidebar history panel                                                                |
| `src/ui/QueryHistory.test.tsx`     | Create | Renders entries, onSelect, clear                                                     |
| `src/ui/ShortcutsOverlay.tsx`      | Create | `?` key cheatsheet overlay                                                           |
| `src/ui/ShortcutsOverlay.test.tsx` | Create | open/close behaviour                                                                 |
| `src/ui/SQLEditor.tsx`             | Modify | `onFormat` prop + `Ctrl+Shift+F` keymap entry                                        |
| `src/ui/Topbar.tsx`                | Modify | `inputRef` prop for `Ctrl+L` focus                                                   |
| `src/ui/Sidebar.tsx`               | Modify | Add QueryHistory section                                                             |
| `src/App.tsx`                      | Modify | `handleFormatSql`; history `addEntry` after run; `Ctrl+L`, Escape, `?` key listeners |

---

## Testing Strategy

**Unit:** `formatSql`, `relativeTime`, `historyStore` reducers — all pure, easy to test.

**RTL:**

- `QueryHistory`: entries list, click fires callback, clear works
- `ShortcutsOverlay`: renders table of shortcuts when open

**Integration:** `App.tsx` key listeners tested via `fireEvent.keyDown` on `document`.

---

## Out of Scope

- Multiple query editor tabs
- Named saved queries ("bookmarks")
- Query diffing / version history
- Vim keybindings
