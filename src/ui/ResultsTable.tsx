import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import type { Batch } from '@/engine/types';

const MAX_DISPLAY_ROWS = 500;

interface ResultsTableProps {
  batches: Batch[];
  rowCount: number;
  onCellClick?: (columnName: string, value: unknown) => void;
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
    return Object.keys(rows[0]!).map((key) => ({
      id: key,
      accessorFn: (row) => row[key],
      header: key,
      cell: (info) => {
        const v = info.getValue();
        return v == null ? <span style={{ color: '#888' }}>NULL</span> : String(v);
      },
    }));
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
        <div style={{ padding: '4px 8px', fontSize: '12px', color: '#aaa', background: '#1a1a1a' }}>
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
                    textAlign: 'left',
                    borderBottom: '2px solid #444',
                    background: '#1e1e1e',
                    whiteSpace: 'nowrap',
                    position: 'sticky',
                    top: 0,
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
            <tr key={row.id} style={{ background: i % 2 === 0 ? '#141414' : '#181818' }}>
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  onClick={
                    onCellClick ? () => onCellClick(cell.column.id, cell.getValue()) : undefined
                  }
                  style={{
                    padding: '4px 10px',
                    borderBottom: '1px solid #2a2a2a',
                    whiteSpace: 'nowrap',
                    cursor: onCellClick ? 'pointer' : 'default',
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
