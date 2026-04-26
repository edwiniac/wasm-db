import { useState } from 'react';
import { encodeShareURL } from '@/util/sharing';

interface ShareButtonProps {
  parquetURL: string;
  queryText: string;
  fingerprint: string | null;
  disabled: boolean;
}

type CopyState = 'idle' | 'copied' | 'failed';

export function ShareButton({ parquetURL, queryText, fingerprint, disabled }: ShareButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const isDisabled = disabled || !parquetURL.trim();

  async function handleClick() {
    const url = encodeShareURL(parquetURL, queryText, fingerprint);
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 1500);
  }

  const label =
    copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed' : 'Share';

  return (
    <button
      onClick={() => void handleClick()}
      disabled={isDisabled}
      aria-label="Share URL"
      style={{ fontSize: '12px', padding: '3px 10px' }}
    >
      {label}
    </button>
  );
}
