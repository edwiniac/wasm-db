import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ResultsTable } from '@/ui/ResultsTable';
import type { Batch } from '@/engine/types';

const batches: Batch[] = [
  {
    rows: [
      { id: 1, city: 'Paris' },
      { id: 2, city: 'Berlin' },
    ],
  },
];

describe('ResultsTable — onCellClick', () => {
  it('does not throw when onCellClick is omitted and a cell is clicked', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const cells = screen.getAllByRole('cell');
    expect(() => fireEvent.click(cells[0]!)).not.toThrow();
  });

  it('calls onCellClick with column name and number value', () => {
    const onCellClick = vi.fn();
    render(<ResultsTable batches={batches} rowCount={2} onCellClick={onCellClick} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.click(cells[0]!); // first cell: id=1
    expect(onCellClick).toHaveBeenCalledWith('id', 1);
  });

  it('calls onCellClick with column name and string value', () => {
    const onCellClick = vi.fn();
    render(<ResultsTable batches={batches} rowCount={2} onCellClick={onCellClick} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.click(cells[1]!); // second cell: city='Paris'
    expect(onCellClick).toHaveBeenCalledWith('city', 'Paris');
  });

  it('calls onCellClick with null for null values', () => {
    const nullBatches: Batch[] = [{ rows: [{ score: null }] }];
    const onCellClick = vi.fn();
    render(<ResultsTable batches={nullBatches} rowCount={1} onCellClick={onCellClick} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.click(cells[0]!);
    expect(onCellClick).toHaveBeenCalledWith('score', null);
  });
});
