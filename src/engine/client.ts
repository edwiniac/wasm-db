import type { MainToWorker, WorkerToMain } from '@/workers/protocol';
import type { QueryHandle, QueryOpts, Batch, QuerySummary } from './types';
import { QueryCancelledError, QueryError, WorkerCrashError } from '@/errors';

type WorkerFactory = () => Worker;

// --- QueryHandle implementation ---

class QueryHandleImpl implements QueryHandle {
  readonly id: string;
  private _batches: Batch[] = [];
  private _doneResolve!: (s: QuerySummary) => void;
  private _doneReject!: (e: Error) => void;
  private _startedAt = Date.now();
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
      this._doneResolve({ rowCount, durationMs: Date.now() - this._startedAt });
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
  private crashError: WorkerCrashError | null = null;
  private readonly initCorrelationId: string;
  private pendingVoid = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
  private _spillActive = false;

  get spillActive(): boolean {
    return this._spillActive;
  }

  constructor(workerFactory?: WorkerFactory) {
    this.initCorrelationId = crypto.randomUUID();
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
      correlationId: this.initCorrelationId,
      config: { maxMemoryMB: 1024 },
    } satisfies MainToWorker);
  }

  private _handleMessage(msg: WorkerToMain): void {
    switch (msg.kind) {
      case 'ready':
        this._spillActive = msg.spillActive;
        this.readyResolve();
        break;

      case 'batch': {
        const voidEntry = this.pendingVoid.get(msg.correlationId);
        if (voidEntry) {
          if (msg.done) {
            voidEntry.resolve();
            this.pendingVoid.delete(msg.correlationId);
          }
          return;
        }
        const handle = this.pending.get(msg.correlationId);
        if (!handle) return;
        handle._receiveBatch(msg.rows, msg.done);
        if (msg.done) this.pending.delete(msg.correlationId);
        break;
      }

      case 'error': {
        const voidEntry = this.pendingVoid.get(msg.correlationId);
        if (voidEntry) {
          voidEntry.reject(new QueryError(msg.error.message));
          this.pendingVoid.delete(msg.correlationId);
          return;
        }
        const handle = this.pending.get(msg.correlationId);
        if (handle) {
          const err =
            msg.error.code === 'QUERY_CANCELLED'
              ? new QueryCancelledError(msg.error.message)
              : new QueryError(msg.error.message);
          handle._receiveError(err);
          this.pending.delete(msg.correlationId);
        } else if (msg.correlationId === this.initCorrelationId) {
          this.crashError = new WorkerCrashError(msg.error.message);
          this.readyReject(this.crashError);
        }
        break;
      }

      case 'progress':
        // Phase 3: propagate to UI progress state
        break;
    }
  }

  private _handleWorkerError(e: ErrorEvent): void {
    this.crashError = new WorkerCrashError(`DuckDB worker crashed: ${e.message}`);
    for (const handle of this.pending.values()) {
      handle._receiveError(this.crashError);
    }
    this.pending.clear();
    this._drainPendingVoid(this.crashError);
  }

  private _drainPendingVoid(err: Error): void {
    for (const { reject } of this.pendingVoid.values()) {
      reject(err);
    }
    this.pendingVoid.clear();
  }

  async runQuery(sql: string, _opts: QueryOpts = {}): Promise<QueryHandle> {
    if (this.crashError) throw this.crashError;
    await this.readyPromise;
    if (this.crashError) throw this.crashError;
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

  async registerFile(alias: string, url: string): Promise<void> {
    if (this.crashError) throw this.crashError;
    await this.readyPromise;
    if (this.crashError) throw this.crashError;
    const id = crypto.randomUUID();
    return new Promise<void>((resolve, reject) => {
      this.pendingVoid.set(id, { resolve, reject });
      this.worker.postMessage({
        kind: 'register_file',
        correlationId: id,
        alias,
        url,
      } satisfies MainToWorker);
    });
  }

  async unregisterFile(alias: string): Promise<void> {
    if (this.crashError) throw this.crashError;
    await this.readyPromise;
    if (this.crashError) throw this.crashError;
    const id = crypto.randomUUID();
    return new Promise<void>((resolve, reject) => {
      this.pendingVoid.set(id, { resolve, reject });
      this.worker.postMessage({
        kind: 'unregister_file',
        correlationId: id,
        alias,
      } satisfies MainToWorker);
    });
  }

  shutdown(): void {
    this.worker.postMessage({
      kind: 'shutdown',
      correlationId: crypto.randomUUID(),
    } satisfies MainToWorker);
    this._drainPendingVoid(new WorkerCrashError('Worker shut down'));
    this.worker.terminate();
  }
}
