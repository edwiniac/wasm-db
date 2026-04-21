import { describe, it, expect, vi, afterEach } from 'vitest';
import { CORSError, RangeNotSupportedError, TransportError } from '@/errors';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  vi.clearAllMocks();
});

function makeResponse(
  status: number,
  headers: Record<string, string> = {},
  body: Uint8Array = new Uint8Array([1, 2, 3]),
): Response {
  return new Response(body.buffer as ArrayBuffer, {
    status,
    headers: new Headers(headers),
  });
}

describe('probeURL', () => {
  it('returns supportsRanges=true for 206 with Accept-Ranges: bytes', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(206, {
        'Accept-Ranges': 'bytes',
        'Content-Range': 'bytes 0-0/1024',
        'Content-Length': '1024',
        ETag: '"abc123"',
      }),
    );
    const { HttpTransport } = await import('@/transport/http');
    const transport = new HttpTransport();
    const result = await transport.probeURL('https://example.com/data.parquet');
    expect(result.supportsRanges).toBe(true);
    expect(result.contentLength).toBe(1024);
    expect(result.etag).toBe('"abc123"');
  });

  it('sends Range: bytes=0-0 header in probe request', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(206, { 'Accept-Ranges': 'bytes', 'Content-Range': 'bytes 0-0/1024' }),
    );
        const { HttpTransport } = await import('@/transport/http');
    const transport = new HttpTransport();
    await transport.probeURL('https://example.com/data.parquet');
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Range']).toBe('bytes=0-0');
  });

  it('throws CORSError on network/CORS block (TypeError)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const { HttpTransport } = await import('@/transport/http');
    const transport = new HttpTransport();
    await expect(
      transport.probeURL('https://no-cors.example.com/data.parquet'),
    ).rejects.toBeInstanceOf(CORSError);
  });

  it('throws RangeNotSupportedError on 200 response (no range support)', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, {}));
        const { HttpTransport } = await import('@/transport/http');
    const transport = new HttpTransport();
    await expect(
      transport.probeURL('https://example.com/no-range.parquet'),
    ).rejects.toBeInstanceOf(RangeNotSupportedError);
  });
});

describe('fetchRange', () => {
  it('sends correct Range header', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(206, { 'Content-Range': 'bytes 100-199/1024' }, new Uint8Array(100)),
    );
        const { HttpTransport } = await import('@/transport/http');
    const transport = new HttpTransport();
    await transport.fetchRange(
      'https://example.com/data.parquet',
      100,
      199,
      new AbortController().signal,
    );
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Range']).toBe('bytes=100-199');
  });

  it('returns Uint8Array of response body', async () => {
    const body = new Uint8Array([10, 20, 30]);
    mockFetch.mockResolvedValueOnce(makeResponse(206, {}, body));
        const { HttpTransport } = await import('@/transport/http');
    const transport = new HttpTransport();
    const result = await transport.fetchRange(
      'https://example.com/data.parquet',
      0,
      2,
      new AbortController().signal,
    );
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([10, 20, 30]);
  });

  it('retries on 5xx up to 3 times', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(206, {}, new Uint8Array([1])));
        const { HttpTransport } = await import('@/transport/http');
    const transport = new HttpTransport({ retryDelaysMs: [0, 0, 0] });
    const result = await transport.fetchRange(
      'https://example.com/data.parquet',
      0,
      0,
      new AbortController().signal,
    );
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('throws TransportError after 3 failed retries', async () => {
    mockFetch.mockResolvedValue(makeResponse(503));
        const { HttpTransport } = await import('@/transport/http');
    const transport = new HttpTransport({ retryDelaysMs: [0, 0, 0] });
    await expect(
      transport.fetchRange(
        'https://example.com/data.parquet',
        0,
        0,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(TransportError);
  });

  it('falls back to full GET on 416 for files under size limit', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(416))
      .mockResolvedValueOnce(makeResponse(200, { 'Content-Length': '100' }, new Uint8Array(100)));
        const { HttpTransport } = await import('@/transport/http');
    const transport = new HttpTransport({ smallFileLimitBytes: 200, retryDelaysMs: [] });
    const result = await transport.fetchRange(
      'https://example.com/tiny.parquet',
      0,
      99,
      new AbortController().signal,
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('throws RangeNotSupportedError on 416 for large files', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(416));
        const { HttpTransport } = await import('@/transport/http');
    const transport = new HttpTransport({ smallFileLimitBytes: 0, retryDelaysMs: [] });
    await expect(
      transport.fetchRange(
        'https://example.com/huge.parquet',
        0,
        999,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(RangeNotSupportedError);
  });

  it('respects AbortSignal and does not retry', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });
        const { HttpTransport } = await import('@/transport/http');
    const transport = new HttpTransport({ retryDelaysMs: [] });
    await expect(
      transport.fetchRange('https://example.com/data.parquet', 0, 99, controller.signal),
    ).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
