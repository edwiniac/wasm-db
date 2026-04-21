// Wraps EngineClient and HttpTransport so UI never imports from engine/ or transport/ directly.
// Phase 2: this moves into Zustand actions.
import { EngineClient } from '@/engine/client';
import { HttpTransport } from '@/transport/http';
import { StubCache } from '@/cache/stub';
import type { QueryHandle } from '@/engine/types';

let engine: EngineClient | null = null;
const transport = new HttpTransport({ cache: new StubCache() });

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
