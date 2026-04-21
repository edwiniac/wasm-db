export type { QueryOpts } from '@/workers/protocol';

export interface Batch {
  rows: Record<string, unknown>[];
}

export interface QuerySummary {
  rowCount: number;
  durationMs: number;
}

export interface QueryHandle {
  readonly id: string;
  cancel(): void;
  readonly stream: AsyncIterable<Batch>;
  readonly done: Promise<QuerySummary>;
}
