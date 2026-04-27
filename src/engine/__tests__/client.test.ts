import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WorkerToMain } from '@/workers/protocol';

// --- Mock Worker ---
class MockWorker extends EventTarget {
  postMessage = vi.fn();
  terminate = vi.fn();
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;

  simulateMessage(data: WorkerToMain): void {
    const event = new MessageEvent('message', { data });
    this.dispatchEvent(event);
    this.onmessage?.(event);
  }
}

let mockWorker: MockWorker;

vi.mock('@/workers/duckdb.worker.ts?worker', () => ({}));

describe('EngineClient', () => {
  beforeEach(() => {
    mockWorker = new MockWorker();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends init message on construction', async () => {
    const { EngineClient } = await import('@/engine/client');
    const client = new EngineClient(() => mockWorker as unknown as Worker);

    expect(mockWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'init', config: { maxMemoryMB: 1024 } }),
    );
    client.shutdown();
  });

  it('runQuery sends query message and returns QueryHandle', async () => {
    vi.resetModules();
    const { EngineClient } = await import('@/engine/client');
    const client = new EngineClient(() => mockWorker as unknown as Worker);

    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0', spillActive: false });

    const handle = await client.runQuery('SELECT 1');

    expect(mockWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'query', sql: 'SELECT 1' }),
    );
    expect(handle.id).toBeDefined();
    client.shutdown();
  });

  it('QueryHandle.done resolves when batch with done=true arrives', async () => {
    vi.resetModules();
    const { EngineClient } = await import('@/engine/client');
    const client = new EngineClient(() => mockWorker as unknown as Worker);

    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0', spillActive: false });

    const handle = await client.runQuery('SELECT 42 AS n');
    const queryMsg = mockWorker.postMessage.mock.calls.find(
      (call) => (call[0] as { kind: string }).kind === 'query',
    )![0] as { correlationId: string };

    mockWorker.simulateMessage({
      kind: 'batch',
      correlationId: queryMsg.correlationId,
      rows: [{ n: 42 }],
      done: true,
    });

    const summary = await handle.done;
    expect(summary.rowCount).toBe(1);
    client.shutdown();
  });

  it('QueryHandle.done rejects on error message', async () => {
    vi.resetModules();
    const { EngineClient } = await import('@/engine/client');
    const client = new EngineClient(() => mockWorker as unknown as Worker);

    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0', spillActive: false });

    const handle = await client.runQuery('INVALID SQL');
    const queryMsg = mockWorker.postMessage.mock.calls.find(
      (call) => (call[0] as { kind: string }).kind === 'query',
    )![0] as { correlationId: string };

    mockWorker.simulateMessage({
      kind: 'error',
      correlationId: queryMsg.correlationId,
      error: { code: 'QUERY_ERROR', message: 'Parser error' },
    });

    await expect(handle.done).rejects.toThrow('Parser error');
    client.shutdown();
  });

  it('cancel sends cancel message to worker', async () => {
    vi.resetModules();
    const { EngineClient } = await import('@/engine/client');
    const client = new EngineClient(() => mockWorker as unknown as Worker);

    mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0', spillActive: false });

    const handle = await client.runQuery('SELECT sleep(10)');
    handle.cancel();

    expect(mockWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'cancel', target: handle.id }),
    );
    client.shutdown();
  });

  it('shutdown calls worker.terminate', async () => {
    vi.resetModules();
    const { EngineClient } = await import('@/engine/client');
    const client = new EngineClient(() => mockWorker as unknown as Worker);

    client.shutdown();
    expect(mockWorker.terminate).toHaveBeenCalled();
  });

  describe('EngineClient — spillActive', () => {
    it('spillActive is true when ready message has spillActive: true', async () => {
      vi.resetModules();
      const { EngineClient } = await import('@/engine/client');
      const client = new EngineClient(() => mockWorker as unknown as Worker);

      mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0', spillActive: true });

      expect(client.spillActive).toBe(true);
      client.shutdown();
    });

    it('spillActive is false when ready message has spillActive: false', async () => {
      vi.resetModules();
      const { EngineClient } = await import('@/engine/client');
      const client = new EngineClient(() => mockWorker as unknown as Worker);

      mockWorker.simulateMessage({ kind: 'ready', correlationId: 'init-0', spillActive: false });

      expect(client.spillActive).toBe(false);
      client.shutdown();
    });
  });
});
