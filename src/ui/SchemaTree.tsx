import { useState } from 'react';
import type { ColumnInfo } from '@/state/queryState';

interface SchemaTreeProps {
  columns: ColumnInfo[] | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  onColumnClick?: (col: ColumnInfo) => void;
  filter?: string;
}

export function SchemaTree({ columns, status, onColumnClick, filter }: SchemaTreeProps) {
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

  const lowerFilter = filter ? filter.toLowerCase() : '';
  const visible = lowerFilter
    ? columns.filter((c) => c.name.toLowerCase().includes(lowerFilter))
    : columns;

  function handleClick(col: ColumnInfo) {
    onColumnClick?.(col);
    setHighlighted(col.name);
    setTimeout(() => setHighlighted(null), 300);
  }

  return (
    <div
      aria-label="Schema tree"
      style={{
        padding: '4px 0',
        overflowY: 'auto',
        maxHeight: '200px',
        fontSize: '12px',
      }}
    >
      <div style={{ color: 'var(--text-muted)', padding: '3px 12px', fontSize: '11px' }}>
        Columns ({columns.length})
      </div>

      {visible.length === 0 && lowerFilter ? (
        <div style={{ padding: '6px 12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No columns match
        </div>
      ) : (
        visible.map((col) => {
          const isHighlighted = highlighted === col.name;
          return (
            <div
              key={col.name}
              data-column={col.name}
              onClick={() => handleClick(col)}
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
        })
      )}
    </div>
  );
}
