import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ColumnStatsPanel } from '@/ui/ColumnStatsPanel';
import type { ColumnStats } from '@/engine/columnStats';

const numericStats: ColumnStats = {
  columnName: 'score',
  columnType: 'FLOAT',
  min: 0.12,
  max: 0.99,
  avg: 0.71,
  nullCount: 3,
  totalCount: 1000,
  nullPct: 0.003,
};

const varcharStats: ColumnStats = {
  columnName: 'label',
  columnType: 'VARCHAR',
  min: 'apple',
  max: 'zebra',
  avg: null,
  nullCount: 0,
  totalCount: 50,
  nullPct: 0,
};

describe('ColumnStatsPanel', () => {
  it('renders nothing when stats is null and not loading', () => {
    const { container } = render(<ColumnStatsPanel stats={null} loading={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a loading indicator when loading is true', () => {
    render(<ColumnStatsPanel stats={null} loading={true} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders column name and type in header', () => {
    render(<ColumnStatsPanel stats={numericStats} loading={false} />);
    expect(screen.getByText(/score/)).toBeInTheDocument();
    expect(screen.getByText(/FLOAT/)).toBeInTheDocument();
  });

  it('renders min, max, avg rows for a numeric column', () => {
    render(<ColumnStatsPanel stats={numericStats} loading={false} />);
    expect(screen.getByText('min')).toBeInTheDocument();
    expect(screen.getByText('max')).toBeInTheDocument();
    expect(screen.getByText('avg')).toBeInTheDocument();
  });

  it('hides avg row for VARCHAR column (avg is null)', () => {
    render(<ColumnStatsPanel stats={varcharStats} loading={false} />);
    expect(screen.queryByText('avg')).not.toBeInTheDocument();
  });

  it('renders null count and percentage', () => {
    render(<ColumnStatsPanel stats={numericStats} loading={false} />);
    expect(screen.getByText(/nulls/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.3%/)).toBeInTheDocument();
  });

  it('renders 10 histogram bar segments', () => {
    render(<ColumnStatsPanel stats={numericStats} loading={false} />);
    const bars = document.querySelectorAll('[data-bar-segment]');
    expect(bars).toHaveLength(10);
  });
});
