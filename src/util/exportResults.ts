function escapeCSVField(value: unknown): string {
  const str = value == null ? '' : String(value);
  const needsQuoting =
    str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r');
  if (!needsQuoting) return str;
  return '"' + str.replace(/"/g, '""') + '"';
}

export function exportCSV(rows: Record<string, unknown>[], filename: string): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const headerRow = headers.join(',');
  const dataRows = rows.map((row) => headers.map((h) => escapeCSVField(row[h])).join(','));
  const csv = [headerRow, ...dataRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportJSON(rows: Record<string, unknown>[], filename: string): void {
  if (rows.length === 0) return;
  const json = JSON.stringify(rows, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
