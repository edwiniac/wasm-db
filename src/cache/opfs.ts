import type { ICache, CacheKey } from './types';
import { logger } from '@/util/logger';

function fnv1a32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function keyToFilename(key: CacheKey): string {
  const raw = `${key.url}::${key.etag ?? ''}::${key.lastModified ?? ''}`;
  return `${fnv1a32(raw).toString(16)}-${key.start}-${key.end}`;
}

export class OPFSCache implements ICache {
  private dirPromise: Promise<FileSystemDirectoryHandle> | null = null;

  private getDir(): Promise<FileSystemDirectoryHandle> {
    if (!this.dirPromise) {
      this.dirPromise = navigator.storage
        .getDirectory()
        .then((root) => root.getDirectoryHandle('wasm-db-cache', { create: true }));
    }
    return this.dirPromise;
  }

  async get(key: CacheKey): Promise<Uint8Array | null> {
    try {
      const dir = await this.getDir();
      const fileHandle = await dir.getFileHandle(keyToFilename(key));
      const file = await fileHandle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch {
      return null;
    }
  }

  set(key: CacheKey, data: Uint8Array): void {
    void (async () => {
      try {
        const dir = await this.getDir();
        const fileHandle = await dir.getFileHandle(keyToFilename(key), { create: true });
        const writable = await fileHandle.createWritable();
        // Copy into a fresh Uint8Array backed by a plain ArrayBuffer to satisfy
        // the DOM FileSystemWriteChunkType constraint (requires ArrayBuffer, not SharedArrayBuffer).
        const copy = new Uint8Array(data) as unknown as ArrayBufferView<ArrayBuffer>;
        await writable.write(copy);
        await writable.close();
      } catch (err) {
        logger.warn('OPFS cache write failed', err);
      }
    })();
  }

  async clear(): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('wasm-db-cache', { recursive: true });
      this.dirPromise = null;
    } catch (err) {
      logger.warn('OPFS cache clear failed', err);
    }
  }
}
