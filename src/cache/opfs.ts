import type { ICache, CacheKey } from './types';
import { logger } from '@/util/logger';

// 64-bit FNV-1a via two 32-bit halves to avoid birthday collisions in the 32-bit space.
function fnv1a64hex(str: string): string {
  let hi = 2166136261;
  let lo = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    lo ^= c;
    // Multiply (hi:lo) by FNV prime 16777619 as two 32-bit words
    const newLo = Math.imul(lo, 16777619) >>> 0;
    const newHi = (Math.imul(hi, 16777619) + Math.imul(lo, 0)) >>> 0;
    lo = newLo;
    hi = newHi;
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

function keyToFilename(key: CacheKey): string {
  const raw = `${key.url}::${key.etag ?? ''}::${key.lastModified ?? ''}`;
  return `${fnv1a64hex(raw)}-${key.start}-${key.end}`;
}

export class OPFSCache implements ICache {
  private dirPromise: Promise<FileSystemDirectoryHandle> | null = null;

  private getDir(): Promise<FileSystemDirectoryHandle> {
    if (!this.dirPromise) {
      this.dirPromise = navigator.storage
        .getDirectory()
        .then((root) => root.getDirectoryHandle('wasm-db-cache', { create: true }))
        .catch((err) => {
          this.dirPromise = null; // allow retry on next call
          throw err;
        });
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
