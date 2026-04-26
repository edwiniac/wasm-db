import { useCallback, useRef, useEffect } from 'react';
import { useQueryStore } from '@/state/store';
import { getEngine, getTransport, shutdownEngine, loadSchema } from '@/state/queryService';
import { AppError, TransportError, QueryError, QueryCancelledError } from '@/errors';
import { logger } from '@/util/logger';
import { URLInput } from '@/ui/URLInput';
import { SQLEditor } from '@/ui/SQLEditor';
import { ResultsTable } from '@/ui/ResultsTable';
import { StatusBar } from '@/ui/StatusBar';
import { ErrorPanel } from '@/ui/ErrorPanel';
import { SchemaTree } from '@/ui/SchemaTree';
import type { QueryHandle } from '@/state/queryService';

export default function App() {
  const parquetURL = useQueryStore((s) => s.parquetURL);
  const queryText = useQueryStore((s) => s.queryText);
  const status = useQueryStore((s) => s.status);
  const results = useQueryStore((s) => s.results);
  const error = useQueryStore((s) => s.error);
  const rowCount = useQueryStore((s) => s.rowCount);
  const schema = useQueryStore((s) => s.schema);
  const schemaStatus = useQueryStore((s) => s.schemaStatus);
  const dispatch = useQueryStore((s) => s.dispatch);

  const cancelRef = useRef<(() => void) | null>(null);
  const probeAbortRef = useRef<AbortController | null>(null);
  const activeHandleRef = useRef<QueryHandle | null>(null);

  // Shutdown worker on unmount
  useEffect(() => () => shutdownEngine(), []);

  // Sync URL from hash param on mount — only accept http(s) to block js:/data: injection
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const url = params.get('url');
    if (url && /^https?:\/\//i.test(url)) dispatch({ type: 'SET_URL', url });
  }, [dispatch]);

  // When URL changes, update the parquet_scan URL in-place — preserves user edits.
  // Escape single quotes so URLs like "it's.parquet" produce valid SQL.
  useEffect(() => {
    if (!parquetURL) return;
    const safe = parquetURL.replace(/'/g, "''");
    // Use a function replacer to avoid interpreting '$' in the URL as a regex back-reference.
    const next = queryText
      .replace('__URL__', safe)
      .replace(/parquet_scan\('[^']*'\)/g, () => `parquet_scan('${safe}')`);
    if (next !== queryText) dispatch({ type: 'SET_QUERY', sql: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parquetURL]);

  const handleProbe = useCallback(async () => {
    probeAbortRef.current?.abort();
    const controller = new AbortController();
    probeAbortRef.current = controller;
    dispatch({ type: 'PROBE_START' });
    try {
      await getTransport().probeURL(parquetURL, controller.signal);
      dispatch({ type: 'PROBE_DONE' });
      // Fire schema fetch in background — probe returns to idle immediately
      dispatch({ type: 'SCHEMA_START' });
      loadSchema(parquetURL)
        .then((columns) => dispatch({ type: 'SCHEMA_DONE', columns }))
        .catch((err) => {
          logger.warn('Schema fetch failed', err);
          dispatch({ type: 'SCHEMA_ERROR' });
        });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      dispatch({
        type: 'ERROR',
        error: err instanceof AppError ? err : new TransportError(String(err)),
      });
    } finally {
      probeAbortRef.current = null;
    }
  }, [parquetURL, dispatch]);

  const handleRun = useCallback(async () => {
    // Cancel any in-flight query before starting a new one to prevent interleaved results
    // and lost cancel handles.
    activeHandleRef.current?.cancel();
    activeHandleRef.current = null;

    dispatch({ type: 'QUERY_START' });
    try {
      const handle = await getEngine().runQuery(queryText);
      activeHandleRef.current = handle;
      cancelRef.current = () => handle.cancel();
      let total = 0;
      for await (const batch of handle.stream) {
        dispatch({ type: 'BATCH_RECEIVED', batch });
        total += batch.rows.length;
      }
      dispatch({ type: 'QUERY_DONE', rowCount: total });
    } catch (err) {
      if (err instanceof QueryCancelledError) return;
      dispatch({
        type: 'ERROR',
        error: err instanceof AppError ? err : new QueryError(String(err)),
      });
    } finally {
      activeHandleRef.current = null;
      cancelRef.current = null;
    }
  }, [queryText, dispatch]);

  const handleCancel = useCallback(() => {
    probeAbortRef.current?.abort();
    activeHandleRef.current?.cancel();
    activeHandleRef.current = null;
    cancelRef.current = null;
    dispatch({ type: 'CANCEL' });
  }, [dispatch]);

  const isExecuting = status === 'executing' || status === 'probing';

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
        value={parquetURL}
        status={status}
        onChange={(url) => dispatch({ type: 'SET_URL', url })}
        onProbe={handleProbe}
      />
      <SchemaTree columns={schema} status={schemaStatus} />
      <div style={{ padding: '0 12px 8px' }}>
        <SQLEditor
          value={queryText}
          disabled={isExecuting}
          onChange={(sql) => dispatch({ type: 'SET_QUERY', sql })}
          onRun={handleRun}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button
            onClick={handleRun}
            disabled={isExecuting || !parquetURL.trim()}
            aria-label="Run query"
            style={{ padding: '6px 16px' }}
          >
            {status === 'executing' ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>
      {error && <ErrorPanel error={error} />}
      <ResultsTable batches={results} rowCount={rowCount} />
      <StatusBar status={status} rowCount={rowCount} onCancel={handleCancel} />
    </div>
  );
}
