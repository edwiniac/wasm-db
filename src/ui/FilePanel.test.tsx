import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilePanel } from '@/ui/FilePanel';
import type { RegisteredFile } from '@/state/filesState';

const baseFile: RegisteredFile = {
  id: 'f1',
  alias: 'sales',
  url: 'http://x.com/sales.parquet',
  status: 'idle',
};

describe('FilePanel', () => {
  it('renders the toggle button', () => {
    render(
      <FilePanel
        files={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /toggle additional files panel/i }),
    ).toBeInTheDocument();
  });

  it('panel body is visible by default', () => {
    render(
      <FilePanel
        files={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Additional files panel')).toBeInTheDocument();
  });

  it('clicking toggle hides and shows the panel', () => {
    render(
      <FilePanel
        files={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    const toggle = screen.getByRole('button', { name: /toggle additional files panel/i });
    fireEvent.click(toggle);
    expect(screen.queryByLabelText('Additional files panel')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Additional files panel')).toBeInTheDocument();
  });

  it('Add file button calls onAdd', () => {
    const onAdd = vi.fn();
    render(
      <FilePanel
        files={[]}
        onAdd={onAdd}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /add file/i }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('Add file button is disabled at 5 files', () => {
    const files: RegisteredFile[] = Array.from({ length: 5 }, (_, i) => ({
      id: `f${i}`,
      alias: `t${i}`,
      url: `http://x.com/${i}.parquet`,
      status: 'ready' as const,
    }));
    render(
      <FilePanel
        files={files}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /add file/i })).toBeDisabled();
  });

  it('renders alias input, url input, Load and Remove buttons for each file', () => {
    render(
      <FilePanel
        files={[baseFile]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('sales')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://x.com/sales.parquet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /probe file f1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove file f1/i })).toBeInTheDocument();
  });

  it('Load button is disabled when URL is empty', () => {
    const emptyFile: RegisteredFile = { id: 'f1', alias: 'sales', url: '', status: 'idle' };
    render(
      <FilePanel
        files={[emptyFile]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /probe file f1/i })).toBeDisabled();
  });

  it('Load button is disabled when alias is invalid', () => {
    const badAlias: RegisteredFile = {
      id: 'f1',
      alias: '123bad',
      url: 'http://x.com/sales.parquet',
      status: 'idle',
    };
    render(
      <FilePanel
        files={[badAlias]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /probe file f1/i })).toBeDisabled();
  });

  it('shows inline alias error for invalid alias', () => {
    const badAlias: RegisteredFile = {
      id: 'f1',
      alias: 'select',
      url: 'http://x.com/sales.parquet',
      status: 'idle',
    };
    render(
      <FilePanel
        files={[badAlias]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByText(/reserved sql keyword/i)).toBeInTheDocument();
  });

  it('calls onProbe with file id when Load is clicked', () => {
    const onProbe = vi.fn();
    render(
      <FilePanel
        files={[baseFile]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={onProbe}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /probe file f1/i }));
    expect(onProbe).toHaveBeenCalledWith('f1');
  });

  it('calls onRemove with file id when × is clicked', () => {
    const onRemove = vi.fn();
    render(
      <FilePanel
        files={[baseFile]}
        onAdd={vi.fn()}
        onRemove={onRemove}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /remove file f1/i }));
    expect(onRemove).toHaveBeenCalledWith('f1');
  });

  it('Load button is disabled when status is probing', () => {
    const probing: RegisteredFile = { ...baseFile, status: 'probing' };
    render(
      <FilePanel
        files={[probing]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /probe file f1/i })).toBeDisabled();
  });

  it('shows ready indicator when status is ready', () => {
    const ready: RegisteredFile = { ...baseFile, status: 'ready' };
    render(
      <FilePanel
        files={[ready]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onChangeAlias={vi.fn()}
        onChangeUrl={vi.fn()}
        onProbe={vi.fn()}
      />,
    );
    expect(screen.getByText(/✓ ready/)).toBeInTheDocument();
  });
});
