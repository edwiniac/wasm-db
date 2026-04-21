import { describe, it, expect } from 'vitest';
import { splitIntoChunks, joinChunks, CHUNK_SIZE } from '@/cache/chunker';

describe('splitIntoChunks', () => {
  it('returns one chunk for empty input', () => {
    const chunks = splitIntoChunks(new Uint8Array(0));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.byteLength).toBe(0);
  });

  it('returns one chunk when data fits within CHUNK_SIZE', () => {
    const data = new Uint8Array(100).fill(7);
    expect(splitIntoChunks(data)).toHaveLength(1);
  });

  it('splits data that is exactly 2x CHUNK_SIZE into two equal chunks', () => {
    const data = new Uint8Array(CHUNK_SIZE * 2).fill(1);
    const chunks = splitIntoChunks(data);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.byteLength).toBe(CHUNK_SIZE);
    expect(chunks[1]!.byteLength).toBe(CHUNK_SIZE);
  });

  it('last chunk holds the remainder when data is not a multiple of CHUNK_SIZE', () => {
    const data = new Uint8Array(CHUNK_SIZE + 500).fill(9);
    const chunks = splitIntoChunks(data);
    expect(chunks).toHaveLength(2);
    expect(chunks[1]!.byteLength).toBe(500);
  });
});

describe('joinChunks', () => {
  it('round-trips through split and join (custom chunk size for speed)', () => {
    const original = new Uint8Array(777);
    for (let i = 0; i < original.length; i++) original[i] = i % 256;
    // Use a small custom chunk size so we exercise multi-chunk logic without 4 MB allocation
    const rejoined = joinChunks(splitIntoChunks(original, 100));
    expect(rejoined).toEqual(original);
  });

  it('joins zero chunks to an empty array', () => {
    expect(joinChunks([])).toEqual(new Uint8Array(0));
  });
});
