import { describe, it, expect } from 'vitest';
import { filesReducer, validateAlias, initialFilesState, MAX_FILES } from './filesState';
import type { RegisteredFile } from './filesState';

describe('filesReducer — ADD_FILE', () => {
  it('adds a new file with given id, empty alias and url, idle status', () => {
    const next = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({ id: 'f1', alias: '', url: '', status: 'idle' });
  });

  it('does not add beyond MAX_FILES', () => {
    const full: RegisteredFile[] = Array.from({ length: MAX_FILES }, (_, i) => ({
      id: `f${i}`,
      alias: `t${i}`,
      url: `http://x.com/${i}.parquet`,
      status: 'ready' as const,
    }));
    const next = filesReducer(full, { type: 'ADD_FILE', id: 'overflow' });
    expect(next).toHaveLength(MAX_FILES);
  });
});

describe('filesReducer — UPDATE_FILE_ALIAS', () => {
  it('updates alias for matching id, leaves others unchanged', () => {
    const state = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    const next = filesReducer(state, { type: 'UPDATE_FILE_ALIAS', id: 'f1', alias: 'sales' });
    expect(next[0].alias).toBe('sales');
  });

  it('does not mutate other files', () => {
    let state = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    state = filesReducer(state, { type: 'ADD_FILE', id: 'f2' });
    const next = filesReducer(state, { type: 'UPDATE_FILE_ALIAS', id: 'f1', alias: 'sales' });
    expect(next[1].alias).toBe('');
  });
});

describe('filesReducer — UPDATE_FILE_URL', () => {
  it('updates url for matching id', () => {
    const state = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    const next = filesReducer(state, {
      type: 'UPDATE_FILE_URL',
      id: 'f1',
      url: 'http://x.com/a.parquet',
    });
    expect(next[0].url).toBe('http://x.com/a.parquet');
  });
});

describe('filesReducer — probe lifecycle', () => {
  it('FILE_PROBE_START sets status to probing', () => {
    const state = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    const next = filesReducer(state, { type: 'FILE_PROBE_START', id: 'f1' });
    expect(next[0].status).toBe('probing');
  });

  it('FILE_PROBE_DONE sets status to ready', () => {
    const s1 = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    const s2 = filesReducer(s1, { type: 'FILE_PROBE_START', id: 'f1' });
    const next = filesReducer(s2, { type: 'FILE_PROBE_DONE', id: 'f1' });
    expect(next[0].status).toBe('ready');
  });

  it('FILE_PROBE_ERROR sets status to error', () => {
    const state = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    const next = filesReducer(state, { type: 'FILE_PROBE_ERROR', id: 'f1' });
    expect(next[0].status).toBe('error');
  });
});

describe('filesReducer — REMOVE_FILE', () => {
  it('removes the file with matching id', () => {
    const s1 = filesReducer(initialFilesState, { type: 'ADD_FILE', id: 'f1' });
    const s2 = filesReducer(s1, { type: 'ADD_FILE', id: 'f2' });
    const next = filesReducer(s2, { type: 'REMOVE_FILE', id: 'f1' });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('f2');
  });
});

describe('validateAlias', () => {
  it('returns null for a valid alias with no conflicts', () => {
    expect(validateAlias('sales_2024', [])).toBeNull();
  });

  it('rejects empty string', () => {
    expect(validateAlias('', [])).toBeTruthy();
  });

  it('rejects alias starting with a digit', () => {
    expect(validateAlias('2sales', [])).toBeTruthy();
  });

  it('rejects alias with hyphens or spaces', () => {
    expect(validateAlias('my-alias', [])).toBeTruthy();
    expect(validateAlias('my alias', [])).toBeTruthy();
  });

  it('rejects alias longer than 32 characters', () => {
    expect(validateAlias('a'.repeat(33), [])).toBeTruthy();
  });

  it('rejects reserved SQL keywords (case-insensitive)', () => {
    expect(validateAlias('select', [])).toBeTruthy();
    expect(validateAlias('FROM', [])).toBeTruthy();
    expect(validateAlias('Join', [])).toBeTruthy();
  });

  it('rejects duplicate alias', () => {
    expect(validateAlias('sales', ['sales', 'orders'])).toBeTruthy();
  });

  it('accepts underscore-leading alias', () => {
    expect(validateAlias('_private', [])).toBeNull();
  });

  it('accepts 32-character alias', () => {
    expect(validateAlias('a'.repeat(32), [])).toBeNull();
  });
});
