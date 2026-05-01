import { describe, it, expect } from 'vitest';
import { buildWhereClause } from './querySnippets';

const noWhere = "SELECT * FROM parquet_scan('x.parquet') LIMIT 100";
const withWhere = "SELECT * FROM parquet_scan('x.parquet') WHERE id = 1";

describe('buildWhereClause — keyword selection', () => {
  it('uses WHERE when no WHERE keyword in sql', () => {
    expect(buildWhereClause('id', 1, noWhere)).toMatch(/^WHERE /);
  });

  it('uses AND when WHERE already present', () => {
    expect(buildWhereClause('id', 2, withWhere)).toMatch(/^AND /);
  });

  it('WHERE detection is case-insensitive', () => {
    expect(buildWhereClause('id', 1, 'select * from t where x = 1')).toMatch(/^AND /);
  });
});

describe('buildWhereClause — value formatting', () => {
  it('formats null as IS NULL', () => {
    expect(buildWhereClause('col', null, noWhere)).toBe('WHERE col IS NULL');
  });

  it('formats undefined as IS NULL', () => {
    expect(buildWhereClause('col', undefined, noWhere)).toBe('WHERE col IS NULL');
  });

  it('formats integer as bare literal', () => {
    expect(buildWhereClause('col', 42, noWhere)).toBe('WHERE col = 42');
  });

  it('formats float as bare literal', () => {
    expect(buildWhereClause('col', 3.14, noWhere)).toBe('WHERE col = 3.14');
  });

  it('formats bigint as bare literal', () => {
    expect(buildWhereClause('col', BigInt('9007199254740993'), noWhere)).toBe(
      'WHERE col = 9007199254740993',
    );
  });

  it('formats boolean true as bare literal', () => {
    expect(buildWhereClause('col', true, noWhere)).toBe('WHERE col = true');
  });

  it('formats boolean false as bare literal', () => {
    expect(buildWhereClause('col', false, noWhere)).toBe('WHERE col = false');
  });

  it('formats string as single-quoted', () => {
    expect(buildWhereClause('col', 'Paris', noWhere)).toBe("WHERE col = 'Paris'");
  });

  it('escapes interior single quotes in strings', () => {
    expect(buildWhereClause('col', "O'Brien", noWhere)).toBe("WHERE col = 'O''Brien'");
  });

  it('formats Date as single-quoted string', () => {
    const d = new Date('2024-01-15');
    const result = buildWhereClause('col', d, noWhere);
    expect(result).toMatch(/^WHERE col = '/);
  });
});
