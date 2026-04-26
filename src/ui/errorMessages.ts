import type { ErrorCode } from '@/errors';
import { mapDuckDBError } from '@/engine/errorMap';

const CODE_MESSAGES: Record<ErrorCode, string> = {
  TRANSPORT_ERROR: 'Failed to fetch the file. Check the URL and your connection.',
  CORS_ERROR: 'The server blocked cross-origin access. The file must be hosted with CORS enabled.',
  RANGE_NOT_SUPPORTED:
    'The server does not support byte-range requests required for efficient access.',
  RANGE_FETCH_FAILED: 'Failed to fetch a byte range from the file.',
  QUERY_ERROR: '', // filled dynamically via mapDuckDBError
  QUERY_CANCELLED: 'Query was cancelled.',
  WORKER_ERROR: 'The query engine encountered an error.',
  WORKER_CRASH: 'The query engine crashed. Please reload the page.',
};

export function userFacingMessage(code: ErrorCode, raw: string): string {
  if (code === 'QUERY_ERROR') return mapDuckDBError(raw);
  return CODE_MESSAGES[code] || raw;
}
