import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Topbar } from '@/ui/Topbar';

const defaultProps = {
  url: 'https://example.com/data.parquet',
  isProbing: false,
  onUrlChange: vi.fn(),
  onLoad: vi.fn(),
  onShare: vi.fn(),
  shareLabel: 'Share',
  shareDisabled: false,
};

describe('Topbar', () => {
  it('renders the URL value in the input', () => {
    render(<Topbar {...defaultProps} />);
    expect(screen.getByDisplayValue('https://example.com/data.parquet')).toBeInTheDocument();
  });

  it('calls onLoad when Load button is clicked', () => {
    const onLoad = vi.fn();
    render(<Topbar {...defaultProps} onLoad={onLoad} />);
    fireEvent.click(screen.getByRole('button', { name: /load/i }));
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it('calls onShare when Share button is clicked', () => {
    const onShare = vi.fn();
    render(<Topbar {...defaultProps} onShare={onShare} />);
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(onShare).toHaveBeenCalledOnce();
  });

  it('disables Load button and shows Probing… when isProbing', () => {
    render(<Topbar {...defaultProps} isProbing={true} />);
    expect(screen.getByRole('button', { name: /probing/i })).toBeDisabled();
  });

  it('renders custom shareLabel on the Share button', () => {
    render(<Topbar {...defaultProps} shareLabel="Copied!" />);
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
  });
});
