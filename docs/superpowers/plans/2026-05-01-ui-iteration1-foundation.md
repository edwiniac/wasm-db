# UI Overhaul Iteration 1 — Foundation & Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline-styled single-column layout with a professional two-column IDE layout using an Obsidian CSS variable system, a unified Topbar, a fixed Sidebar, and richer ResultsTable cell rendering (row numbers, null/bool/number/array types).

**Architecture:** CSS variables in `index.css` become the single source of truth for all colors and sizing. `Topbar` absorbs `URLInput` + `ShareButton`. `Sidebar` wraps `SchemaTree` + `FilePanel` under section labels. `App.tsx` becomes a two-column flex shell. `ResultsTable` gains a prepended `#` row-number column and type-aware cell rendering. `URLInput.tsx` and `ShareButton.tsx` are deleted.

**Tech Stack:** React 18, TypeScript strict, CSS custom properties, TanStack Table v8, Vitest + @testing-library/react, pnpm.

---

## File Map

| File                           | Action | Responsibility                                                |
| ------------------------------ | ------ | ------------------------------------------------------------- |
| `src/index.css`                | Modify | Obsidian CSS variable system + reset `#root` to full-viewport |
| `src/ui/Topbar.tsx`            | Create | URL input + Load + Share in one bar                           |
| `src/ui/Topbar.test.tsx`       | Create | 5 RTL tests                                                   |
| `src/ui/Sidebar.tsx`           | Create | Fixed sidebar: schema section + files section labels          |
| `src/ui/Sidebar.test.tsx`      | Create | 3 RTL tests                                                   |
| `src/ui/URLInput.tsx`          | Delete | Logic absorbed into Topbar + App                              |
| `src/ui/ShareButton.tsx`       | Delete | Logic absorbed into Topbar + App                              |
| `src/App.tsx`                  | Modify | 2-col layout, Topbar + Sidebar, share state lifted in         |
| `src/ui/ResultsTable.tsx`      | Modify | Row # column, null/bool/number/array cell rendering, CSS vars |
| `src/ui/ResultsTable.test.tsx` | Modify | Tests for each cell type + row number                         |
| `src/ui/SchemaTree.tsx`        | Modify | CSS vars, remove borderTop, hover/highlight style             |
| `src/ui/StatusBar.tsx`         | Modify | CSS vars, slim height                                         |

---

## Task 1: CSS Variables — Obsidian Palette

**Files:**

- Modify: `src/index.css`

- [ ] **Step 1: Replace the CSS variable block and `#root` styles in `src/index.css`**

Replace the entire file content with:

```css
:root {
  /* Background layers */
  --bg-base: #0f1117;
  --bg-surface: #13161f;
  --bg-elevated: #1a1d27;
  --bg-editor: #0d1117;

  /* Borders */
  --border: #2a2d3e;

  /* Text */
  --text-primary: #e5e7eb;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;
  --text-faint: #4b5563;

  /* Accent */
  --accent: #7c85f3;
  --accent-dim: rgba(124, 133, 243, 0.12);
  --accent-hover: #6366f1;

  /* Semantic */
  --color-number: #a5f3fc;
  --color-null: #374151;
  --color-bool-t: #4ade80;
  --color-bool-f: #f87171;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-error: #f87171;

  /* Sizing */
  --sidebar-width: 240px;
  --topbar-height: 44px;
  --statusbar-height: 28px;
  --radius: 4px;
  --radius-lg: 6px;

  font-family: system-ui, 'Segoe UI', Roboto, sans-serif;
  color-scheme: dark;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg-base);
  color: var(--text-primary);
}

#root {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}
```

- [ ] **Step 2: Run typecheck to confirm no breakage**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/index.css && git commit -m "feat(ui): Obsidian CSS variable system + full-viewport root"
```

---

## Task 2: Topbar Component

**Files:**

- Create: `src/ui/Topbar.tsx`
- Create: `src/ui/Topbar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/ui/Topbar.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Topbar } from '@/ui/Topbar';

const defaultProps = {
  url: 'https://example.com/data.parquet',
  isProbing: false,
  onUrlChange: vi.fn(),
  onLoad: vi.fn(),
  onShare: vi.fn(),
  shareLabel: 'Share',
  shareDisabled: false,
};

describe('Topbar', () => {
  it('renders the URL value in the input', () => {
    render(<Topbar {...defaultProps} />);
    expect(screen.getByDisplayValue('https://example.com/data.parquet')).toBeInTheDocument();
  });

  it('calls onLoad when Load button is clicked', () => {
    const onLoad = vi.fn();
    render(<Topbar {...defaultProps} onLoad={onLoad} />);
    fireEvent.click(screen.getByRole('button', { name: /load/i }));
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it('calls onShare when Share button is clicked', () => {
    const onShare = vi.fn();
    render(<Topbar {...defaultProps} onShare={onShare} />);
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(onShare).toHaveBeenCalledOnce();
  });

  it('disables Load button and shows Probing… when isProbing', () => {
    render(<Topbar {...defaultProps} isProbing={true} />);
    expect(screen.getByRole('button', { name: /probing/i })).toBeDisabled();
  });

  it('renders custom shareLabel on the Share button', () => {
    render(<Topbar {...defaultProps} shareLabel="Copied!" />);
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- Topbar 2>&1 | tail -10
```

Expected: FAIL — `Topbar` not found.

- [ ] **Step 3: Create `src/ui/Topbar.tsx`**

```tsx
interface TopbarProps {
  url: string;
  isProbing: boolean;
  onUrlChange: (url: string) => void;
  onLoad: () => void;
  onShare: () => void;
  shareLabel: string;
  shareDisabled: boolean;
}

export function Topbar({
  url,
  isProbing,
  onUrlChange,
  onLoad,
  onShare,
  shareLabel,
  shareDisabled,
}: TopbarProps) {
  const loadDisabled = isProbing || !url.trim();
  const canShare = !shareDisabled && url.trim().length > 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 12px',
        height: 'var(--topbar-height)',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: 'var(--accent)',
          fontWeight: 700,
          fontSize: '15px',
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        ⬡ wasm-db
      </span>
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
      <button
        onClick={onLoad}
        disabled={loadDisabled}
        aria-busy={isProbing}
        aria-label={isProbing ? 'Probing…' : 'Load'}
        style={{
          padding: '5px 14px',
          background: loadDisabled ? 'var(--bg-surface)' : 'var(--accent)',
          color: loadDisabled ? 'var(--text-muted)' : '#fff',
          border: 'none',
          borderRadius: 'var(--radius)',
          fontSize: '13px',
          fontWeight: 600,
          cursor: loadDisabled ? 'default' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {isProbing ? 'Probing…' : 'Load'}
      </button>
      <button
        onClick={onShare}
        disabled={!canShare}
        aria-label={shareLabel}
        style={{
          padding: '5px 12px',
          background: 'var(--bg-surface)',
          color: canShare ? 'var(--text-secondary)' : 'var(--text-faint)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          fontSize: '12px',
          cursor: canShare ? 'pointer' : 'default',
          whiteSpace: 'nowrap',
        }}
      >
        {shareLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm all 5 pass**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- Topbar 2>&1 | tail -10
```

Expected: 5 tests pass.

- [ ] **Step 5: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/Topbar.tsx src/ui/Topbar.test.tsx && git commit -m "feat(ui): Topbar — URL input + Load + Share in one bar"
```

---

## Task 3: Sidebar Component

**Files:**

- Create: `src/ui/Sidebar.tsx`
- Create: `src/ui/Sidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/ui/Sidebar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar } from '@/ui/Sidebar';

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
};

describe('Sidebar', () => {
  it('renders COLUMNS section label', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText(/COLUMNS/i)).toBeInTheDocument();
  });

  it('renders FILES section label', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText(/FILES/i)).toBeInTheDocument();
  });

  it('renders SchemaTree inside (column name visible)', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('id')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- Sidebar 2>&1 | tail -10
```

Expected: FAIL — `Sidebar` not found.

- [ ] **Step 3: Create `src/ui/Sidebar.tsx`**

```tsx
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
  const colCount = columns?.length ?? 0;

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
      <SchemaTree columns={columns} status={schemaStatus} onColumnClick={onColumnClick} />

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
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm all 3 pass**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- Sidebar 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 5: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/Sidebar.tsx src/ui/Sidebar.test.tsx && git commit -m "feat(ui): Sidebar — schema + files sections with labels"
```

---

## Task 4: App.tsx — 2-Column Layout + Delete Old Components

**Files:**

- Modify: `src/App.tsx`
- Delete: `src/ui/URLInput.tsx`
- Delete: `src/ui/ShareButton.tsx`

- [ ] **Step 1: Replace `src/App.tsx` with the new layout**

Replace the entire file:

```tsx
import { useCallback, useRef, useEffect, useState } from 'react';
import { useQueryStore } from '@/state/store';
import {
  getEngine,
  getTransport,
  shutdownEngine,
  loadSchema,
  getSpillActive,
  registerFile,
  unregisterFile,
} from '@/state/queryService';
import { useFilesStore } from '@/state/filesStore';
import { AppError, TransportError, QueryError, QueryCancelledError } from '@/errors';
import { logger } from '@/util/logger';
import { decodeShareParams, computeFingerprint, encodeShareURL } from '@/util/sharing';
import { Topbar } from '@/ui/Topbar';
import { Sidebar } from '@/ui/Sidebar';
import { SQLEditor, type SQLEditorHandle } from '@/ui/SQLEditor';
import { buildWhereClause } from '@/util/querySnippets';
import { ResultsTable } from '@/ui/ResultsTable';
import { StatusBar } from '@/ui/StatusBar';
import { ErrorPanel } from '@/ui/ErrorPanel';
import { DriftBanner } from '@/ui/DriftBanner';
import type { QueryHandle } from '@/state/queryService';

export default function App() {
  const parquetURL = useQueryStore((s) => s.parquetURL);
  const queryText = useQueryStore((s) => s.queryText);
  const status = useQueryStore((s) => s.status);
  const results = useQueryStore((s) => s.results);
  const error = useQueryStore((s) => s.error);
  const rowCount = useQueryStore((s) => s.rowCount);
  const schema = useQueryStore((s) => s.schema);
  const schemaStatus = useQueryStore((s) => s.schemaStatus);
  const sharedFingerprint = useQueryStore((s) => s.sharedFingerprint);
  const schemaDrift = useQueryStore((s) => s.schemaDrift);
  const spillActive = useQueryStore((s) => s.spillActive);
  const isOnline = useQueryStore((s) => s.isOnline);
  const dispatch = useQueryStore((s) => s.dispatch);

  const files = useFilesStore((s) => s.files);
  const filesDispatch = useFilesStore((s) => s.filesDispatch);

  const cancelRef = useRef<(() => void) | null>(null);
  const probeAbortRef = useRef<AbortController | null>(null);
  const activeHandleRef = useRef<QueryHandle | null>(null);
  const editorRef = useRef<SQLEditorHandle>(null);

  const [shareLabel, setShareLabel] = useState('Share');

  useEffect(() => () => shutdownEngine(), []);

  useEffect(() => {
    const readyFiles = files.filter((f) => f.status === 'ready');
    for (const f of readyFiles) {
      void registerFile(f.alias, f.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProbe = useCallback(
    async (urlOverride?: string, storedFingerprint?: string | null) => {
      const targetURL = urlOverride ?? parquetURL;
      const fingerprintToCheck =
        storedFingerprint !== undefined ? storedFingerprint : sharedFingerprint;

      probeAbortRef.current?.abort();
      const controller = new AbortController();
      probeAbortRef.current = controller;
      dispatch({ type: 'PROBE_START' });
      try {
        await getTransport().probeURL(targetURL, controller.signal);
        dispatch({ type: 'PROBE_DONE' });
        dispatch({ type: 'SCHEMA_START' });
        loadSchema(targetURL)
          .then((columns) => {
            dispatch({ type: 'SCHEMA_DONE', columns });
            dispatch({ type: 'SET_SPILL_ACTIVE', active: getSpillActive() });
            if (fingerprintToCheck) {
              const live = computeFingerprint(columns);
              if (live !== fingerprintToCheck) dispatch({ type: 'SCHEMA_DRIFT_DETECTED' });
            }
          })
          .catch((err) => {
            logger.warn('Schema fetch failed', err);
            dispatch({ type: 'SCHEMA_ERROR' });
          });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        dispatch({
          type: 'ERROR',
          error: err instanceof AppError ? err : new TransportError(String(err)),
        });
      } finally {
        probeAbortRef.current = null;
      }
    },
    [parquetURL, sharedFingerprint, dispatch],
  );

  useEffect(() => {
    const { url, query, fingerprint } = decodeShareParams(window.location.hash);
    if (!url) return;
    dispatch({ type: 'SET_URL', url });
    if (query) dispatch({ type: 'SET_QUERY', sql: query });
    if (fingerprint) dispatch({ type: 'SET_SHARED_FINGERPRINT', fingerprint });
    void handleProbe(url, fingerprint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!parquetURL) return;
    const safe = parquetURL.replace(/'/g, "''");
    const next = queryText
      .replace('__URL__', safe)
      .replace(/parquet_scan\('[^']*'\)/g, () => `parquet_scan('${safe}')`);
    if (next !== queryText) dispatch({ type: 'SET_QUERY', sql: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parquetURL]);

  const handleRun = useCallback(async () => {
    activeHandleRef.current?.cancel();
    activeHandleRef.current = null;

    dispatch({ type: 'QUERY_START' });
    try {
      const handle = await getEngine().runQuery(queryText);
      activeHandleRef.current = handle;
      cancelRef.current = () => handle.cancel();
      let total = 0;
      for await (const batch of handle.stream) {
        dispatch({ type: 'BATCH_RECEIVED', batch });
        total += batch.rows.length;
      }
      dispatch({ type: 'QUERY_DONE', rowCount: total });
    } catch (err) {
      if (err instanceof QueryCancelledError) return;
      dispatch({
        type: 'ERROR',
        error: err instanceof AppError ? err : new QueryError(String(err)),
      });
    } finally {
      activeHandleRef.current = null;
      cancelRef.current = null;
    }
  }, [queryText, dispatch]);

  const handleCancel = useCallback(() => {
    probeAbortRef.current?.abort();
    activeHandleRef.current?.cancel();
    activeHandleRef.current = null;
    cancelRef.current = null;
    dispatch({ type: 'CANCEL' });
  }, [dispatch]);

  const handleColumnClick = useCallback((columnName: string) => {
    editorRef.current?.insertAtCursor(columnName);
  }, []);

  const handleCellClick = useCallback(
    (columnName: string, value: unknown) => {
      editorRef.current?.insertAtCursor(buildWhereClause(columnName, value, queryText));
    },
    [queryText],
  );

  const handleShare = useCallback(async () => {
    const liveFingerprint = schema ? computeFingerprint(schema) : null;
    const url = encodeShareURL(parquetURL, queryText, liveFingerprint);
    try {
      await navigator.clipboard.writeText(url);
      setShareLabel('Copied!');
    } catch {
      setShareLabel('Copy failed');
    }
    setTimeout(() => setShareLabel('Share'), 1500);
  }, [parquetURL, queryText, schema]);

  const handleProbeFile = useCallback(
    async (id: string) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;
      filesDispatch({ type: 'FILE_PROBE_START', id });
      try {
        const controller = new AbortController();
        await getTransport().probeURL(file.url, controller.signal);
        await registerFile(file.alias, file.url);
        filesDispatch({ type: 'FILE_PROBE_DONE', id });
      } catch {
        filesDispatch({ type: 'FILE_PROBE_ERROR', id });
      }
    },
    [files, filesDispatch],
  );

  const handleRemoveFile = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;
      if (file.status === 'ready') void unregisterFile(file.alias);
      filesDispatch({ type: 'REMOVE_FILE', id });
    },
    [files, filesDispatch],
  );

  const isExecuting = status === 'executing' || status === 'probing';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--bg-base)',
        color: 'var(--text-primary)',
        fontFamily: 'system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Top bar — full width */}
      <Topbar
        url={parquetURL}
        isProbing={status === 'probing'}
        onUrlChange={(url) => dispatch({ type: 'SET_URL', url })}
        onLoad={() => void handleProbe()}
        onShare={() => void handleShare()}
        shareLabel={shareLabel}
        shareDisabled={isExecuting}
      />

      {/* DriftBanner — full width, below topbar */}
      <DriftBanner visible={schemaDrift} onDismiss={() => dispatch({ type: 'DISMISS_DRIFT' })} />

      {/* Body: sidebar + main pane */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Sidebar */}
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
        />

        {/* Right: editor + results */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {/* SQL Editor */}
          <div
            style={{
              padding: '10px 12px 6px',
              background: 'var(--bg-editor)',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <SQLEditor
              ref={editorRef}
              value={queryText}
              disabled={isExecuting}
              onChange={(sql) => dispatch({ type: 'SET_QUERY', sql })}
              onRun={handleRun}
            />
          </div>

          {/* Run toolbar */}
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
                color: isExecuting ? 'var(--text-muted)' : '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isExecuting ? 'default' : 'pointer',
              }}
            >
              {status === 'executing' ? 'Running…' : '▶ Run'}
            </button>
          </div>

          {/* Error panel */}
          {error && <ErrorPanel error={error} />}

          {/* Results */}
          <ResultsTable batches={results} rowCount={rowCount} onCellClick={handleCellClick} />
        </div>
      </div>

      {/* Status bar — full width */}
      <StatusBar
        status={status}
        rowCount={rowCount}
        onCancel={handleCancel}
        spillActive={spillActive}
        isOnline={isOnline}
      />
    </div>
  );
}
```

- [ ] **Step 2: Delete the old single-responsibility files**

```bash
cd /home/zenitsu/Desktop/wasm-db && rm src/ui/URLInput.tsx src/ui/ShareButton.tsx
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -10
```

Fix any errors before continuing.

- [ ] **Step 4: Run all tests to confirm no regressions**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test 2>&1 | tail -10
```

Expected: all tests pass. (URLInput and ShareButton had no test files, so no test deletions needed.)

- [ ] **Step 5: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/App.tsx src/ui/URLInput.tsx src/ui/ShareButton.tsx && git commit -m "feat(ui): 2-column IDE layout — Topbar + Sidebar + main pane"
```

---

## Task 5: ResultsTable — Row Numbers + Cell Type Rendering

**Files:**

- Modify: `src/ui/ResultsTable.tsx`
- Modify: `src/ui/ResultsTable.test.tsx`

- [ ] **Step 1: Write the new failing tests**

Append to `src/ui/ResultsTable.test.tsx` after the existing describe block:

```tsx
describe('ResultsTable — row numbers', () => {
  it('renders a # column as the first column header', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]).toHaveTextContent('#');
  });

  it('renders 1-based row numbers in the # column', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    // cells: [# row1] [id row1] [city row1] [# row2] [id row2] [city row2]
    const cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('1');
    expect(cells[3]).toHaveTextContent('2');
  });

  it('does not fire onCellClick when the # cell is clicked', () => {
    const onCellClick = vi.fn();
    render(<ResultsTable batches={batches} rowCount={2} onCellClick={onCellClick} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.click(cells[0]!); // # cell
    expect(onCellClick).not.toHaveBeenCalled();
  });
});

describe('ResultsTable — cell type rendering', () => {
  it('renders null as italic NULL text', () => {
    const nullBatches: Batch[] = [{ rows: [{ score: null }] }];
    render(<ResultsTable batches={nullBatches} rowCount={1} />);
    expect(screen.getByText('NULL')).toBeInTheDocument();
  });

  it('renders boolean true with green color', () => {
    const boolBatches: Batch[] = [{ rows: [{ active: true }] }];
    render(<ResultsTable batches={boolBatches} rowCount={1} />);
    const trueEl = screen.getByText('true');
    expect(trueEl).toHaveStyle({ color: 'var(--color-bool-t)' });
  });

  it('renders boolean false with red color', () => {
    const boolBatches: Batch[] = [{ rows: [{ active: false }] }];
    render(<ResultsTable batches={boolBatches} rowCount={1} />);
    const falseEl = screen.getByText('false');
    expect(falseEl).toHaveStyle({ color: 'var(--color-bool-f)' });
  });

  it('renders array values as [item1, item2] string', () => {
    const arrBatches: Batch[] = [{ rows: [{ tags: ['ml', 'nlp'] }] }];
    render(<ResultsTable batches={arrBatches} rowCount={1} />);
    expect(screen.getByText('[ml, nlp]')).toBeInTheDocument();
  });

  it('truncates array display at 60 chars with ellipsis', () => {
    const longArr = Array.from({ length: 20 }, (_, i) => `item${i}`);
    const arrBatches: Batch[] = [{ rows: [{ tags: longArr }] }];
    render(<ResultsTable batches={arrBatches} rowCount={1} />);
    const cell = screen.getByText(/^\[item0/);
    expect(cell.textContent!.length).toBeLessThanOrEqual(62); // 60 + '…'
  });
});
```

Also update the existing onCellClick tests — they use `cells[0]` for the first data cell but now `cells[0]` is the `#` cell. Update them:

Find the three existing tests that click `cells[0]` and `cells[1]` and update the indices:

```tsx
// In "calls onCellClick with column name and number value":
fireEvent.click(cells[1]!); // was cells[0], now cells[1] because # column is prepended
expect(onCellClick).toHaveBeenCalledWith('id', 1);

// In "calls onCellClick with column name and string value":
fireEvent.click(cells[2]!); // was cells[1], now cells[2]
expect(onCellClick).toHaveBeenCalledWith('city', 'Paris');

// In "calls onCellClick with null for null values":
fireEvent.click(cells[1]!); // was cells[0], now cells[1]
expect(onCellClick).toHaveBeenCalledWith('score', null);
```

- [ ] **Step 2: Run to confirm the new tests fail**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- ResultsTable 2>&1 | tail -15
```

Expected: new tests FAIL; existing tests may also fail due to cell index shift.

- [ ] **Step 3: Replace `src/ui/ResultsTable.tsx`**

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

    const rowNumCol: ColumnDef<Record<string, unknown>> = {
      id: '_rownum',
      header: '#',
      cell: (info) => info.row.index + 1,
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
  });

  if (rows.length === 0) return null;

  const truncated = rowCount > MAX_DISPLAY_ROWS;

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
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
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
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
            <tr key={row.id} style={{ background: i % 2 === 0 ? 'var(--bg-base)' : '#111520' }}>
              {row.getVisibleCells().map((cell) => {
                const isRowNum = cell.column.id === '_rownum';
                const val = cell.getValue();
                const isNull = val == null;
                return (
                  <td
                    key={cell.id}
                    onClick={
                      !isRowNum && onCellClick ? () => onCellClick(cell.column.id, val) : undefined
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
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run all ResultsTable tests to confirm they pass**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test -- ResultsTable 2>&1 | tail -15
```

Expected: all tests pass (4 existing + 8 new = 12 total).

- [ ] **Step 5: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/ResultsTable.tsx src/ui/ResultsTable.test.tsx && git commit -m "feat(ui): ResultsTable — row numbers, null/bool/number/array cell rendering, CSS vars"
```

---

## Task 6: SchemaTree + StatusBar — CSS Vars + Style Updates

**Files:**

- Modify: `src/ui/SchemaTree.tsx`
- Modify: `src/ui/StatusBar.tsx`

- [ ] **Step 1: Replace `src/ui/SchemaTree.tsx`**

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

  function handleClick(name: string) {
    onColumnClick?.(name);
    setHighlighted(name);
    setTimeout(() => setHighlighted(null), 300);
  }

  return (
    <div aria-label="Schema tree" style={{ padding: '4px 0', fontSize: '12px' }}>
      {columns.map((col) => {
        const isHighlighted = highlighted === col.name;
        return (
          <div
            key={col.name}
            data-column={col.name}
            onClick={() => handleClick(col.name)}
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
      })}
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/ui/StatusBar.tsx`**

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
  const isDone = status === 'done';

  const label = isDone
    ? `${rowCount.toLocaleString()} row${rowCount !== 1 ? 's' : ''}`
    : LABEL[status];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '0 12px',
        height: 'var(--statusbar-height)',
        fontSize: '11px',
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        flexShrink: 0,
      }}
    >
      {inFlight && (
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: 'var(--accent)',
            display: 'inline-block',
            animation: 'pulse 1s ease-in-out infinite',
          }}
          aria-hidden
        />
      )}
      <span style={{ color: isDone ? 'var(--color-success)' : 'var(--text-muted)' }}>{label}</span>
      {spillActive && (
        <span
          style={{ color: 'var(--color-warning)', fontSize: '11px' }}
          title="DuckDB is using OPFS for temporary query data"
          aria-label="disk spill active"
        >
          ⚡ disk spill
        </span>
      )}
      {!isOnline && (
        <span
          role="status"
          style={{ color: 'var(--color-error)', fontSize: '11px' }}
          aria-label="offline"
        >
          ● offline
        </span>
      )}
      {inFlight && (
        <button
          onClick={onCancel}
          style={{
            marginLeft: 'auto',
            fontSize: '11px',
            padding: '2px 10px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
          aria-label="Cancel query"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run all tests to confirm SchemaTree + StatusBar tests still pass**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Typecheck**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
cd /home/zenitsu/Desktop/wasm-db && git add src/ui/SchemaTree.tsx src/ui/StatusBar.tsx && git commit -m "feat(ui): SchemaTree + StatusBar — CSS vars, Obsidian styles"
```

---

## Final Verification

- [ ] **Run full check**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm typecheck && pnpm lint && pnpm test 2>&1 | tail -15
```

Expected: typecheck clean, lint 0 warnings, all tests pass.

- [ ] **Manual smoke test**

```bash
cd /home/zenitsu/Desktop/wasm-db && pnpm dev
```

Open `http://localhost:5174` in browser. Verify:

- Full-viewport layout (no centered 1126px column)
- Topbar: logo, URL input, Load button, Share button
- Left sidebar: COLUMNS label, schema rows, FILES label, file panel
- Run a query: results table shows `#` column, numbers are cyan, NULLs are italic grey
- Status bar: slim, row count in green when done

- [ ] **Push to GitHub**

```bash
cd /home/zenitsu/Desktop/wasm-db && git push
```

---

## Self-Review

**Spec coverage:**

- ✅ CSS variables (Obsidian palette) — Task 1
- ✅ `#root` full-viewport reset — Task 1
- ✅ Topbar (URL + Load + Share) — Task 2
- ✅ Sidebar (schema + files sections with labels) — Task 3
- ✅ 2-column layout in App — Task 4
- ✅ URLInput.tsx deleted — Task 4
- ✅ ShareButton.tsx deleted — Task 4
- ✅ Share state lifted to App — Task 4
- ✅ Row number `#` column — Task 5
- ✅ Null cell rendering — Task 5
- ✅ Boolean cell rendering — Task 5
- ✅ Number cell rendering (cyan + right-align) — Task 5
- ✅ Array cell rendering — Task 5
- ✅ SchemaTree CSS vars + highlight style — Task 6
- ✅ StatusBar CSS vars + height — Task 6

**Type consistency:**

- `TopbarProps.shareDisabled: boolean` — defined Task 2, used Task 4 ✅
- `SidebarProps` types match `ColumnInfo` from `@/state/queryState` and `RegisteredFile` from `@/state/filesState` ✅
- `renderCell(v: unknown): React.ReactNode` — defined and used only in Task 5 ✅

**No placeholders found.**
