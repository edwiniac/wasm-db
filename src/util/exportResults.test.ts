import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportCSV, exportJSON } from '@/util/exportResults';

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function captureCSV(
  rows: Record<string, unknown>[],
  filename: string,
): { content: string; anchor: Record<string, unknown> } {
  let capturedContent = '';
  const originalBlob = globalThis.Blob;
  class MockBlob {
    constructor(parts: BlobPart[]) {
      capturedContent = (parts[0] ?? '') as string;
    }
  }
  globalThis.Blob = MockBlob as unknown as typeof Blob;

  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor as unknown as HTMLElement);
  vi.spyOn(document.body, 'appendChild').mockReturnValueOnce(anchor as unknown as Node);

  exportCSV(rows, filename);

  globalThis.Blob = originalBlob;
  return { content: capturedContent, anchor };
}

function captureJSON(
  rows: Record<string, unknown>[],
  filename: string,
): { content: string; anchor: Record<string, unknown> } {
  let capturedContent = '';
  const originalBlob = globalThis.Blob;
  class MockBlob {
    constructor(parts: BlobPart[]) {
      capturedContent = (parts[0] ?? '') as string;
    }
  }
  globalThis.Blob = MockBlob as unknown as typeof Blob;

  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor as unknown as HTMLElement);
  vi.spyOn(document.body, 'appendChild').mockReturnValueOnce(anchor as unknown as Node);

  exportJSON(rows, filename);

  globalThis.Blob = originalBlob;
  return { content: capturedContent, anchor };
}

describe('exportCSV', () => {
  it('generates a header row from object keys', () => {
    const { content } = captureCSV([{ id: 1, city: 'Paris' }], 'out.csv');
    const lines = content.split('\n');
    expect(lines[0]).toBe('id,city');
  });

  it('generates a data row with values', () => {
    const { content } = captureCSV([{ id: 1, city: 'Paris' }], 'out.csv');
    const lines = content.split('\n');
    expect(lines[1]).toBe('1,Paris');
  });

  it('double-quotes values that contain commas', () => {
    const { content } = captureCSV([{ name: 'Smith, John' }], 'out.csv');
    const lines = content.split('\n');
    expect(lines[1]).toBe('"Smith, John"');
  });

  it('escapes interior double-quotes by doubling them', () => {
    const { content } = captureCSV([{ note: 'say "hi"' }], 'out.csv');
    const lines = content.split('\n');
    expect(lines[1]).toBe('"say ""hi"""');
  });

  it('double-quotes values that contain newlines', () => {
    const { content } = captureCSV([{ text: 'line1\nline2' }], 'out.csv');
    const lines = content.split('\n');
    expect(lines[1]!.startsWith('"')).toBe(true);
  });

  it('renders null as empty string', () => {
    const { content } = captureCSV([{ val: null }], 'out.csv');
    const lines = content.split('\n');
    expect(lines[1]).toBe('');
  });

  it('uses the provided filename for the download anchor', () => {
    const { anchor } = captureCSV([{ x: 1 }], 'query-results-12345.csv');
    expect(anchor.download).toBe('query-results-12345.csv');
  });
});

describe('exportJSON', () => {
  it('produces a pretty-printed JSON array', () => {
    const { content } = captureJSON([{ id: 1, city: 'Paris' }], 'out.json');
    const parsed = JSON.parse(content) as unknown[];
    expect(parsed).toHaveLength(1);
    expect((parsed[0] as Record<string, unknown>)['city']).toBe('Paris');
  });

  it('round-trips null values', () => {
    const { content } = captureJSON([{ score: null }], 'out.json');
    const parsed = JSON.parse(content) as unknown[];
    expect((parsed[0] as Record<string, unknown>)['score']).toBeNull();
  });

  it('uses the provided filename for the download anchor', () => {
    const { anchor } = captureJSON([{ x: 1 }], 'query-results-99999.json');
    expect(anchor.download).toBe('query-results-99999.json');
  });
});
