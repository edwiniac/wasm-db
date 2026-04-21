/// <reference lib="webworker" />
import * as duckdb from '@duckdb/duckdb-wasm';
import type { MainToWorker, WorkerToMain, DuckDBWorkerConfig } from './protocol';

const BUNDLES = duckdb.getJsDelivrBundles();

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let activeQueryCorrId: string | null = null;
let configMemoryMB = 1024;

function post(msg: WorkerToMain): void {
  self.postMessage(msg);
}

async function handleInit(correlationId: string, config: DuckDBWorkerConfig): Promise<void> {
  try {
    configMemoryMB = config.maxMemoryMB;
    const bundle = await duckdb.selectBundle(BUNDLES);

    const worker = new Worker(bundle.mainWorker!, { type: 'classic' });
    const logger = new duckdb.VoidLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);

    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    conn = await db.connect();
    await conn.query(`SET memory_limit='${config.maxMemoryMB}MB'`);

    post({ kind: 'ready', correlationId });
  } catch (err) {
    post({
      kind: 'error',
      correlationId,
      error: {
        code: 'WORKER_ERROR',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
    });
  }
}

async function handleQuery(correlationId: string, sql: string): Promise<void> {
  if (!conn) {
    post({
      kind: 'error',
      correlationId,
      error: { code: 'WORKER_ERROR', message: 'Worker not initialised — send init first' },
    });
    return;
  }

  activeQueryCorrId = correlationId;

  try {
    post({ kind: 'progress', correlationId, stage: 'executing', pct: 0 });

    const result = await conn.query(sql);

    // Convert Arrow table to plain objects; BigInt values serialize as strings (known Phase 1 limitation)
    const rows: Record<string, unknown>[] = result
      .toArray()
      .map((row) => row.toJSON() as Record<string, unknown>);

    post({ kind: 'batch', correlationId, rows, done: true });
  } catch (err) {
    post({
      kind: 'error',
      correlationId,
      error: {
        code: 'QUERY_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    });
  } finally {
    activeQueryCorrId = null;
  }
}

async function handleCancel(_correlationId: string, target: string): Promise<void> {
  if (!db || !conn || activeQueryCorrId !== target) return;

  try {
    await conn.cancelSent();
    await conn.close();
    conn = await db.connect();
    await conn.query(`SET memory_limit='${configMemoryMB}MB'`);
  } catch {
    // ignore errors during cancel
  }

  post({
    kind: 'error',
    correlationId: target,
    error: { code: 'QUERY_CANCELLED', message: 'Query cancelled by user' },
  });
}

async function handleShutdown(): Promise<void> {
  try {
    await conn?.close();
    await db?.terminate();
  } finally {
    self.close();
  }
}

self.addEventListener('message', (event: MessageEvent<MainToWorker>) => {
  const msg = event.data;
  switch (msg.kind) {
    case 'init':
      void handleInit(msg.correlationId, msg.config);
      break;
    case 'query':
      void handleQuery(msg.correlationId, msg.sql);
      break;
    case 'cancel':
      void handleCancel(msg.correlationId, msg.target);
      break;
    case 'shutdown':
      void handleShutdown();
      break;
  }
});
