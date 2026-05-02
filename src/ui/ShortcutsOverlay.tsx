import { useEffect } from 'react';

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { key: string; description: string }[] = [
  { key: 'Ctrl+Enter / Cmd+Enter', description: 'Run query' },
  { key: 'Ctrl+Shift+F / Cmd+Shift+F', description: 'Format SQL' },
  { key: 'Ctrl+L / Cmd+L', description: 'Focus URL input' },
  { key: 'Escape', description: 'Cancel running query' },
  { key: '?', description: 'Toggle this cheatsheet' },
];

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px 32px',
          minWidth: '360px',
        }}
      >
        <h2
          style={{
            margin: '0 0 16px',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          Keyboard Shortcuts
        </h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {SHORTCUTS.map(({ key, description }) => (
              <tr key={key}>
                <td
                  style={{
                    padding: '5px 16px 5px 0',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: 'var(--accent)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {key}
                </td>
                <td style={{ padding: '5px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p
          style={{
            margin: '16px 0 0',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          Press the key above or click outside to close
        </p>
      </div>
    </div>
  );
}
