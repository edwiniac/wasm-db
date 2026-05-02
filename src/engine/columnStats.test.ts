import { describe, it, expect, vi } from 'vitest';
import { fetchColumnStats } from '@/engine/columnStats';
import type { EngineClient } from '@/engine/client';
import type { ColumnInfo } from '@/engine/schema';

function mockEngine(rows: Record<string, unknown>[]): EngineClient {
  const handle = {
    id: 'test',
    cancel: vi.fn(),
    done: Promise.resolve({ rowCount: rows.length, durationMs: 0 }),
    stream: {
      async *[Symbol.asyncIterator]() {
        if (rows.length > 0) yield { rows };
      },
    },
  };
  return {
    runQuery: vi.fn().mockResolvedValue(handle),
    shutdown: vi.fn(),
  } as unknown as EngineClient;
}

const numericCol: ColumnInfo = { name: 'score', type: 'FLOAT', nullable: true };
const varcharCol: ColumnInfo = { name: 'label', type: 'VARCHAR', nullable: false };

describe('fetchColumnStats — SQL generation', () => {
  it('uses parquet_scan with the given URL', async () => {
    const engine = mockEngine([
      { col_min: 0, col_max: 1, col_avg: 0.5, null_count: 0, total_count: 10 },
    ]);
    await fetchColumnStats(engine, 'https://example.com/a.parquet', numericCol);
    const sql = (engine.runQuery as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain("parquet_scan('https://example.com/a.parquet')");
  });

  it('sanitizes single quotes in the URL', async () => {
    const engine = mockEngine([
      { col_min: 0, col_max: 1, col_avg: 0.5, null_count: 0, total_count: 10 },
    ]);
    await fetchColumnStats(engine, "https://example.com/it's.parquet", numericCol);
    const sql = (engine.runQuery as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain("parquet_scan('https://example.com/it''s.parquet')");
  });

  it('includes MIN, MAX, AVG, null count, total count in SELECT', async () => {
    const engine = mockEngine([
      { col_min: 0, col_max: 1, col_avg: 0.5, null_count: 0, total_count: 10 },
    ]);
    await fetchColumnStats(engine, 'https://example.com/a.parquet', numericCol);
    const sql = (engine.runQuery as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toMatch(/MIN\("score"\)/i);
    expect(sql).toMatch(/MAX\("score"\)/i);
    expect(sql).toMatch(/AVG\(TRY_CAST\("score" AS DOUBLE\)\)/i);
    expect(sql).toMatch(/COUNT\(\*\) FILTER/i);
    expect(sql).toMatch(/COUNT\(\*\)/i);
  });
});

describe('fetchColumnStats — result parsing', () => {
  it('returns correct ColumnStats for a numeric column', async () => {
    const engine = mockEngine([
      { col_min: 0.12, col_max: 0.99, col_avg: 0.71, null_count: 3, total_count: 1000 },
    ]);
    const result = await fetchColumnStats(engine, 'https://example.com/a.parquet', numericCol);
    expect(result.columnName).toBe('score');
    expect(result.columnType).toBe('FLOAT');
    expect(result.min).toBe(0.12);
    expect(result.max).toBe(0.99);
    expect(result.avg).toBeCloseTo(0.71);
    expect(result.nullCount).toBe(3);
    expect(result.totalCount).toBe(1000);
    expect(result.nullPct).toBeCloseTo(0.003);
  });

  it('returns avg=null for a VARCHAR column', async () => {
    const engine = mockEngine([
      { col_min: 'apple', col_max: 'zebra', col_avg: null, null_count: 0, total_count: 50 },
    ]);
    const result = await fetchColumnStats(engine, 'https://example.com/a.parquet', varcharCol);
    expect(result.avg).toBeNull();
  });

  it('computes nullPct=0 when nullCount is 0', async () => {
    const engine = mockEngine([
      { col_min: 1, col_max: 10, col_avg: 5, null_count: 0, total_count: 100 },
    ]);
    const result = await fetchColumnStats(engine, 'https://example.com/a.parquet', numericCol);
    expect(result.nullPct).toBe(0);
  });

  it('computes nullPct=1 when all rows are null', async () => {
    const engine = mockEngine([
      { col_min: null, col_max: null, col_avg: null, null_count: 100, total_count: 100 },
    ]);
    const result = await fetchColumnStats(engine, 'https://example.com/a.parquet', numericCol);
    expect(result.nullPct).toBe(1);
  });

  it('computes nullPct=0 when totalCount is 0', async () => {
    const engine = mockEngine([
      { col_min: null, col_max: null, col_avg: null, null_count: 0, total_count: 0 },
    ]);
    const result = await fetchColumnStats(engine, 'https://example.com/a.parquet', numericCol);
    expect(result.nullPct).toBe(0);
  });
});
