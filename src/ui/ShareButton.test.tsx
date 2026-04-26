import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShareButton } from '@/ui/ShareButton';

function mockClipboard(impl: Partial<Clipboard>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: impl,
    configurable: true,
    writable: true,
  });
}

describe('ShareButton', () => {
  beforeEach(() => {
    mockClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
  });

  it('is disabled when parquetURL is empty', () => {
    render(<ShareButton parquetURL="" queryText="SELECT 1" fingerprint={null} disabled={false} />);
    expect(screen.getByRole('button', { name: /share/i })).toBeDisabled();
  });

  it('is disabled when disabled prop is true', () => {
    render(
      <ShareButton
        parquetURL="https://x.com/a.parquet"
        queryText="SELECT 1"
        fingerprint={null}
        disabled={true}
      />,
    );
    expect(screen.getByRole('button', { name: /share/i })).toBeDisabled();
  });

  it('calls clipboard.writeText with a URL containing the parquetURL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard({ writeText });
    render(
      <ShareButton
        parquetURL="https://x.com/a.parquet"
        queryText="SELECT 1"
        fingerprint={null}
        disabled={false}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /share/i }));
    });
    expect(writeText).toHaveBeenCalledOnce();
    const arg = writeText.mock.calls[0][0] as string;
    expect(decodeURIComponent(arg)).toContain('https://x.com/a.parquet');
  });

  it('shows "Copied!" after successful copy', async () => {
    render(
      <ShareButton
        parquetURL="https://x.com/a.parquet"
        queryText="SELECT 1"
        fingerprint={null}
        disabled={false}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /share/i }));
    });
    expect(screen.getByRole('button')).toHaveTextContent('Copied!');
  });

  it('shows "Copy failed" when clipboard throws', async () => {
    mockClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    render(
      <ShareButton
        parquetURL="https://x.com/a.parquet"
        queryText="SELECT 1"
        fingerprint={null}
        disabled={false}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /share/i }));
    });
    expect(screen.getByRole('button')).toHaveTextContent('Copy failed');
  });
});
