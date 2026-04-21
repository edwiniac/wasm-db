import type { EngineClient } from './client';

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

function sanitizeURL(url: string): string {
  return url.replace(/'/g, "''");
}

export async function fetchSchema(url: string, engine: EngineClient): Promise<ColumnInfo[]> {
  const safe = sanitizeURL(url);
  const handle = await engine.runQuery(`DESCRIBE SELECT * FROM parquet_scan('${safe}')`);
  const columns: ColumnInfo[] = [];
  for await (const batch of handle.stream) {
    for (const row of batch.rows) {
      const r = row as Record<string, unknown>;
      columns.push({
        name: String(r['column_name'] ?? ''),
        type: String(r['column_type'] ?? 'UNKNOWN'),
        nullable: r['null'] === 'YES',
      });
    }
  }
  return columns;
}
