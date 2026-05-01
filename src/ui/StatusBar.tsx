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
