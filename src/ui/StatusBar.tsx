import type { QueryStatus } from '@/state/queryState';

interface StatusBarProps {
  status: QueryStatus;
  rowCount: number;
  onCancel: () => void;
  spillActive?: boolean;
}

const LABEL: Record<QueryStatus, string> = {
  idle: 'Ready',
  probing: 'Probing…',
  executing: 'Executing…',
  done: '',
  error: 'Error',
};

export function StatusBar({ status, rowCount, onCancel, spillActive }: StatusBarProps) {
  const inFlight = status === 'probing' || status === 'executing';
  const label =
    status === 'done'
      ? `${rowCount.toLocaleString()} row${rowCount !== 1 ? 's' : ''}`
      : LABEL[status];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 12px',
        fontSize: '12px',
        color: '#aaa',
        borderTop: '1px solid #2a2a2a',
        background: '#111',
      }}
    >
      {inFlight && (
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#4a9eff',
            display: 'inline-block',
            animation: 'pulse 1s ease-in-out infinite',
          }}
          aria-hidden
        />
      )}
      <span>{label}</span>
      {spillActive && (
        <span
          style={{ fontSize: '11px', color: '#7db9e8', marginLeft: '4px' }}
          title="DuckDB is using OPFS for temporary query data"
          aria-label="disk spill active"
        >
          ⚡ disk spill
        </span>
      )}
      {inFlight && (
        <button
          onClick={onCancel}
          style={{ marginLeft: 'auto', fontSize: '12px', padding: '2px 8px' }}
          aria-label="Cancel query"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
