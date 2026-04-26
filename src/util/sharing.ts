import type { ColumnInfo } from '@/engine/schema';

function fnv1a32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function computeFingerprint(columns: ColumnInfo[]): string {
  const descriptor = columns.map((c) => `${c.name}:${c.type}`).join(',');
  return fnv1a32(descriptor).toString(16).padStart(8, '0');
}

export function encodeShareURL(
  parquetURL: string,
  queryText: string,
  fingerprint: string | null,
): string {
  const params = new URLSearchParams();
  params.set('url', parquetURL);
  params.set('q', queryText);
  if (fingerprint) params.set('sf', fingerprint);
  return `${window.location.origin}${window.location.pathname}#${params.toString()}`;
}

export function decodeShareParams(hash: string): {
  url: string | null;
  query: string | null;
  fingerprint: string | null;
} {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const rawUrl = params.get('url');
  const url = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : null;
  return { url, query: params.get('q'), fingerprint: params.get('sf') };
}
