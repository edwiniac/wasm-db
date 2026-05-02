import { format } from 'sql-formatter';

export function formatSql(sql: string): string {
  return format(sql, {
    language: 'sql',
    tabWidth: 2,
    keywordCase: 'upper',
    linesBetweenQueries: 1,
  });
}
