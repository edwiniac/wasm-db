import type { EngineClient } from '@/engine/client';
import type { ColumnInfo } from '@/engine/schema';

export interface ColumnStats {
  columnName: string;
  columnType: string;
  min: unknown;
  max: unknown;
  avg: number | null;
  nullCount: number;
  totalCount: number;
  nullPct: number;
}

const NUMERIC_PREFIXES = [
  'INT',
  'FLOAT',
  'DOUBLE',
  'DECIMAL',
  'BIGINT',
  'HUGEINT',
  'SMALLINT',
  'TINYINT',
  'UBIGINT',
  'UINTEGER',
  'USMALLINT',
  'UTINYINT',
  'REAL',
];

function isNumeric(type: string): boolean {
  const upper = type.toUpperCase();
  return NUMERIC_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

function sanitizeURL(url: string): string {
  return url.replace(/'/g, "''");
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function fetchColumnStats(
  client: EngineClient,
  url: string,
  col: ColumnInfo,
  signal?: AbortSignal,
): Promise<ColumnStats> {
  const safeURL = sanitizeURL(url);
  const colName = col.name;
  const quotedCol = quoteIdent(colName);

  const sql = `
SELECT
  MIN(${quotedCol})                              AS col_min,
  MAX(${quotedCol})                              AS col_max,
  AVG(TRY_CAST(${quotedCol} AS DOUBLE))         AS col_avg,
  COUNT(*) FILTER (WHERE ${quotedCol} IS NULL)  AS null_count,
  COUNT(*)                                       AS total_count
FROM parquet_scan('${safeURL}')
`.trim();

  signal?.throwIfAborted();
  const handle = await client.runQuery(sql);
  signal?.throwIfAborted();
  let row: Record<string, unknown> = {};
  for await (const batch of handle.stream) {
    if (batch.rows.length > 0) {
      row = batch.rows[0] as Record<string, unknown>;
    }
  }

  const nullCount = Number(row['null_count'] ?? 0);
  const totalCount = Number(row['total_count'] ?? 0);
  const rawAvg = row['col_avg'];
  const avg = isNumeric(col.type) && rawAvg != null ? Number(rawAvg) : null;

  return {
    columnName: colName,
    columnType: col.type,
    min: row['col_min'] ?? null,
    max: row['col_max'] ?? null,
    avg,
    nullCount,
    totalCount,
    nullPct: totalCount > 0 ? nullCount / totalCount : 0,
  };
}
