import type { Batch } from '@/engine/types';
import type { AppError } from '@/errors';

export type QueryStatus = 'idle' | 'probing' | 'executing' | 'error' | 'done';

export interface QueryState {
  parquetURL: string;
  queryText: string;
  status: QueryStatus;
  results: Batch[];
  error: AppError | null;
  rowCount: number;
}

export type QueryAction =
  | { type: 'SET_URL'; url: string }
  | { type: 'SET_QUERY'; sql: string }
  | { type: 'PROBE_START' }
  | { type: 'PROBE_DONE' }
  | { type: 'QUERY_START' }
  | { type: 'BATCH_RECEIVED'; batch: Batch }
  | { type: 'QUERY_DONE'; rowCount: number }
  | { type: 'ERROR'; error: AppError }
  | { type: 'RESET' };

export const initialState: QueryState = {
  parquetURL: '',
  queryText: "SELECT *\nFROM parquet_scan('__URL__')\nLIMIT 100",
  status: 'idle',
  results: [],
  error: null,
  rowCount: 0,
};

export function queryReducer(state: QueryState, action: QueryAction): QueryState {
  switch (action.type) {
    case 'SET_URL':
      return { ...state, parquetURL: action.url, status: 'idle', results: [], error: null };

    case 'SET_QUERY':
      return { ...state, queryText: action.sql };

    case 'PROBE_START':
      return { ...state, status: 'probing', error: null };

    case 'PROBE_DONE':
      return { ...state, status: 'idle' };

    case 'QUERY_START':
      return { ...state, status: 'executing', results: [], error: null, rowCount: 0 };

    case 'BATCH_RECEIVED':
      return { ...state, results: [...state.results, action.batch] };

    case 'QUERY_DONE':
      return { ...state, status: 'done', rowCount: action.rowCount };

    case 'ERROR':
      return { ...state, status: 'error', error: action.error };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}
