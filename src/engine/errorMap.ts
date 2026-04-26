const DUCK_ERROR_MAP: [RegExp, string][] = [
  [/HTTP.*403/i, 'File access denied (403) — check the URL or your permissions.'],
  [/HTTP.*404/i, 'File not found (404) — verify the URL is correct.'],
  [/HTTP.*416/i, 'Byte-range request rejected by the server.'],
  [/CORS|cross.?origin/i, 'Cross-origin request blocked — the file host must send CORS headers.'],
  [/Out of Memory|OOM/i, 'Query ran out of memory — try adding a LIMIT clause.'],
  [/not a Parquet file|invalid parquet/i, 'The URL does not point to a valid Parquet file.'],
  [/parquet_scan.*INVALID_INPUT/i, 'Invalid Parquet file or unsupported schema.'],
  [/Binder Error.*column.*does not exist/i, 'Unknown column name — check your SELECT clause.'],
  [/Parser Error/i, 'SQL syntax error — check your query.'],
  [/Catalog Error/i, 'Unknown table or function — check your query.'],
];

export function mapDuckDBError(raw: string): string {
  for (const [pattern, message] of DUCK_ERROR_MAP) {
    if (pattern.test(raw)) return message;
  }
  return raw;
}
