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
          color: loadDisabled ? 'var(--text-muted)' : 'var(--text-primary)',
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
