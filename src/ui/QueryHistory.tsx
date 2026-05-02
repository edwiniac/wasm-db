import type { CSSProperties } from 'react';
import { useHistoryStore } from '@/state/historyStore';
import { relativeTime } from '@/util/relativeTime';

interface QueryHistoryProps {
  onSelect: (sql: string) => void;
}

const sectionLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px 4px',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: 'var(--text-faint)',
  textTransform: 'uppercase',
};

function truncatePreview(sql: string): string {
  const firstLine = sql.split('\n')[0] ?? sql;
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine;
}

export function QueryHistory({ onSelect }: QueryHistoryProps) {
  const entries = useHistoryStore((s) => s.entries);
  const clearHistory = useHistoryStore((s) => s.clearHistory);

  function handleClear() {
    if (window.confirm('Clear query history?')) clearHistory();
  }

  return (
    <div>
      <div style={sectionLabelStyle}>
        <span>History ({entries.length})</span>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            aria-label="Clear history"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '11px',
              padding: 0,
              textTransform: 'none',
              letterSpacing: 'normal',
            }}
          >
            Clear
          </button>
        )}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {entries.map((entry) => (
          <li
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(entry.sql)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(entry.sql);
            }}
            style={{
              padding: '5px 12px',
              cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
              listStyle: 'none',
              outline: 'none',
            }}
          >
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {truncatePreview(entry.sql)}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {entry.rowCount} rows · {relativeTime(entry.timestamp)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
