import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useHistoryStore } from '@/state/historyStore';
import { QueryHistory } from '@/ui/QueryHistory';

const seedEntry = (sql: string, rowCount = 0) => useHistoryStore.getState().addEntry(sql, rowCount);

describe('QueryHistory', () => {
  beforeEach(() => {
    useHistoryStore.setState({ entries: [] });
  });

  it('renders "HISTORY (0)" when empty', () => {
    render(<QueryHistory onSelect={vi.fn()} />);
    expect(screen.getByText(/HISTORY \(0\)/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });

  it('renders entry count in header', () => {
    seedEntry('SELECT 1');
    seedEntry('SELECT 2');
    render(<QueryHistory onSelect={vi.fn()} />);
    expect(screen.getByText(/HISTORY \(2\)/i)).toBeInTheDocument();
  });

  it('renders first line of SQL truncated to 60 chars', () => {
    seedEntry('SELECT id FROM t');
    render(<QueryHistory onSelect={vi.fn()} />);
    expect(screen.getByText('SELECT id FROM t')).toBeInTheDocument();
  });

  it('truncates long SQL preview to 60 chars', () => {
    const longSql = 'SELECT ' + 'a, '.repeat(30) + 'z FROM t';
    seedEntry(longSql);
    render(<QueryHistory onSelect={vi.fn()} />);
    const preview = screen.getByText(/\.\.\./);
    expect(preview.textContent!.length).toBeLessThanOrEqual(63);
  });

  it('calls onSelect with the full SQL when entry is clicked', () => {
    const onSelect = vi.fn();
    seedEntry('SELECT id FROM t', 5);
    render(<QueryHistory onSelect={onSelect} />);
    fireEvent.click(screen.getByText('SELECT id FROM t'));
    expect(onSelect).toHaveBeenCalledWith('SELECT id FROM t');
  });

  it('calls clearHistory when Clear is clicked (after confirm)', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    seedEntry('SELECT 1');
    render(<QueryHistory onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it('does not clear when confirm returns false', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    seedEntry('SELECT 1');
    render(<QueryHistory onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(useHistoryStore.getState().entries).toHaveLength(1);
  });
});
