interface DriftBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

export function DriftBanner({ visible, onDismiss }: DriftBannerProps) {
  if (!visible) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        background: '#3a2e00',
        borderTop: '1px solid #6a5200',
        fontSize: '12px',
        color: '#f0c040',
      }}
    >
      <span style={{ flex: 1 }}>
        ⚠ Schema has changed since this link was created — some columns may differ.
      </span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss drift warning"
        style={{ fontSize: '12px', padding: '2px 8px', flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}
