export interface ProbeResult {
  supportsRanges: boolean;
  contentLength: number | null;
  etag: string | null;
  lastModified: string | null;
}

export interface ITransport {
  probeURL(url: string): Promise<ProbeResult>;
  fetchRange(url: string, start: number, end: number, signal: AbortSignal): Promise<Uint8Array>;
}
