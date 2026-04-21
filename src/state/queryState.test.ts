import { describe, it, expect } from 'vitest';
import { queryReducer, initialState } from '@/state/queryState';
import type { ColumnInfo } from '@/state/queryState';

describe('queryReducer — schema actions', () => {
  it('SCHEMA_START sets schemaStatus to loading', () => {
    const next = queryReducer(initialState, { type: 'SCHEMA_START' });
    expect(next.schemaStatus).toBe('loading');
    expect(next.schema).toBeNull();
  });

  it('SCHEMA_DONE stores columns and sets schemaStatus to loaded', () => {
    const cols: ColumnInfo[] = [{ name: 'id', type: 'INTEGER', nullable: false }];
    const next = queryReducer(initialState, { type: 'SCHEMA_DONE', columns: cols });
    expect(next.schemaStatus).toBe('loaded');
    expect(next.schema).toEqual(cols);
  });

  it('SCHEMA_ERROR sets schemaStatus to error', () => {
    const next = queryReducer(initialState, { type: 'SCHEMA_ERROR' });
    expect(next.schemaStatus).toBe('error');
  });

  it('SET_URL resets schema and schemaStatus to idle', () => {
    const withSchema = queryReducer(initialState, {
      type: 'SCHEMA_DONE',
      columns: [{ name: 'id', type: 'INTEGER', nullable: false }],
    });
    const after = queryReducer(withSchema, {
      type: 'SET_URL',
      url: 'https://new.example.com/b.parquet',
    });
    expect(after.schema).toBeNull();
    expect(after.schemaStatus).toBe('idle');
  });
});
