/// <reference lib="webworker" />
import * as duckdb from '@duckdb/duckdb-wasm';
import type { MainToWorker, WorkerToMain, DuckDBWorkerConfig } from './protocol';
import { hasOPFS } from '@/util/featureDetect';
import { workerLogger } from '@/util/logger';

const BUNDLES = duckdb.getJsDelivrBundles();

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let activeQueryCorrId: string | null = null;
let configMemoryMB = 1024;

function post(msg: WorkerToMain): void {
  self.postMessage(msg);
}

async function handleInit(correlationId: string, config: DuckDBWorkerConfig): Promise<void> {
  if (db !== null) {
    // Already initialised — ignore duplicate init (e.g. React StrictMode double-mount)
    post({ kind: 'ready', correlationId, spillActive: false });
    return;
  }
  try {
    configMemoryMB = config.maxMemoryMB;
    const bundle = await duckdb.selectBundle(BUNDLES);

    // COEP require-corp blocks cross-origin worker scripts; wrap in a blob URL
    // so the nested DuckDB worker appears same-origin.
    const workerBlob = new Blob([`importScripts("${bundle.mainWorker!}");`], {
      type: 'text/javascript',
    });
    const workerUrl = URL.createObjectURL(workerBlob);
    const worker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);
    const logger = new duckdb.VoidLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);

    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    conn = await db.connect();
    await conn.query(`SET memory_limit='${config.maxMemoryMB}MB'`);

    let spillActive = false;
    if (await hasOPFS()) {
      try {
        await conn.query(`SET temp_directory='opfs://duckdb-tmp'`);
        spillActive = true;
      } catch (err) {
        workerLogger.warn('OPFS spill setup failed — running without disk spill', err);
      }
    }

    post({ kind: 'ready', correlationId, spillActive });
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

function deepSerialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string')
    return value;
  if (Array.isArray(value)) return value.map(deepSerialize);
  if (typeof value === 'object') {
    // Arrow List/Vector types expose toArray() — convert before recursing
    if ('toArray' in value && typeof (value as Record<string, unknown>)['toArray'] === 'function') {
      return (value as { toArray: () => unknown[] }).toArray().map(deepSerialize);
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, deepSerialize(v)]),
    );
  }
  return String(value);
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = deepSerialize(v);
  }
  return out;
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

    // Convert Arrow table to plain objects; BigInt (INT64) values are stringified for postMessage compatibility
    const rows: Record<string, unknown>[] = result
      .toArray()
      .map((row) => sanitizeRow(row.toJSON() as Record<string, unknown>));

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

async function handleRegisterFile(
  correlationId: string,
  alias: string,
  url: string,
): Promise<void> {
  if (!conn) {
    post({
      kind: 'error',
      correlationId,
      error: { code: 'WORKER_ERROR', message: 'Worker not initialised — send init first' },
    });
    return;
  }
  try {
    const safeUrl = url.replace(/'/g, "''");
    await conn.query(`CREATE OR REPLACE VIEW ${alias} AS SELECT * FROM parquet_scan('${safeUrl}')`);
    post({ kind: 'batch', correlationId, rows: [], done: true });
  } catch (err) {
    post({
      kind: 'error',
      correlationId,
      error: {
        code: 'QUERY_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

async function handleUnregisterFile(correlationId: string, alias: string): Promise<void> {
  if (!conn) {
    post({
      kind: 'error',
      correlationId,
      error: { code: 'WORKER_ERROR', message: 'Worker not initialised — send init first' },
    });
    return;
  }
  try {
    await conn.query(`DROP VIEW IF EXISTS ${alias}`);
    post({ kind: 'batch', correlationId, rows: [], done: true });
  } catch (err) {
    post({
      kind: 'error',
      correlationId,
      error: {
        code: 'QUERY_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
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
    case 'register_file':
      void handleRegisterFile(msg.correlationId, msg.alias, msg.url);
      break;
    case 'unregister_file':
      void handleUnregisterFile(msg.correlationId, msg.alias);
      break;
  }
});
