import type { QueryStatus } from '@/state/queryState';

interface URLInputProps {
  value: string;
  status: QueryStatus;
  onChange: (url: string) => void;
  onProbe: () => void;
}

export function URLInput({ value, status, onChange, onProbe }: URLInputProps) {
  const isProbing = status === 'probing';

  return (
    <div style={{ display: 'flex', gap: '8px', padding: '12px' }}>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://example.com/data.parquet"
        disabled={isProbing}
        style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px', padding: '6px 10px' }}
        aria-label="Parquet file URL"
      />
      <button onClick={onProbe} disabled={isProbing || value.trim() === ''} aria-busy={isProbing}>
        {isProbing ? 'Probing…' : 'Load'}
      </button>
    </div>
  );
}
