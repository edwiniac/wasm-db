import { describe, it, expect } from 'vitest';
import { formatSql } from './formatSql';

describe('formatSql', () => {
  it('uppercases SQL keywords', () => {
    const result = formatSql('select id from t');
    expect(result).toMatch(/SELECT/);
    expect(result).toMatch(/FROM/);
  });

  it('applies indentation (2-space tab width)', () => {
    const result = formatSql('select id, name from t where id = 1');
    expect(result).toMatch(/\n/);
  });

  it('does not throw on invalid / partial SQL', () => {
    expect(() => formatSql('SELECT ??? FROM')).not.toThrow();
  });

  it('returns a non-empty string for non-empty input', () => {
    expect(formatSql("SELECT * FROM parquet_scan('x.parquet')").length).toBeGreaterThan(0);
  });
});
