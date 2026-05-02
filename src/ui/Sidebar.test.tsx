import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar } from '@/ui/Sidebar';
import type { ColumnStats } from '@/engine/columnStats';

const defaultProps = {
  columns: [
    { name: 'id', type: 'INTEGER', nullable: false },
    { name: 'score', type: 'FLOAT', nullable: false },
  ],
  schemaStatus: 'loaded' as const,
  onColumnClick: vi.fn(),
  columnStats: null,
  columnStatsLoading: false,
  files: [],
  onAddFile: vi.fn(),
  onRemoveFile: vi.fn(),
  onChangeAlias: vi.fn(),
  onChangeUrl: vi.fn(),
  onProbeFile: vi.fn(),
};

describe('Sidebar', () => {
  it('renders COLUMNS section label', () => {
    render(<Sidebar {...defaultProps} />);
    const labels = screen.getAllByText(/COLUMNS/i);
    expect(labels[0]).toBeInTheDocument();
    expect(labels[0]).toHaveStyle('textTransform: uppercase');
  });

  it('renders FILES section label', () => {
    render(<Sidebar {...defaultProps} />);
    const labels = screen.getAllByText(/FILES/i);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]).toHaveStyle('textTransform: uppercase');
  });

  it('renders SchemaTree inside (column name visible)', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('id')).toBeInTheDocument();
  });

  it('renders the filter input with correct placeholder', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByPlaceholderText('Filter columns…')).toBeInTheDocument();
  });

  it('typing in filter input hides non-matching columns', () => {
    render(<Sidebar {...defaultProps} />);
    const input = screen.getByPlaceholderText('Filter columns…');
    fireEvent.change(input, { target: { value: 'sc' } });
    expect(screen.queryByText('id')).not.toBeInTheDocument();
    expect(screen.getByText('score')).toBeInTheDocument();
  });

  it('shows loading spinner when columnStatsLoading is true', () => {
    render(<Sidebar {...defaultProps} columnStatsLoading={true} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders ColumnStatsPanel when stats are present', () => {
    const stats: ColumnStats = {
      columnName: 'weight',
      columnType: 'FLOAT',
      min: 0.12,
      max: 0.99,
      avg: 0.71,
      nullCount: 3,
      totalCount: 1000,
      nullPct: 0.003,
    };
    render(<Sidebar {...defaultProps} columnStats={stats} />);
    expect(screen.getByText('weight')).toBeInTheDocument();
    expect(screen.getByText('min')).toBeInTheDocument();
  });
});
