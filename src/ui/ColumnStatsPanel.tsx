import type { ColumnStats } from '@/engine/columnStats';

interface ColumnStatsPanelProps {
  stats: ColumnStats | null;
  loading: boolean;
}

function buildHistogramHeights(stats: ColumnStats): number[] {
  const segments = 10;
  if (stats.avg === null) {
    return Array(segments).fill(8) as number[];
  }

  const minVal = typeof stats.min === 'number' ? stats.min : 0;
  const maxVal = typeof stats.max === 'number' ? stats.max : 1;
  const range = maxVal - minVal;
  const avgPos = range > 0 ? Math.max(0, Math.min(1, (stats.avg - minVal) / range)) : 0.5;

  const rawHeights = Array.from({ length: segments }, (_, i) => {
    const pos = i / (segments - 1);
    return Math.exp(-0.5 * ((pos - avgPos) / 0.25) ** 2);
  });

  const maxH = Math.max(...rawHeights);
  const minH = Math.min(...rawHeights);
  const span = maxH - minH || 1;

  return rawHeights.map((h) => Math.round(2 + ((h - minH) / span) * 12));
}

const panelStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  padding: '8px 12px 10px',
  fontSize: '12px',
};

const headerStyle: React.CSSProperties = {
  fontWeight: 600,
  marginBottom: '6px',
  color: 'var(--text-primary)',
  display: 'flex',
  gap: '6px',
  alignItems: 'baseline',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '2px 0',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
};

export function ColumnStatsPanel({ stats, loading }: ColumnStatsPanelProps) {
  if (!loading && !stats) return null;

  if (loading) {
    return (
      <div style={panelStyle}>
        <div role="status" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Loading stats…
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const heights = buildHistogramHeights(stats);
  const nullPctDisplay = (stats.nullPct * 100).toFixed(1) + '%';
  const isNumericColumn = stats.avg !== null;

  function formatValue(val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'number') return val.toLocaleString();
    return String(val);
  }

  const valueColor = isNumericColumn ? 'var(--color-number)' : 'var(--text-secondary)';

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span>{stats.columnName}</span>
        <span style={{ color: 'var(--text-faint)', fontSize: '11px', fontWeight: 400 }}>
          {stats.columnType}
        </span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>min</span>
        <span style={{ color: valueColor }}>{formatValue(stats.min)}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>max</span>
        <span style={{ color: valueColor }}>{formatValue(stats.max)}</span>
      </div>
      {stats.avg !== null && (
        <div style={rowStyle}>
          <span style={labelStyle}>avg</span>
          <span style={{ color: 'var(--color-number)' }}>{stats.avg.toLocaleString()}</span>
        </div>
      )}
      <div style={rowStyle}>
        <span style={labelStyle}>nulls</span>
        <span style={{ color: 'var(--text-secondary)' }}>
          {stats.nullCount.toLocaleString()} ({nullPctDisplay})
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '2px',
          alignItems: 'flex-end',
          height: '16px',
          marginTop: '8px',
        }}
      >
        {heights.map((h, i) => (
          <div
            key={i}
            data-bar-segment
            style={{
              flex: 1,
              height: `${h}px`,
              background: 'var(--accent)',
              opacity: 0.6,
              borderRadius: '1px',
            }}
          />
        ))}
      </div>
    </div>
  );
}
