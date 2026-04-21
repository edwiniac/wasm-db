import { describe, it, expect, vi } from 'vitest';
import { fetchSchema } from '@/engine/schema';
import type { EngineClient } from '@/engine/client';

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

describe('fetchSchema', () => {
  it('runs DESCRIBE SELECT * on the given URL', async () => {
    const engine = mockEngine([]);
    await fetchSchema('https://example.com/a.parquet', engine);
    expect(engine.runQuery).toHaveBeenCalledWith(
      "DESCRIBE SELECT * FROM parquet_scan('https://example.com/a.parquet')",
    );
  });

  it('parses DESCRIBE rows into ColumnInfo array', async () => {
    const engine = mockEngine([
      { column_name: 'id', column_type: 'INTEGER', null: 'YES' },
      { column_name: 'name', column_type: 'VARCHAR', null: 'NO' },
    ]);
    const result = await fetchSchema('https://example.com/a.parquet', engine);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'id', type: 'INTEGER', nullable: true });
    expect(result[1]).toEqual({ name: 'name', type: 'VARCHAR', nullable: false });
  });

  it('sanitizes single quotes in the URL (SQL injection guard)', async () => {
    const engine = mockEngine([]);
    await fetchSchema("https://example.com/it's.parquet", engine);
    expect(engine.runQuery).toHaveBeenCalledWith(
      "DESCRIBE SELECT * FROM parquet_scan('https://example.com/it''s.parquet')",
    );
  });

  it('returns empty array when DESCRIBE yields no rows', async () => {
    const engine = mockEngine([]);
    expect(await fetchSchema('https://x.com/a.parquet', engine)).toEqual([]);
  });
});
