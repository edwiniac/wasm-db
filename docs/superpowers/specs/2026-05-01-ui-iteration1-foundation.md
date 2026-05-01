# UI Overhaul — Iteration 1: Foundation & Layout

**Date:** 2026-05-01
**Status:** Approved
**Palette:** Obsidian (indigo/slate on near-black)
**Layout:** Classic IDE — fixed left sidebar, editor + results on the right

---

## Goal

Replace the current single-column inline-styled layout with a professional two-column IDE layout. Establish the Obsidian design system as CSS variables so every subsequent iteration can consume tokens instead of hardcoded hex values. Ship row-number column and null/type cell highlighting.

---

## Design System — CSS Variables

Add to `src/index.css` (root scope, no framework):

```css
:root {
  /* Background layers */
  --bg-base: #0f1117; /* page background */
  --bg-surface: #13161f; /* sidebar, panels */
  --bg-elevated: #1a1d27; /* topbar, status bar, table header */
  --bg-editor: #0d1117; /* CodeMirror editor */

  /* Borders */
  --border: #2a2d3e;

  /* Text */
  --text-primary: #e5e7eb;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;
  --text-faint: #4b5563;

  /* Accent */
  --accent: #7c85f3; /* indigo — primary action, highlights */
  --accent-dim: #7c85f320; /* accent with low opacity for bg */
  --accent-hover: #6366f1;

  /* Semantic */
  --color-number: #a5f3fc; /* cyan — numeric values */
  --color-null: #374151; /* grey — NULL cells */
  --color-bool-t: #4ade80; /* green — true */
  --color-bool-f: #f87171; /* red — false */
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-error: #f87171;

  /* Sizing */
  --sidebar-width: 240px;
  --topbar-height: 44px;
  --statusbar-height: 28px;
  --radius: 4px;
  --radius-lg: 6px;
}
```

All component `style={}` props that use hex colors must be migrated to these variables. New code must never use bare hex values.

---

## Layout

### App shell

`src/App.tsx` top-level structure becomes:

```
┌─────────────────────────────────────────────┐
│  Topbar (full width, --topbar-height)        │
├──────────────┬──────────────────────────────┤
│              │  DriftBanner (if visible)     │
│  Sidebar     │  SQLEditor                    │
│  240px fixed │  Run toolbar                  │
│              │  ErrorPanel (if error)        │
│  SchemaTree  │  ResultsTable (flex-1)        │
│  ──────────  │                               │
│  FilePanel   │                               │
├──────────────┴──────────────────────────────┤
│  StatusBar (full width, --statusbar-height)  │
└─────────────────────────────────────────────┘
```

Flex layout, `height: 100vh`, no scrolling on the outer shell — each pane scrolls internally.

---

## New Components

### `src/ui/Topbar.tsx`

Single horizontal bar containing everything that was split between URLInput + ShareButton div:

```tsx
interface TopbarProps {
  url: string;
  isProbing: boolean;
  onUrlChange: (url: string) => void;
  onLoad: () => void;
  onShare: () => void;
  shareLabel: string; // 'Copy link' | 'Copied!' | 'Copy failed'
}
```

Layout: `[⬡ wasm-db]  [──── url input ────]  [Load]  [Share]`

- Logo: `⬡ wasm-db` in `--accent`, font-weight 700
- URL input: `flex: 1`, background `--bg-base`, border `--border`
- Load button: background `--accent`, color white, border-radius `--radius`
- Share button: background `--bg-elevated`, color `--text-secondary`

### `src/ui/Sidebar.tsx`

Fixed-width left panel. Contains:

1. **Schema section** — header "COLUMNS (N)" label + `<SchemaTree>`
2. **Files section** — header "FILES" label + `<FilePanel>`

Each section header uses `--text-faint`, `font-size: 11px`, `letter-spacing: 0.08em`, uppercase.

Sidebar itself: `width: var(--sidebar-width)`, `background: var(--bg-surface)`, `border-right: 1px solid var(--border)`, `overflow-y: auto`, `flex-shrink: 0`.

---

## Modified Components

### `src/ui/ResultsTable.tsx`

**Row number column:** Prepend a non-clickable `#` column (`width: 48px`, `color: var(--text-faint)`, `text-align: right`, `user-select: none`). Row number = 1-based index in the current result set. Does not go through `onCellClick`.

**Null cell rendering:** When `v == null`, render:

```tsx
<span style={{ color: 'var(--color-null)', fontStyle: 'italic', fontSize: '11px' }}>NULL</span>
```

Cell background: `rgba(55,65,81,0.15)` (subtle, not the full --color-null).

**Boolean cell rendering:** `true` → `<span style={{ color: 'var(--color-bool-t)' }}>true</span>`, `false` → `<span style={{ color: 'var(--color-bool-f)' }}>false</span>`.

**Number cell rendering:** Detect `typeof v === 'number' || typeof v === 'bigint'` → right-align the cell (`text-align: right`), color `var(--color-number)`.

**Array cell rendering:** For values that are plain JS arrays (list columns like `VARCHAR[]`) → render as `[val1, val2, …]` in `--text-secondary`, truncated at 60 chars with `…` if longer.

**Table header:** `background: var(--bg-elevated)`, `color: var(--text-muted)`, `font-size: 11px`, `letter-spacing: 0.06em`, uppercase, `position: sticky; top: 0`.

**Row striping:** even rows `--bg-base`, odd rows `#111520` (current behaviour, keep).

### `src/ui/StatusBar.tsx`

Height `var(--statusbar-height)`. Background `var(--bg-elevated)`. Border-top `var(--border)`.

Layout: `[● N rows · Xms]  [⚡ spill]  [● offline]  [spacer]  [Cancel button if running]`

Row count and timing rendered in `--color-success` when done, `--text-muted` when idle.

### `src/ui/SchemaTree.tsx`

- Remove the outer `borderTop` (now handled by Sidebar section dividers)
- Column rows: `padding: 3px 8px`, hover background `var(--accent-dim)`
- Highlighted column: background `var(--accent-dim)`, left border `2px solid var(--accent)`
- Column name: `var(--accent)` → `var(--text-primary)` (less saturated — accent is reserved for interactive elements)
- Type badge: `var(--text-faint)`, `font-size: 11px`
- NULL badge: `var(--text-faint)`, `font-size: 10px`

### `src/ui/URLInput.tsx`

This component is replaced by Topbar — its logic (value, onChange, onProbe) is lifted into App.tsx and passed to Topbar. The file is deleted.

### `src/ui/ShareButton.tsx`

This component is replaced by Topbar — its logic (label, onClick) is lifted into App.tsx and passed to Topbar. The file is deleted.

---

## File Map

| File                           | Action | Responsibility                                                        |
| ------------------------------ | ------ | --------------------------------------------------------------------- |
| `src/index.css`                | Modify | Add Obsidian CSS variable system                                      |
| `src/ui/Topbar.tsx`            | Create | URL input + Load + Share in one bar                                   |
| `src/ui/Topbar.test.tsx`       | Create | Renders URL, fires onLoad, fires onShare                              |
| `src/ui/Sidebar.tsx`           | Create | Fixed sidebar shell — schema section + files section                  |
| `src/ui/Sidebar.test.tsx`      | Create | Renders SchemaTree and FilePanel, correct labels                      |
| `src/ui/URLInput.tsx`          | Delete | Logic absorbed into Topbar/App                                        |
| `src/ui/ShareButton.tsx`       | Delete | Logic absorbed into Topbar/App                                        |
| `src/ui/ResultsTable.tsx`      | Modify | Row numbers, null/bool/number/array cell rendering, CSS vars          |
| `src/ui/ResultsTable.test.tsx` | Modify | Add tests for each cell type rendering                                |
| `src/ui/SchemaTree.tsx`        | Modify | CSS vars, remove borderTop, hover/highlight styles                    |
| `src/ui/StatusBar.tsx`         | Modify | CSS vars, slim height, layout                                         |
| `src/App.tsx`                  | Modify | 2-column layout, Topbar + Sidebar + main pane, lifted URL/share logic |

---

## Testing Strategy

**RTL — Topbar:** renders logo, URL value, Load triggers onLoad, Share triggers onShare.

**RTL — Sidebar:** renders "COLUMNS" label with count, "FILES" label, passes through to SchemaTree and FilePanel.

**RTL — ResultsTable (additions):**

- Row `#` column renders 1-based numbers
- `null` value → renders "NULL" in italic
- `true` → green text, `false` → red text
- Number → right-aligned cyan text
- Array → `[…]` formatted string, truncated at 60 chars

**RTL — StatusBar:** existing tests still pass; row count and timing show correctly.

**E2E:** No new E2E test — existing phase tests cover the full load → query → results flow and will catch regressions.

---

## Out of Scope for Iteration 1

- Column search (Iteration 2)
- Column stats panel (Iteration 2)
- Sortable/filterable table (Iteration 3)
- Export (Iteration 3)
- Copy cell/row (Iteration 3)
- Format SQL (Iteration 4)
- Query history (Iteration 4)
- Keyboard shortcuts (Iteration 4)
- Resizable panels (not planned)
- Light mode
