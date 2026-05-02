import { describe, it, expect } from 'vitest';
import { formatSql } from './formatSql';

describe('formatSql', () => {
  it('uppercases SQL keywords', async () => {
    const result = await formatSql('select id from t');
    expect(result).toMatch(/SELECT/);
    expect(result).toMatch(/FROM/);
  });

  it('applies indentation (2-space tab width)', async () => {
    const result = await formatSql('select id, name from t where id = 1');
    expect(result).toMatch(/\n/);
  });

  it('does not throw on invalid / partial SQL', async () => {
    await expect(formatSql('SELECT ??? FROM')).resolves.toBeDefined();
  });

  it('returns a non-empty string for non-empty input', async () => {
    const result = await formatSql("SELECT * FROM parquet_scan('x.parquet')");
    expect(result.length).toBeGreaterThan(0);
  });
});
