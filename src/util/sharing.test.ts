import { describe, it, expect } from 'vitest';
import { computeFingerprint, encodeShareURL, decodeShareParams } from '@/util/sharing';
import type { ColumnInfo } from '@/engine/schema';

const cols: ColumnInfo[] = [
  { name: 'id', type: 'INTEGER', nullable: false },
  { name: 'label', type: 'VARCHAR', nullable: true },
];

describe('computeFingerprint', () => {
  it('is stable for identical columns', () => {
    expect(computeFingerprint(cols)).toBe(computeFingerprint(cols));
  });

  it('differs when column order changes', () => {
    const reversed = [...cols].reverse();
    expect(computeFingerprint(cols)).not.toBe(computeFingerprint(reversed));
  });
});

describe('encodeShareURL', () => {
  it('produces a URL whose hash contains url, q, and sf params', () => {
    const result = encodeShareURL('https://x.com/a.parquet', 'SELECT 1', 'abc12345');
    const hash = result.split('#')[1] ?? '';
    const p = new URLSearchParams(hash);
    expect(p.get('url')).toBe('https://x.com/a.parquet');
    expect(p.get('q')).toBe('SELECT 1');
    expect(p.get('sf')).toBe('abc12345');
  });

  it('omits sf param when fingerprint is null', () => {
    const result = encodeShareURL('https://x.com/a.parquet', 'SELECT 1', null);
    const hash = result.split('#')[1] ?? '';
    const p = new URLSearchParams(hash);
    expect(p.get('sf')).toBeNull();
  });
});

describe('decodeShareParams', () => {
  it('round-trips params produced by encodeShareURL', () => {
    const encoded = encodeShareURL('https://x.com/a.parquet', 'SELECT 1', 'abc12345');
    const hash = encoded.split('#')[1] ?? '';
    const { url, query, fingerprint } = decodeShareParams(hash);
    expect(url).toBe('https://x.com/a.parquet');
    expect(query).toBe('SELECT 1');
    expect(fingerprint).toBe('abc12345');
  });

  it('returns null for url when scheme is not http(s)', () => {
    const p = new URLSearchParams({ url: 'javascript:alert(1)', q: 'SELECT 1' });
    const { url } = decodeShareParams(p.toString());
    expect(url).toBeNull();
  });

  it('returns null for missing q and sf', () => {
    const p = new URLSearchParams({ url: 'https://x.com/a.parquet' });
    const { query, fingerprint } = decodeShareParams(p.toString());
    expect(query).toBeNull();
    expect(fingerprint).toBeNull();
  });
});
