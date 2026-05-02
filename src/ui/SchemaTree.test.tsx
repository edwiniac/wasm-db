import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SchemaTree } from '@/ui/SchemaTree';
import type { ColumnInfo } from '@/state/queryState';

const cols: ColumnInfo[] = [
  { name: 'id', type: 'INTEGER', nullable: false },
  { name: 'label', type: 'VARCHAR', nullable: true },
  { name: 'score', type: 'FLOAT', nullable: false },
];

describe('SchemaTree', () => {
  it('renders nothing when status is idle', () => {
    const { container } = render(<SchemaTree columns={null} status="idle" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows loading text when status is loading', () => {
    render(<SchemaTree columns={null} status="loading" />);
    expect(screen.getByText(/loading schema/i)).toBeInTheDocument();
  });

  it('shows error message when status is error', () => {
    render(<SchemaTree columns={null} status="error" />);
    expect(screen.getByText(/schema unavailable/i)).toBeInTheDocument();
  });

  it('renders column names and types when loaded', () => {
    render(<SchemaTree columns={cols} status="loaded" />);
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('INTEGER')).toBeInTheDocument();
    expect(screen.getByText('label')).toBeInTheDocument();
    expect(screen.getByText('VARCHAR')).toBeInTheDocument();
  });

  it('shows column count in header', () => {
    render(<SchemaTree columns={cols} status="loaded" />);
    expect(screen.getByText(/columns \(3\)/i)).toBeInTheDocument();
  });
});

describe('SchemaTree — onColumnClick', () => {
  it('calls onColumnClick with the full ColumnInfo when a row is clicked', () => {
    const onColumnClick = vi.fn();
    render(<SchemaTree columns={cols} status="loaded" onColumnClick={onColumnClick} />);
    fireEvent.click(screen.getByText('id'));
    expect(onColumnClick).toHaveBeenCalledWith({ name: 'id', type: 'INTEGER', nullable: false });
  });

  it('does not throw when onColumnClick is omitted and a row is clicked', () => {
    render(<SchemaTree columns={cols} status="loaded" />);
    expect(() => fireEvent.click(screen.getByText('id'))).not.toThrow();
  });
});

describe('SchemaTree — filter prop', () => {
  it('shows all columns when filter is empty string', () => {
    render(<SchemaTree columns={cols} status="loaded" filter="" />);
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('label')).toBeInTheDocument();
    expect(screen.getByText('score')).toBeInTheDocument();
  });

  it('shows all columns when filter is undefined', () => {
    render(<SchemaTree columns={cols} status="loaded" />);
    expect(screen.getByText('id')).toBeInTheDocument();
    expect(screen.getByText('label')).toBeInTheDocument();
    expect(screen.getByText('score')).toBeInTheDocument();
  });

  it('hides non-matching columns when filter matches a substring', () => {
    render(<SchemaTree columns={cols} status="loaded" filter="sc" />);
    expect(screen.queryByText('id')).not.toBeInTheDocument();
    expect(screen.queryByText('label')).not.toBeInTheDocument();
    expect(screen.getByText('score')).toBeInTheDocument();
  });

  it('is case-insensitive', () => {
    render(<SchemaTree columns={cols} status="loaded" filter="SCORE" />);
    expect(screen.getByText('score')).toBeInTheDocument();
    expect(screen.queryByText('id')).not.toBeInTheDocument();
  });

  it('shows "No columns match" fallback when no columns match the filter', () => {
    render(<SchemaTree columns={cols} status="loaded" filter="zzz" />);
    expect(screen.getByText(/no columns match/i)).toBeInTheDocument();
  });

  it('passes full ColumnInfo to onColumnClick even when filter is active', () => {
    const onColumnClick = vi.fn();
    render(<SchemaTree columns={cols} status="loaded" filter="sc" onColumnClick={onColumnClick} />);
    fireEvent.click(screen.getByText('score'));
    expect(onColumnClick).toHaveBeenCalledWith({ name: 'score', type: 'FLOAT', nullable: false });
  });
});
