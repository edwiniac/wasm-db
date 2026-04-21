import type { AppError } from '@/errors';

interface ErrorPanelProps {
  error: AppError;
}

export function ErrorPanel({ error }: ErrorPanelProps) {
  const text = `[${error.code}] ${error.message}`;

  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => undefined);
  }

  return (
    <div
      role="alert"
      style={{
        padding: '10px 12px',
        background: '#2a1010',
        borderTop: '1px solid #5a2020',
        fontSize: '13px',
        color: '#ff6b6b',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
      }}
    >
      <span style={{ flex: 1, fontFamily: 'monospace', wordBreak: 'break-all' }}>{text}</span>
      <button
        onClick={handleCopy}
        style={{ flexShrink: 0, fontSize: '12px', padding: '2px 8px' }}
        aria-label="Copy error message"
      >
        Copy
      </button>
    </div>
  );
}
