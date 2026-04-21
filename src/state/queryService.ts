import { EngineClient } from '@/engine/client';
import { HttpTransport } from '@/transport/http';
import { MemoryLRU } from '@/cache/memory';
import { IndexedDBCache } from '@/cache/indexeddb';
import { TieredCache } from '@/cache/tiered';
import { db } from '@/cache/db';
import type { QueryHandle } from '@/engine/types';

let engine: EngineClient | null = null;

const cache = new TieredCache(new MemoryLRU(), new IndexedDBCache(db));
const transport = new HttpTransport({ cache });

export function getTransport(): HttpTransport {
  return transport;
}

export function getEngine(): EngineClient {
  if (!engine) engine = new EngineClient();
  return engine;
}

export function shutdownEngine(): void {
  engine?.shutdown();
  engine = null;
}

export type { QueryHandle };
