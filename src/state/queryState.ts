import type { Batch } from '@/engine/types';
import type { AppError } from '@/errors';
import type { ColumnInfo } from '@/engine/schema';

export type { ColumnInfo };

export type QueryStatus = 'idle' | 'probing' | 'executing' | 'error' | 'done';
export type SchemaStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface QueryState {
  parquetURL: string;
  queryText: string;
  status: QueryStatus;
  results: Batch[];
  error: AppError | null;
  rowCount: number;
  schema: ColumnInfo[] | null;
  schemaStatus: SchemaStatus;
  sharedFingerprint: string | null;
  schemaDrift: boolean;
  spillActive: boolean;
  isOnline: boolean;
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
  | { type: 'CANCEL' }
  | { type: 'RESET' }
  | { type: 'SCHEMA_START' }
  | { type: 'SCHEMA_DONE'; columns: ColumnInfo[] }
  | { type: 'SCHEMA_ERROR' }
  | { type: 'SET_SHARED_FINGERPRINT'; fingerprint: string }
  | { type: 'SCHEMA_DRIFT_DETECTED' }
  | { type: 'DISMISS_DRIFT' }
  | { type: 'SET_SPILL_ACTIVE'; active: boolean }
  | { type: 'SET_ONLINE'; online: boolean };

export const initialState: QueryState = {
  parquetURL: '',
  queryText: "SELECT *\nFROM parquet_scan('__URL__')\nLIMIT 100",
  status: 'idle',
  results: [],
  error: null,
  rowCount: 0,
  schema: null,
  schemaStatus: 'idle',
  sharedFingerprint: null,
  schemaDrift: false,
  spillActive: false,
  isOnline: true,
};

export function queryReducer(state: QueryState, action: QueryAction): QueryState {
  switch (action.type) {
    case 'SET_URL':
      return {
        ...state,
        parquetURL: action.url,
        status: 'idle',
        results: [],
        error: null,
        schema: null,
        schemaStatus: 'idle',
        sharedFingerprint: null,
        schemaDrift: false,
      };

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

    case 'CANCEL':
      return { ...state, status: 'idle', error: null };

    case 'RESET':
      return { ...initialState };

    case 'SCHEMA_START':
      return { ...state, schemaStatus: 'loading' };

    case 'SCHEMA_DONE':
      return { ...state, schemaStatus: 'loaded', schema: action.columns };

    case 'SCHEMA_ERROR':
      return { ...state, schemaStatus: 'error' };

    case 'SET_SHARED_FINGERPRINT':
      return { ...state, sharedFingerprint: action.fingerprint };

    case 'SCHEMA_DRIFT_DETECTED':
      return { ...state, schemaDrift: true };

    case 'DISMISS_DRIFT':
      return { ...state, schemaDrift: false };

    case 'SET_SPILL_ACTIVE':
      return { ...state, spillActive: action.active };

    case 'SET_ONLINE':
      return { ...state, isOnline: action.online };

    default:
      return state;
  }
}
