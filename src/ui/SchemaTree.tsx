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
