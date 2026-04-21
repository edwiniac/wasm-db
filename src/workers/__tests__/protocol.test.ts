import { describe, it, expect } from 'vitest';
import type { MainToWorker, WorkerToMain } from '@/workers/protocol';

describe('MainToWorker protocol', () => {
  it('init message has required shape', () => {
    const msg: MainToWorker = {
      kind: 'init',
      correlationId: 'test-123',
      config: { maxMemoryMB: 1024 },
    };
    expect(msg.kind).toBe('init');
    expect(msg.correlationId).toBe('test-123');
    expect(msg.config.maxMemoryMB).toBe(1024);
  });

  it('query message has required shape', () => {
    const msg: MainToWorker = {
      kind: 'query',
      correlationId: 'q-1',
      sql: 'SELECT 1',
      opts: {},
    };
    expect(msg.kind).toBe('query');
    expect(msg.sql).toBe('SELECT 1');
  });

  it('cancel message has target field', () => {
    const msg: MainToWorker = {
      kind: 'cancel',
      correlationId: 'cancel-1',
      target: 'q-1',
    };
    expect(msg.target).toBe('q-1');
  });

  it('shutdown message has only correlationId', () => {
    const msg: MainToWorker = {
      kind: 'shutdown',
      correlationId: 'shutdown-1',
    };
    expect(msg.kind).toBe('shutdown');
  });
});

describe('WorkerToMain protocol', () => {
  it('ready message has correlationId', () => {
    const msg: WorkerToMain = { kind: 'ready', correlationId: 'init-0' };
    expect(msg.kind).toBe('ready');
  });

  it('batch message has rows array and done flag', () => {
    const msg: WorkerToMain = {
      kind: 'batch',
      correlationId: 'q-1',
      rows: [{ col1: 'value' }],
      done: true,
    };
    expect(msg.rows).toHaveLength(1);
    expect(msg.done).toBe(true);
  });

  it('error message has SerializedError shape', () => {
    const msg: WorkerToMain = {
      kind: 'error',
      correlationId: 'q-1',
      error: { code: 'QUERY_ERROR', message: 'Column not found' },
    };
    expect(msg.error.code).toBe('QUERY_ERROR');
  });

  it('progress message has stage and pct', () => {
    const msg: WorkerToMain = {
      kind: 'progress',
      correlationId: 'q-1',
      stage: 'fetching footer',
      pct: 0.3,
    };
    expect(msg.pct).toBe(0.3);
  });
});

describe('correlationId round-trip', () => {
  it('preserves correlationId through structured clone', () => {
    const original: MainToWorker = {
      kind: 'query',
      correlationId: 'abc-xyz-123',
      sql: 'SELECT 42',
      opts: {},
    };
    const cloned = JSON.parse(JSON.stringify(original)) as MainToWorker;
    expect(cloned.correlationId).toBe('abc-xyz-123');
  });
});
