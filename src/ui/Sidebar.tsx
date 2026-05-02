import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { ColumnInfo } from '@/state/queryState';
import type { RegisteredFile } from '@/state/filesState';
import type { ColumnStats } from '@/engine/columnStats';
import { SchemaTree } from '@/ui/SchemaTree';
import { FilePanel } from '@/ui/FilePanel';
import { ColumnStatsPanel } from '@/ui/ColumnStatsPanel';
import { QueryHistory } from '@/ui/QueryHistory';

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
  onHistorySelect: (sql: string) => void;
}

const sectionLabelStyle: CSSProperties = {
  padding: '8px 12px 4px',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: 'var(--text-faint)',
  textTransform: 'uppercase',
};

const dividerStyle: CSSProperties = {
  borderTop: '1px solid var(--border)',
  margin: '4px 0',
};

const filterInputStyle: CSSProperties = {
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
  onHistorySelect,
}: SidebarProps) {
  const [filterState, setFilterState] = useState<{ columns: ColumnInfo[] | null; value: string }>({
    columns,
    value: '',
  });

  const filter = filterState.columns === columns ? filterState.value : '';

  function setFilter(value: string) {
    setFilterState({ columns, value });
  }

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
      <div style={sectionLabelStyle}>Columns</div>

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

      <div style={dividerStyle} />
      <QueryHistory onSelect={onHistorySelect} />
    </div>
  );
}
