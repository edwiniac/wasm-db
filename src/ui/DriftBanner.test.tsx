import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DriftBanner } from '@/ui/DriftBanner';

describe('DriftBanner', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(<DriftBanner visible={false} onDismiss={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders warning text when visible is true', () => {
    render(<DriftBanner visible={true} onDismiss={vi.fn()} />);
    expect(screen.getByText(/schema has changed/i)).toBeInTheDocument();
  });

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<DriftBanner visible={true} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
