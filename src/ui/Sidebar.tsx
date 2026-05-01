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
