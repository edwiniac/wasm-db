import type { MainToWorker, WorkerToMain } from '@/workers/protocol';
import type { QueryHandle, QueryOpts, Batch, QuerySummary } from './types';
import { QueryError, WorkerError } from '@/errors';

type WorkerFactory = () => Worker;

// --- QueryHandle implementation ---

class QueryHandleImpl implements QueryHandle {
  readonly id: string;
  private _batches: Batch[] = [];
  private _doneResolve!: (s: QuerySummary) => void;
  private _doneReject!: (e: Error) => void;
  readonly done: Promise<QuerySummary>;

  constructor(
    id: string,
    private readonly _sendCancel: () => void,
  ) {
    this.id = id;
    this.done = new Promise<QuerySummary>((res, rej) => {
      this._doneResolve = res;
      this._doneReject = rej;
    });
  }

  cancel(): void {
    this._sendCancel();
  }

  _receiveBatch(rows: Record<string, unknown>[], isDone: boolean): void {
    if (rows.length > 0) this._batches.push({ rows });
    if (isDone) {
      const rowCount = this._batches.reduce((n, b) => n + b.rows.length, 0);
      this._doneResolve({ rowCount, durationMs: 0 });
    }
  }

  _receiveError(err: Error): void {
    this._doneReject(err);
  }

  get stream(): AsyncIterable<Batch> {
    const batches = this._batches;
    const done = this.done;
    return {
      async *[Symbol.asyncIterator]() {
        await done; // wait for all batches (Phase 1 — not true streaming)
        for (const batch of batches) yield batch;
      },
    };
  }
}

// --- EngineClient ---

export class EngineClient {
  private worker: Worker;
  private pending = new Map<string, QueryHandleImpl>();
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (e: Error) => void;

  constructor(workerFactory?: WorkerFactory) {
    this.readyPromise = new Promise<void>((res, rej) => {
      this.readyResolve = res;
      this.readyReject = rej;
    });

    this.worker = workerFactory
      ? workerFactory()
      : new Worker(new URL('../workers/duckdb.worker.ts', import.meta.url), { type: 'module' });

    this.worker.onmessage = (e: MessageEvent<WorkerToMain>) => this._handleMessage(e.data);
    this.worker.onerror = (e: ErrorEvent) => this._handleWorkerError(e);

    this.worker.postMessage({
      kind: 'init',
      correlationId: 'init-0',
      config: { maxMemoryMB: 1024 },
    } satisfies MainToWorker);
  }

  private _handleMessage(msg: WorkerToMain): void {
    switch (msg.kind) {
      case 'ready':
        this.readyResolve();
        break;

      case 'batch': {
        const handle = this.pending.get(msg.correlationId);
        if (!handle) return;
        handle._receiveBatch(msg.rows, msg.done);
        if (msg.done) this.pending.delete(msg.correlationId);
        break;
      }

      case 'error': {
        const handle = this.pending.get(msg.correlationId);
        if (handle) {
          handle._receiveError(new QueryError(msg.error.message));
          this.pending.delete(msg.correlationId);
        } else if (msg.correlationId === 'init-0') {
          this.readyReject(new WorkerError(msg.error.message));
        }
        break;
      }

      case 'progress':
        // Phase 3: propagate to UI progress state
        break;
    }
  }

  private _handleWorkerError(e: ErrorEvent): void {
    const err = new WorkerError(`DuckDB worker crashed: ${e.message}`);
    for (const handle of this.pending.values()) {
      handle._receiveError(err);
    }
    this.pending.clear();
  }

  async runQuery(sql: string, _opts: QueryOpts = {}): Promise<QueryHandle> {
    await this.readyPromise;
    const id = crypto.randomUUID();

    const handle = new QueryHandleImpl(id, () => {
      this.worker.postMessage({
        kind: 'cancel',
        correlationId: crypto.randomUUID(),
        target: id,
      } satisfies MainToWorker);
    });

    this.pending.set(id, handle);

    this.worker.postMessage({
      kind: 'query',
      correlationId: id,
      sql,
      opts: {},
    } satisfies MainToWorker);

    return handle;
  }

  shutdown(): void {
    this.worker.postMessage({
      kind: 'shutdown',
      correlationId: crypto.randomUUID(),
    } satisfies MainToWorker);
    this.worker.terminate();
  }
}
