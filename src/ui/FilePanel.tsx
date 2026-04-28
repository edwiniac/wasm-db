import { useState } from 'react';
import { validateAlias, MAX_FILES } from '@/state/filesState';
import type { RegisteredFile } from '@/state/filesState';

interface FilePanelProps {
  files: RegisteredFile[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChangeAlias: (id: string, alias: string) => void;
  onChangeUrl: (id: string, url: string) => void;
  onProbe: (id: string) => void;
}

const STATUS_LABEL: Record<RegisteredFile['status'], string> = {
  idle: '',
  probing: 'Probing…',
  ready: '✓ ready',
  error: 'Error',
};

export function FilePanel({
  files,
  onAdd,
  onRemove,
  onChangeAlias,
  onChangeUrl,
  onProbe,
}: FilePanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ borderTop: '1px solid #333', fontSize: '13px' }}>
      <button
        aria-expanded={open}
        aria-label="Toggle additional files panel"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '6px 12px',
          background: 'none',
          border: 'none',
          color: '#888',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        {open ? '▾' : '▸'} Additional files ({files.length}/{MAX_FILES})
      </button>

      {open && (
        <div style={{ padding: '0 12px 8px' }} aria-label="Additional files panel">
          {files.map((file) => {
            const otherAliases = files.filter((f) => f.id !== file.id).map((f) => f.alias);
            const aliasError = file.alias ? validateAlias(file.alias, otherAliases) : null;
            const probeDisabled =
              file.status === 'probing' ||
              !file.url.trim() ||
              !!validateAlias(file.alias, otherAliases);

            return (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'flex-start',
                  marginBottom: '6px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', flex: '0 0 120px' }}>
                  <input
                    aria-label={`Alias for file ${file.id}`}
                    value={file.alias}
                    onChange={(e) => onChangeAlias(file.id, e.target.value)}
                    placeholder="alias"
                    style={{
                      background: '#1e1e1e',
                      border: `1px solid ${aliasError ? '#f88' : '#444'}`,
                      color: '#e0e0e0',
                      padding: '3px 6px',
                      borderRadius: '3px',
                      fontSize: '12px',
                      width: '100%',
                    }}
                  />
                  {aliasError && (
                    <span style={{ color: '#f88', fontSize: '11px', marginTop: '2px' }}>
                      {aliasError}
                    </span>
                  )}
                </div>
                <input
                  aria-label={`URL for file ${file.id}`}
                  value={file.url}
                  onChange={(e) => onChangeUrl(file.id, e.target.value)}
                  placeholder="https://…/file.parquet"
                  style={{
                    flex: 1,
                    background: '#1e1e1e',
                    border: '1px solid #444',
                    color: '#e0e0e0',
                    padding: '3px 6px',
                    borderRadius: '3px',
                    fontSize: '12px',
                  }}
                />
                <button
                  aria-label={`Probe file ${file.id}`}
                  onClick={() => onProbe(file.id)}
                  disabled={probeDisabled}
                  style={{ fontSize: '12px', padding: '3px 8px' }}
                >
                  {file.status === 'probing' ? 'Probing…' : 'Load'}
                </button>
                <span
                  style={{
                    color:
                      file.status === 'ready' ? '#6a9' : file.status === 'error' ? '#f88' : '#888',
                    fontSize: '11px',
                    minWidth: '52px',
                    paddingTop: '4px',
                  }}
                >
                  {STATUS_LABEL[file.status]}
                </span>
                <button
                  aria-label={`Remove file ${file.id}`}
                  onClick={() => onRemove(file.id)}
                  style={{
                    fontSize: '12px',
                    padding: '3px 8px',
                    color: '#f88',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}

          <button
            aria-label="Add file"
            onClick={onAdd}
            disabled={files.length >= MAX_FILES}
            style={{ fontSize: '12px', padding: '3px 10px', marginTop: '4px' }}
          >
            + Add file
          </button>
        </div>
      )}
    </div>
  );
}
