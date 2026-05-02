import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShortcutsOverlay } from '@/ui/ShortcutsOverlay';

describe('ShortcutsOverlay', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<ShortcutsOverlay open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the overlay when open=true', () => {
    render(<ShortcutsOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows keyboard shortcut entries', () => {
    render(<ShortcutsOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/Ctrl\+Enter/i)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+Shift\+F/i)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+L/i)).toBeInTheDocument();
    expect(screen.getByText(/Escape/i)).toBeInTheDocument();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<ShortcutsOverlay open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<ShortcutsOverlay open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does NOT call onClose when the card itself is clicked', () => {
    const onClose = vi.fn();
    render(<ShortcutsOverlay open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('table'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
