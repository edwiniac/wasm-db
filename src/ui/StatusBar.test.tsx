import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StatusBar } from '@/ui/StatusBar';

describe('StatusBar — offline badge', () => {
  it('does not render offline badge when isOnline is true', () => {
    render(<StatusBar status="idle" rowCount={0} onCancel={vi.fn()} isOnline={true} />);
    expect(screen.queryByLabelText('offline')).toBeNull();
  });

  it('does not render offline badge when isOnline is omitted (default online)', () => {
    render(<StatusBar status="idle" rowCount={0} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText('offline')).toBeNull();
  });

  it('renders offline badge when isOnline is false', () => {
    render(<StatusBar status="idle" rowCount={0} onCancel={vi.fn()} isOnline={false} />);
    expect(screen.getByLabelText('offline')).toBeInTheDocument();
  });

  it('offline badge contains visible text', () => {
    render(<StatusBar status="idle" rowCount={0} onCancel={vi.fn()} isOnline={false} />);
    expect(screen.getByLabelText('offline')).toHaveTextContent(/offline/i);
  });
});
