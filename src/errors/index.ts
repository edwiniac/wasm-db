export type ErrorCode =
  | 'TRANSPORT_ERROR'
  | 'CORS_ERROR'
  | 'RANGE_NOT_SUPPORTED'
  | 'RANGE_FETCH_FAILED'
  | 'QUERY_ERROR'
  | 'QUERY_CANCELLED'
  | 'WORKER_ERROR'
  | 'WORKER_CRASH';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}

export class TransportError extends AppError {
  constructor(message: string, cause?: unknown) {
    super('TRANSPORT_ERROR', message, cause);
    this.name = 'TransportError';
  }
}

export class CORSError extends AppError {
  constructor(url: string, cause?: unknown) {
    super('CORS_ERROR', `CORS or range requests blocked: ${url}`, cause);
    this.name = 'CORSError';
  }
}

export class RangeNotSupportedError extends AppError {
  constructor(url: string, cause?: unknown) {
    super('RANGE_NOT_SUPPORTED', `Server does not support range requests: ${url}`, cause);
    this.name = 'RangeNotSupportedError';
  }
}

export class QueryError extends AppError {
  constructor(message: string, cause?: unknown) {
    super('QUERY_ERROR', message, cause);
    this.name = 'QueryError';
  }
}

export class WorkerError extends AppError {
  constructor(message: string, cause?: unknown) {
    super('WORKER_ERROR', message, cause);
    this.name = 'WorkerError';
  }
}

export class QueryCancelledError extends AppError {
  constructor(message = 'Query cancelled by user') {
    super('QUERY_CANCELLED', message);
    this.name = 'QueryCancelledError';
  }
}
