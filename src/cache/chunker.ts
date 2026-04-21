export const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MiB — Firefox IndexedDB per-value limit

export function splitIntoChunks(data: Uint8Array, size = CHUNK_SIZE): Uint8Array[] {
  if (data.byteLength === 0) return [new Uint8Array(0)];
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.byteLength; offset += size) {
    chunks.push(data.slice(offset, Math.min(offset + size, data.byteLength)));
  }
  return chunks;
}

export function joinChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0);
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
