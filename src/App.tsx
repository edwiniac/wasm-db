import { useCallback, useRef, useEffect } from 'react';
import { useQueryStore } from '@/state/store';
import {
  getEngine,
  getTransport,
  shutdownEngine,
  loadSchema,
  getSpillActive,
  registerFile,
  unregisterFile,
} from '@/state/queryService';
import { useFilesStore } from '@/state/filesStore';
import { AppError, TransportError, QueryError, QueryCancelledError } from '@/errors';
import { logger } from '@/util/logger';
import { decodeShareParams, computeFingerprint } from '@/util/sharing';
import { URLInput } from '@/ui/URLInput';
import { SQLEditor } from '@/ui/SQLEditor';
import { ResultsTable } from '@/ui/ResultsTable';
import { StatusBar } from '@/ui/StatusBar';
import { ErrorPanel } from '@/ui/ErrorPanel';
import { SchemaTree } from '@/ui/SchemaTree';
import { ShareButton } from '@/ui/ShareButton';
import { DriftBanner } from '@/ui/DriftBanner';
import { FilePanel } from '@/ui/FilePanel';
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
  const sharedFingerprint = useQueryStore((s) => s.sharedFingerprint);
  const schemaDrift = useQueryStore((s) => s.schemaDrift);
  const spillActive = useQueryStore((s) => s.spillActive);
  const isOnline = useQueryStore((s) => s.isOnline);
  const dispatch = useQueryStore((s) => s.dispatch);

  const files = useFilesStore((s) => s.files);
  const filesDispatch = useFilesStore((s) => s.filesDispatch);

  const cancelRef = useRef<(() => void) | null>(null);
  const probeAbortRef = useRef<AbortController | null>(null);
  const activeHandleRef = useRef<QueryHandle | null>(null);

  useEffect(() => () => shutdownEngine(), []);

  // On mount, re-register files that were persisted as ready (DuckDB views are gone after reload).
  useEffect(() => {
    const readyFiles = files.filter((f) => f.status === 'ready');
    for (const f of readyFiles) {
      void registerFile(f.alias, f.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // urlOverride: used by mount auto-probe to bypass the stale parquetURL closure.
  // storedFingerprint: undefined → use sharedFingerprint from closure;
  //   explicit value (even null) → use that value directly.
  const handleProbe = useCallback(
    async (urlOverride?: string, storedFingerprint?: string | null) => {
      const targetURL = urlOverride ?? parquetURL;
      const fingerprintToCheck =
        storedFingerprint !== undefined ? storedFingerprint : sharedFingerprint;

      probeAbortRef.current?.abort();
      const controller = new AbortController();
      probeAbortRef.current = controller;
      dispatch({ type: 'PROBE_START' });
      try {
        await getTransport().probeURL(targetURL, controller.signal);
        dispatch({ type: 'PROBE_DONE' });
        dispatch({ type: 'SCHEMA_START' });
        loadSchema(targetURL)
          .then((columns) => {
            dispatch({ type: 'SCHEMA_DONE', columns });
            dispatch({ type: 'SET_SPILL_ACTIVE', active: getSpillActive() });
            if (fingerprintToCheck) {
              const live = computeFingerprint(columns);
              if (live !== fingerprintToCheck) dispatch({ type: 'SCHEMA_DRIFT_DETECTED' });
            }
          })
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
    },
    [parquetURL, sharedFingerprint, dispatch],
  );

  // Auto-load from shared URL hash on mount — runs once.
  // handleProbe intentionally excluded from deps to prevent re-running on re-renders.
  useEffect(() => {
    const { url, query, fingerprint } = decodeShareParams(window.location.hash);
    if (!url) return;
    dispatch({ type: 'SET_URL', url });
    if (query) dispatch({ type: 'SET_QUERY', sql: query });
    if (fingerprint) dispatch({ type: 'SET_SHARED_FINGERPRINT', fingerprint });
    void handleProbe(url, fingerprint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update parquet_scan URL in-place when parquetURL changes — preserves user edits.
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

  const handleProbeFile = useCallback(
    async (id: string) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;
      filesDispatch({ type: 'FILE_PROBE_START', id });
      try {
        const controller = new AbortController();
        await getTransport().probeURL(file.url, controller.signal);
        await registerFile(file.alias, file.url);
        filesDispatch({ type: 'FILE_PROBE_DONE', id });
      } catch {
        filesDispatch({ type: 'FILE_PROBE_ERROR', id });
      }
    },
    [files, filesDispatch],
  );

  const handleRemoveFile = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;
      if (file.status === 'ready') {
        void unregisterFile(file.alias);
      }
      filesDispatch({ type: 'REMOVE_FILE', id });
    },
    [files, filesDispatch],
  );

  const isExecuting = status === 'executing' || status === 'probing';
  const liveFingerprint = schema ? computeFingerprint(schema) : null;

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
        onProbe={() => void handleProbe()}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 4px' }}>
        <ShareButton
          parquetURL={parquetURL}
          queryText={queryText}
          fingerprint={liveFingerprint}
          disabled={isExecuting || !parquetURL.trim()}
        />
      </div>
      <DriftBanner visible={schemaDrift} onDismiss={() => dispatch({ type: 'DISMISS_DRIFT' })} />
      <FilePanel
        files={files}
        onAdd={() => filesDispatch({ type: 'ADD_FILE', id: crypto.randomUUID() })}
        onRemove={handleRemoveFile}
        onChangeAlias={(id, alias) => filesDispatch({ type: 'UPDATE_FILE_ALIAS', id, alias })}
        onChangeUrl={(id, url) => filesDispatch({ type: 'UPDATE_FILE_URL', id, url })}
        onProbe={handleProbeFile}
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
      <StatusBar
        status={status}
        rowCount={rowCount}
        onCancel={handleCancel}
        spillActive={spillActive}
        isOnline={isOnline}
      />
    </div>
  );
}
