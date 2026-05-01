import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar } from '@/ui/Sidebar';

const defaultProps = {
  columns: [{ name: 'id', type: 'INTEGER', nullable: false }],
  schemaStatus: 'loaded' as const,
  onColumnClick: vi.fn(),
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
    // First match should be the section label
    expect(labels[0]).toBeInTheDocument();
    expect(labels[0]).toHaveStyle('textTransform: uppercase');
  });

  it('renders FILES section label', () => {
    render(<Sidebar {...defaultProps} />);
    const labels = screen.getAllByText(/FILES/i);
    // Should have the section label
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]).toHaveStyle('textTransform: uppercase');
  });

  it('renders SchemaTree inside (column name visible)', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('id')).toBeInTheDocument();
  });
});
