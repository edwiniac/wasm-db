import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState, useEffect } from 'react';
import type { Batch } from '@/engine/types';
import { exportCSV, exportJSON } from '@/util/exportResults';

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

function getSortIcon(isSorted: false | 'asc' | 'desc'): React.ReactNode {
  if (isSorted === 'asc') {
    return <span style={{ color: 'var(--accent)', marginLeft: '4px', fontSize: '10px' }}>↑</span>;
  }
  if (isSorted === 'desc') {
    return <span style={{ color: 'var(--accent)', marginLeft: '4px', fontSize: '10px' }}>↓</span>;
  }
  return <span style={{ color: 'var(--text-faint)', marginLeft: '4px', fontSize: '10px' }}>⇅</span>;
}

export function ResultsTable({ batches, rowCount, onCellClick }: ResultsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [hoveredCellId, setHoveredCellId] = useState<string | null>(null);
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);

  useEffect(() => {
    setSorting([]);
    setGlobalFilter('');
  }, [batches]);

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
      enableSorting: false,
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
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    sortDescFirst: false,
  });

  if (rows.length === 0) return null;

  const truncated = rowCount > MAX_DISPLAY_ROWS;
  const filteredRows = table.getRowModel().rows;
  const totalCount = table.getCoreRowModel().rows.length;
  const filteredCount = filteredRows.length;
  const visibleRowData = filteredRows.map((r) => r.original);
  const exportFilename = `query-results-${Date.now()}`;

  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 10px',
    background: 'var(--bg-elevated)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  };

  const exportBtnStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius)',
    fontSize: '11px',
    padding: '3px 8px',
    cursor: 'pointer',
  };

  return (
    <div style={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
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

      <div style={toolbarStyle}>
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Filter rows…"
          aria-label="Filter rows"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            padding: '4px 10px',
            width: '220px',
            outline: 'none',
          }}
        />
        <span
          style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            flex: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {globalFilter ? `${filteredCount} of ${totalCount}` : String(filteredCount)}{' '}
          {filteredCount === 1 ? 'row' : 'rows'}
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => exportCSV(visibleRowData, `${exportFilename}.csv`)}
            style={exportBtnStyle}
            aria-label="Export CSV"
          >
            ↓ CSV
          </button>
          <button
            onClick={() => exportJSON(visibleRowData, `${exportFilename}.json`)}
            style={exportBtnStyle}
            aria-label="Export JSON"
          >
            ↓ JSON
          </button>
        </div>
      </div>

      <div style={{ overflow: 'auto', flex: 1 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  return (
                    <th
                      key={h.id}
                      onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
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
                        cursor: canSort ? 'pointer' : 'default',
                      }}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {canSort && getSortIcon(h.column.getIsSorted())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr key={row.id} style={{ background: i % 2 === 0 ? 'var(--bg-base)' : '#111520' }}>
                {row.getVisibleCells().map((cell) => {
                  const isRowNum = cell.column.id === '_rownum';
                  const val = cell.getValue();
                  const isNull = val == null;
                  const cellId = cell.id;
                  const isHovered = hoveredCellId === cellId;
                  const isCopied = copiedCellId === cellId;

                  const handleCopy = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    void navigator.clipboard.writeText(String(val ?? '')).then(() => {
                      setCopiedCellId(cellId);
                      setTimeout(() => setCopiedCellId(null), 1500);
                    });
                  };

                  return (
                    <td
                      key={cellId}
                      onMouseEnter={() => setHoveredCellId(cellId)}
                      onMouseLeave={() => setHoveredCellId(null)}
                      onClick={
                        !isRowNum && onCellClick
                          ? () => onCellClick(cell.column.id, val)
                          : undefined
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
                        position: 'relative',
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      {!isRowNum && isHovered && (
                        <button
                          onClick={handleCopy}
                          aria-label="Copy cell value"
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '4px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            fontSize: '10px',
                            padding: '2px 5px',
                            borderRadius: 'var(--radius)',
                            cursor: 'pointer',
                          }}
                        >
                          {isCopied ? '✓' : 'Copy'}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
