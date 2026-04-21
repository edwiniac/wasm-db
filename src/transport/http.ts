import type { ITransport, ProbeResult } from './types';
import type { ICache, CacheKey } from '@/cache/types';
import { AppError, CORSError, RangeNotSupportedError, TransportError } from '@/errors';
import { logger } from '@/util/logger';

const DEFAULT_SMALL_FILE_LIMIT_BYTES = 10 * 1024 * 1024;
const DEFAULT_RETRY_DELAYS_MS = [100, 500, 1000];

export interface HttpTransportOptions {
  cache?: ICache;
  retryDelaysMs?: number[];
  smallFileLimitBytes?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export class HttpTransport implements ITransport {
  private readonly cache: ICache | null;
  private readonly retryDelays: number[];
  private readonly smallFileLimitBytes: number;

  constructor(options: HttpTransportOptions = {}) {
    this.cache = options.cache ?? null;
    this.retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.smallFileLimitBytes = options.smallFileLimitBytes ?? DEFAULT_SMALL_FILE_LIMIT_BYTES;
  }

  async probeURL(url: string, signal?: AbortSignal): Promise<ProbeResult> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new CORSError(url, err);
    }

    if (response.status !== 206) {
      throw new RangeNotSupportedError(url);
    }

    const contentRangeHeader = response.headers.get('Content-Range');
    const totalMatch = contentRangeHeader?.match(/\/(\d+)$/);
    const contentLength = totalMatch ? parseInt(totalMatch[1]!, 10) : null;

    return {
      supportsRanges: true,
      contentLength,
      etag: response.headers.get('ETag'),
      lastModified: response.headers.get('Last-Modified'),
    };
  }

  async fetchRange(
    url: string,
    start: number,
    end: number,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    if (this.cache) {
      const key: CacheKey = { url, start, end, contentLength: end - start + 1 };
      const cached = await this.cache.get(key);
      if (cached) {
        logger.debug(`cache hit: ${url} [${start}-${end}]`);
        return cached;
      }
    }

    const result = await this._fetchWithRetry(url, start, end, signal);

    if (this.cache) {
      const key: CacheKey = { url, start, end, contentLength: result.byteLength };
      this.cache.set(key, result);
    }

    return result;
  }

  private async _fetchWithRetry(
    url: string,
    start: number,
    end: number,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    let lastError: Error = new TransportError(`Failed to fetch ${url}`);

    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      if (attempt > 0) {
        const delayMs = this.retryDelays[attempt - 1]!;
        logger.debug(`retry ${attempt} for ${url} after ${delayMs}ms`);
        await delay(delayMs);
      }

      try {
        const response = await fetch(url, {
          headers: { Range: `bytes=${start}-${end}` },
          signal,
        });

        if (response.status === 416) {
          return await this._handle416(url, end, signal);
        }

        if (response.status === 206 || response.status === 200) {
          const buffer = await response.arrayBuffer();
          return new Uint8Array(buffer);
        }

        if (response.status >= 500) {
          lastError = new TransportError(`Server error ${response.status} for ${url}`);
          continue;
        }

        throw new TransportError(`Unexpected status ${response.status} for ${url}`);
      } catch (err) {
        if (isAbortError(err)) throw err;
        // Application-level errors (CORS, range not supported) are non-retryable
        if (err instanceof AppError) throw err;
        lastError = err instanceof Error ? err : new TransportError(String(err));
        if (attempt === this.retryDelays.length) break;
      }
    }

    throw new TransportError(`Exhausted retries for ${url}`, lastError);
  }

  private async _handle416(url: string, end: number, signal: AbortSignal): Promise<Uint8Array> {
    if (end + 1 > this.smallFileLimitBytes) {
      throw new RangeNotSupportedError(url);
    }

    logger.warn(`416 for ${url} — falling back to full GET`);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new TransportError(`Full GET failed: ${response.status}`);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }
}
