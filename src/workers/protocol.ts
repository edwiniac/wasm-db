export interface DuckDBWorkerConfig {
  maxMemoryMB: number;
}

export interface QueryOpts {
  timeoutMs?: number;
}

export interface SerializedError {
  code: string;
  message: string;
  stack?: string;
}

export type MainToWorker =
  | { kind: 'init'; correlationId: string; config: DuckDBWorkerConfig }
  | { kind: 'query'; correlationId: string; sql: string; opts: QueryOpts }
  | { kind: 'cancel'; correlationId: string; target: string }
  | { kind: 'shutdown'; correlationId: string };

export type WorkerToMain =
  | { kind: 'ready'; correlationId: string; spillActive: boolean }
  | { kind: 'batch'; correlationId: string; rows: Record<string, unknown>[]; done: boolean }
  | { kind: 'error'; correlationId: string; error: SerializedError }
  | { kind: 'progress'; correlationId: string; stage: string; pct: number };
