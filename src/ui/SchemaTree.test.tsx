import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SchemaTree } from '@/ui/SchemaTree';
import type { ColumnInfo } from '@/state/queryState';

const cols: ColumnInfo[] = [
  { name: 'id', type: 'INTEGER', nullable: false },
  { name: 'label', type: 'VARCHAR', nullable: true },
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
    expect(screen.getByText(/columns \(2\)/i)).toBeInTheDocument();
  });
});
