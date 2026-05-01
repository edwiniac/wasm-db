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

// Layout with # column prepended:
// Row 1: cells[0]='1'(#), cells[1]=1(id), cells[2]='Paris'(city)
// Row 2: cells[3]='2'(#), cells[4]=2(id), cells[5]='Berlin'(city)

describe('ResultsTable — onCellClick', () => {
  it('does not throw when onCellClick is omitted and a cell is clicked', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const cells = screen.getAllByRole('cell');
    // clicking the # cell (non-data) should not throw
    expect(() => fireEvent.click(cells[0]!)).not.toThrow();
  });

  it('calls onCellClick with column name and number value', () => {
    const onCellClick = vi.fn();
    render(<ResultsTable batches={batches} rowCount={2} onCellClick={onCellClick} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.click(cells[1]!); // id=1 (shifted from 0 → 1 due to # column)
    expect(onCellClick).toHaveBeenCalledWith('id', 1);
  });

  it('calls onCellClick with column name and string value', () => {
    const onCellClick = vi.fn();
    render(<ResultsTable batches={batches} rowCount={2} onCellClick={onCellClick} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.click(cells[2]!); // city='Paris' (shifted from 1 → 2 due to # column)
    expect(onCellClick).toHaveBeenCalledWith('city', 'Paris');
  });

  it('calls onCellClick with null for null values', () => {
    const nullBatches: Batch[] = [{ rows: [{ score: null }] }];
    const onCellClick = vi.fn();
    render(<ResultsTable batches={nullBatches} rowCount={1} onCellClick={onCellClick} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.click(cells[1]!); // score=null (shifted from 0 → 1 due to # column)
    expect(onCellClick).toHaveBeenCalledWith('score', null);
  });
});

describe('ResultsTable — row numbers', () => {
  it('renders a # column as the first column header', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]).toHaveTextContent('#');
  });

  it('renders 1-based row numbers in the # column', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const cells = screen.getAllByRole('cell');
    // Row 1 # cell
    expect(cells[0]).toHaveTextContent('1');
    // Row 2 # cell (3 cells per row: #, id, city)
    expect(cells[3]).toHaveTextContent('2');
  });

  it('does not fire onCellClick when the # cell is clicked', () => {
    const onCellClick = vi.fn();
    render(<ResultsTable batches={batches} rowCount={2} onCellClick={onCellClick} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.click(cells[0]!); // # cell for row 1
    expect(onCellClick).not.toHaveBeenCalled();
  });
});

describe('ResultsTable — cell type rendering', () => {
  it('renders null as italic NULL text', () => {
    const nullBatches: Batch[] = [{ rows: [{ score: null }] }];
    render(<ResultsTable batches={nullBatches} rowCount={1} />);
    expect(screen.getByText('NULL')).toBeInTheDocument();
  });

  it('renders boolean true with green color', () => {
    const boolBatches: Batch[] = [{ rows: [{ active: true }] }];
    render(<ResultsTable batches={boolBatches} rowCount={1} />);
    const trueEl = screen.getByText('true');
    expect(trueEl).toHaveStyle({ color: 'var(--color-bool-t)' });
  });

  it('renders boolean false with red color', () => {
    const boolBatches: Batch[] = [{ rows: [{ active: false }] }];
    render(<ResultsTable batches={boolBatches} rowCount={1} />);
    const falseEl = screen.getByText('false');
    expect(falseEl).toHaveStyle({ color: 'var(--color-bool-f)' });
  });

  it('renders array values as [item1, item2] string', () => {
    const arrBatches: Batch[] = [{ rows: [{ tags: ['ml', 'nlp'] }] }];
    render(<ResultsTable batches={arrBatches} rowCount={1} />);
    expect(screen.getByText('[ml, nlp]')).toBeInTheDocument();
  });

  it('truncates array display at 60 chars with ellipsis', () => {
    const longArr = Array.from({ length: 20 }, (_, i) => `item${i}`);
    const arrBatches: Batch[] = [{ rows: [{ tags: longArr }] }];
    render(<ResultsTable batches={arrBatches} rowCount={1} />);
    const cell = screen.getByText(/^\[item0/);
    expect(cell.textContent!.length).toBeLessThanOrEqual(62); // 60 chars + '…'
  });
});

describe('ResultsTable — sorting', () => {
  it('renders ⇅ sort indicator on data column headers by default', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[1]).toHaveTextContent('⇅');
    expect(headers[2]).toHaveTextContent('⇅');
  });

  it('does NOT render a sort indicator on the # column', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]).not.toHaveTextContent('⇅');
    expect(headers[0]).not.toHaveTextContent('↑');
    expect(headers[0]).not.toHaveTextContent('↓');
  });

  it('shows ↑ on the id header after one click', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const headers = screen.getAllByRole('columnheader');
    fireEvent.click(headers[1]!);
    expect(headers[1]).toHaveTextContent('↑');
  });

  it('shows ↓ on the id header after two clicks', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const headers = screen.getAllByRole('columnheader');
    fireEvent.click(headers[1]!);
    fireEvent.click(headers[1]!);
    expect(headers[1]).toHaveTextContent('↓');
  });

  it('clears sort after three clicks and shows ⇅ again', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const headers = screen.getAllByRole('columnheader');
    fireEvent.click(headers[1]!);
    fireEvent.click(headers[1]!);
    fireEvent.click(headers[1]!);
    expect(headers[1]).toHaveTextContent('⇅');
  });
});

describe('ResultsTable — global filter', () => {
  it('renders the filter input with placeholder "Filter rows…"', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    expect(screen.getByPlaceholderText('Filter rows…')).toBeInTheDocument();
  });

  it('hides rows that do not match the filter', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const input = screen.getByPlaceholderText('Filter rows…');
    fireEvent.change(input, { target: { value: 'Paris' } });
    expect(screen.queryByText('Berlin')).not.toBeInTheDocument();
    expect(screen.getByText('Paris')).toBeInTheDocument();
  });

  it('shows "1 of 2 rows" label when filter narrows results', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const input = screen.getByPlaceholderText('Filter rows…');
    fireEvent.change(input, { target: { value: 'Paris' } });
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
  });

  it('shows total row count with no "of" when filter is empty', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    expect(screen.getByText(/^2 rows$/)).toBeInTheDocument();
  });
});

describe('ResultsTable — copy cell chip', () => {
  it('copy chip is not visible when no cell is hovered', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    expect(screen.queryByRole('button', { name: /copy cell value/i })).not.toBeInTheDocument();
  });

  it('copy chip appears when a data cell is hovered', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.mouseEnter(cells[2]!);
    expect(screen.getByRole('button', { name: /copy cell value/i })).toBeInTheDocument();
  });

  it('copy chip is hidden when mouse leaves the cell', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.mouseEnter(cells[2]!);
    fireEvent.mouseLeave(cells[2]!);
    expect(screen.queryByRole('button', { name: /copy cell value/i })).not.toBeInTheDocument();
  });

  it('clicking Copy chip calls navigator.clipboard.writeText with the raw value', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<ResultsTable batches={batches} rowCount={2} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.mouseEnter(cells[2]!);
    const copyBtn = screen.getByRole('button', { name: /copy cell value/i });
    fireEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith('Paris');
    vi.unstubAllGlobals();
  });

  it('copy chip does NOT appear on the # row-number cell', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    const cells = screen.getAllByRole('cell');
    fireEvent.mouseEnter(cells[0]!);
    expect(screen.queryByRole('button', { name: /copy cell value/i })).not.toBeInTheDocument();
  });
});

describe('ResultsTable — export buttons', () => {
  it('renders ↓ CSV button when rows are present', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  it('renders ↓ JSON button when rows are present', () => {
    render(<ResultsTable batches={batches} rowCount={2} />);
    expect(screen.getByRole('button', { name: /export json/i })).toBeInTheDocument();
  });

  it('does not render export buttons when there are no rows', () => {
    render(<ResultsTable batches={[]} rowCount={0} />);
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export json/i })).not.toBeInTheDocument();
  });
});
