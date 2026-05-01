import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import type { Batch } from '@/engine/types';

const MAX_DISPLAY_ROWS = 500;

interface ResultsTableProps {
  batches: Batch[];
  rowCount: number;
  onCellClick?: (columnName: string, value: unknown) => void;
}

function renderCell(v: unknown): React.ReactNode {
  if (v == null) {
    return (
      <span style={{ color: 'var(--color-null)', fontStyle: 'italic', fontSize: '11px' }}>
        NULL
      </span>
    );
  }
  if (typeof v === 'boolean') {
    return (
      <span style={{ color: v ? 'var(--color-bool-t)' : 'var(--color-bool-f)' }}>{String(v)}</span>
    );
  }
  if (typeof v === 'number' || typeof v === 'bigint') {
    return <span style={{ color: 'var(--color-number)' }}>{String(v)}</span>;
  }
  if (Array.isArray(v)) {
    const str = '[' + (v as unknown[]).map(String).join(', ') + ']';
    const display = str.length > 60 ? str.slice(0, 60) + '…' : str;
    return <span style={{ color: 'var(--text-secondary)' }}>{display}</span>;
  }
  return String(v);
}

export function ResultsTable({ batches, rowCount, onCellClick }: ResultsTableProps) {
  const rows = useMemo(() => {
    const all: Record<string, unknown>[] = [];
    for (const batch of batches) {
      for (const row of batch.rows) {
        all.push(row);
        if (all.length >= MAX_DISPLAY_ROWS) return all;
      }
    }
    return all;
  }, [batches]);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (rows.length === 0) return [];

    const rowNumCol: ColumnDef<Record<string, unknown>> = {
      id: '_rownum',
      header: '#',
      cell: (info) => info.row.index + 1,
    };

    const dataCols = Object.keys(rows[0]!).map<ColumnDef<Record<string, unknown>>>((key) => ({
      id: key,
      accessorFn: (row) => row[key],
      header: key,
      cell: (info) => renderCell(info.getValue()),
    }));

    return [rowNumCol, ...dataCols];
  }, [rows]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (rows.length === 0) return null;

  const truncated = rowCount > MAX_DISPLAY_ROWS;

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {truncated && (
        <div
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          Showing first {MAX_DISPLAY_ROWS} of {rowCount.toLocaleString()} rows
        </div>
      )}
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  style={{
                    padding: '6px 10px',
                    textAlign: h.id === '_rownum' ? 'right' : 'left',
                    borderBottom: '2px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    position: 'sticky',
                    top: 0,
                    width: h.id === '_rownum' ? '48px' : undefined,
                    userSelect: 'none',
                  }}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <tr key={row.id} style={{ background: i % 2 === 0 ? 'var(--bg-base)' : '#111520' }}>
              {row.getVisibleCells().map((cell) => {
                const isRowNum = cell.column.id === '_rownum';
                const val = cell.getValue();
                const isNull = val == null;
                return (
                  <td
                    key={cell.id}
                    onClick={
                      !isRowNum && onCellClick ? () => onCellClick(cell.column.id, val) : undefined
                    }
                    style={{
                      padding: '4px 10px',
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap',
                      cursor: !isRowNum && onCellClick ? 'pointer' : 'default',
                      textAlign:
                        isRowNum || typeof val === 'number' || typeof val === 'bigint'
                          ? 'right'
                          : 'left',
                      color: isRowNum ? 'var(--text-faint)' : 'var(--text-primary)',
                      background: isNull ? 'rgba(55,65,81,0.15)' : undefined,
                      userSelect: isRowNum ? 'none' : undefined,
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
