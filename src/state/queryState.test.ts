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

describe('queryReducer — sharing actions', () => {
  it('SET_SHARED_FINGERPRINT stores the fingerprint', () => {
    const next = queryReducer(initialState, {
      type: 'SET_SHARED_FINGERPRINT',
      fingerprint: 'abc12345',
    });
    expect(next.sharedFingerprint).toBe('abc12345');
    expect(next.schemaDrift).toBe(false);
  });

  it('SCHEMA_DRIFT_DETECTED sets schemaDrift to true', () => {
    const next = queryReducer(initialState, { type: 'SCHEMA_DRIFT_DETECTED' });
    expect(next.schemaDrift).toBe(true);
  });

  it('DISMISS_DRIFT sets schemaDrift to false', () => {
    const withDrift = queryReducer(initialState, { type: 'SCHEMA_DRIFT_DETECTED' });
    const dismissed = queryReducer(withDrift, { type: 'DISMISS_DRIFT' });
    expect(dismissed.schemaDrift).toBe(false);
  });

  it('SET_URL resets sharedFingerprint and schemaDrift', () => {
    const withShare = queryReducer(initialState, {
      type: 'SET_SHARED_FINGERPRINT',
      fingerprint: 'abc12345',
    });
    const withDrift = queryReducer(withShare, { type: 'SCHEMA_DRIFT_DETECTED' });
    const after = queryReducer(withDrift, {
      type: 'SET_URL',
      url: 'https://new.example.com/b.parquet',
    });
    expect(after.sharedFingerprint).toBeNull();
    expect(after.schemaDrift).toBe(false);
  });
});

describe('queryReducer — spill actions', () => {
  it('SET_SPILL_ACTIVE sets spillActive to true', () => {
    const next = queryReducer(initialState, { type: 'SET_SPILL_ACTIVE', active: true });
    expect(next.spillActive).toBe(true);
  });

  it('SET_SPILL_ACTIVE sets spillActive to false', () => {
    const withSpill = queryReducer(initialState, { type: 'SET_SPILL_ACTIVE', active: true });
    const next = queryReducer(withSpill, { type: 'SET_SPILL_ACTIVE', active: false });
    expect(next.spillActive).toBe(false);
  });
});
