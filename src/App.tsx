import { useReducer, useCallback, useRef, useEffect } from 'react';
import { queryReducer, initialState } from '@/state/queryState';
import { getEngine, getTransport, shutdownEngine } from '@/state/queryService';
import { AppError, TransportError, QueryError, QueryCancelledError } from '@/errors';
import { URLInput } from '@/ui/URLInput';
import { SQLEditor } from '@/ui/SQLEditor';
import { ResultsTable } from '@/ui/ResultsTable';
import { StatusBar } from '@/ui/StatusBar';
import { ErrorPanel } from '@/ui/ErrorPanel';
import type { QueryHandle } from '@/state/queryService';

export default function App() {
  const [state, dispatch] = useReducer(queryReducer, initialState);
  const cancelRef = useRef<(() => void) | null>(null);
  const probeAbortRef = useRef<AbortController | null>(null);

  // Shutdown worker on unmount
  useEffect(() => () => shutdownEngine(), []);

  // Sync URL from hash param on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const url = params.get('url');
    if (url) dispatch({ type: 'SET_URL', url });
  }, []);

  // When URL changes, update the parquet_scan URL in-place — preserves user edits to the rest of the query
  useEffect(() => {
    if (!state.parquetURL) return;
    const next = state.queryText
      .replace('__URL__', state.parquetURL)
      .replace(/parquet_scan\('[^']*'\)/g, `parquet_scan('${state.parquetURL}')`);
    if (next !== state.queryText) dispatch({ type: 'SET_QUERY', sql: next });
    // Intentionally omitting state.queryText from deps — we only want this to fire on URL change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.parquetURL]);

  const handleProbe = useCallback(async () => {
    probeAbortRef.current?.abort();
    const controller = new AbortController();
    probeAbortRef.current = controller;
    dispatch({ type: 'PROBE_START' });
    try {
      await getTransport().probeURL(state.parquetURL, controller.signal);
      dispatch({ type: 'PROBE_DONE' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      dispatch({
        type: 'ERROR',
        error: err instanceof AppError ? err : new TransportError(String(err)),
      });
    } finally {
      probeAbortRef.current = null;
    }
  }, [state.parquetURL]);

  const handleRun = useCallback(async () => {
    dispatch({ type: 'QUERY_START' });
    let handle: QueryHandle | null = null;
    try {
      handle = await getEngine().runQuery(state.queryText);
      cancelRef.current = () => handle?.cancel();
      let total = 0;
      for await (const batch of handle.stream) {
        dispatch({ type: 'BATCH_RECEIVED', batch });
        total += batch.rows.length;
      }
      dispatch({ type: 'QUERY_DONE', rowCount: total });
    } catch (err) {
      if (err instanceof QueryCancelledError) return; // handleCancel already set state to idle
      dispatch({
        type: 'ERROR',
        error: err instanceof AppError ? err : new QueryError(String(err)),
      });
    } finally {
      cancelRef.current = null;
    }
  }, [state.queryText]);

  const handleCancel = useCallback(() => {
    probeAbortRef.current?.abort();
    cancelRef.current?.();
    dispatch({ type: 'CANCEL' });
  }, []);

  const isExecuting = state.status === 'executing' || state.status === 'probing';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#111',
        color: '#e0e0e0',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <URLInput
        value={state.parquetURL}
        status={state.status}
        onChange={(url) => dispatch({ type: 'SET_URL', url })}
        onProbe={handleProbe}
      />
      <div style={{ padding: '0 12px 8px' }}>
        <SQLEditor
          value={state.queryText}
          disabled={isExecuting}
          onChange={(sql) => dispatch({ type: 'SET_QUERY', sql })}
          onRun={handleRun}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button
            onClick={handleRun}
            disabled={isExecuting || !state.parquetURL.trim()}
            aria-label="Run query"
            style={{ padding: '6px 16px' }}
          >
            {state.status === 'executing' ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>
      {state.error && <ErrorPanel error={state.error} />}
      <ResultsTable batches={state.results} rowCount={state.rowCount} />
      <StatusBar status={state.status} rowCount={state.rowCount} onCancel={handleCancel} />
    </div>
  );
}
