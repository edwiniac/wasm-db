function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return String(value);
  return "'" + String(value).replace(/'/g, "''") + "'";
}

export function buildWhereClause(columnName: string, value: unknown, existingSql: string): string {
  const keyword = /\bWHERE\b/i.test(existingSql) ? 'AND' : 'WHERE';
  const formatted = formatValue(value);
  const predicate = formatted === null ? `${columnName} IS NULL` : `${columnName} = ${formatted}`;
  return `${keyword} ${predicate}`;
}
