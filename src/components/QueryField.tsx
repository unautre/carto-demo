import { useEffect, useRef, useState } from 'react';
import type { QueryTemplateContext } from '../sources/queryTemplate';

interface QueryRunResult {
  data: Array<Record<string, unknown>>;
  rows: number;
}

interface QueryFieldProps {
  label: string;
  query: string;
  onSave: (query: string) => void;
  queryCtx: QueryTemplateContext;
  /** Runs `query` (not necessarily the saved one — the modal lets you try an edit before committing it) and returns its rows. */
  run: (query: string, ctx: QueryTemplateContext) => Promise<QueryRunResult>;
}

/** A SQL query field: a one-line preview + "Edit" button that opens `QueryEditorDialog` to write and test it. */
export function QueryField({ label, query, onSave, queryCtx, run }: QueryFieldProps) {
  const [open, setOpen] = useState(false);
  const preview = query.trim().split('\n')[0];
  return (
    <>
      <label className="field">
        <span>{label}</span>
        <button type="button" className="query-trigger" onClick={() => setOpen(true)}>
          <code>{preview || 'Click to write a query…'}</code>
          <span className="muted">Edit…</span>
        </button>
      </label>
      {open && (
        <QueryEditorDialog
          label={label}
          initialQuery={query}
          queryCtx={queryCtx}
          run={run}
          onSave={(q) => {
            onSave(q);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface QueryEditorDialogProps {
  label: string;
  initialQuery: string;
  queryCtx: QueryTemplateContext;
  run: (query: string, ctx: QueryTemplateContext) => Promise<QueryRunResult>;
  onSave: (query: string) => void;
  onClose: () => void;
}

interface TableResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  count: number;
}

const PREVIEW_ROW_LIMIT = 50;

function formatCell(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function QueryEditorDialog({ label, initialQuery, queryCtx, run, onSave, onClose }: QueryEditorDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TableResult | null>(null);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const runQuery = async () => {
    setRunning(true);
    setError('');
    try {
      const r = await run(query, queryCtx);
      setResult({ columns: Object.keys(r.data[0] ?? {}), rows: r.data.slice(0, PREVIEW_ROW_LIMIT), count: r.rows });
    } catch (e) {
      setResult(null);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === 'Failed to fetch' ? 'Network or CORS error' : msg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <dialog ref={dialog} className="dialog query-dialog" onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()}>
      <div className="dialog-body">
        <header className="dialog-header">
          <h2>{label}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <textarea
          className="query-editor-textarea"
          rows={10}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoFocus
        />
        <p className="muted hint">
          <code>{'{{timestamp}}'}</code>, <code>{'{{timeRangeStart}}'}</code> and <code>{'{{timeRangeEnd}}'}</code> are replaced with epoch-ms
          numbers before the query runs — the Timeline widget's position/range if it's enabled, else all three are "now".{' '}
          <code>{'{{bboxWest}}'}</code>, <code>{'{{bboxSouth}}'}</code>, <code>{'{{bboxEast}}'}</code> and <code>{'{{bboxNorth}}'}</code> are
          replaced with the map's current extent in degrees. Resolved fresh each time the query runs — <em>Run query</em> here, or when the layer
          loads or reloads.
        </p>

        <div className="field-row">
          <button type="button" className="btn" onClick={runQuery} disabled={running || !query.trim()}>
            {running ? 'Running…' : 'Run query'}
          </button>
          {result && (
            <span className="muted">
              {result.count} row{result.count === 1 ? '' : 's'}
              {result.count > result.rows.length ? ` · showing first ${result.rows.length}` : ''}
            </span>
          )}
        </div>
        {error && <div className="error-box">{error}</div>}

        {result && (
          result.columns.length === 0 ? (
            <p className="muted">Query ran, but returned no rows.</p>
          ) : (
            <div className="query-result-wrap">
              <table className="query-result-table">
                <thead>
                  <tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>{result.columns.map((c) => <td key={c}>{formatCell(row[c])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={() => onSave(query)} disabled={!query.trim()}>Use this query</button>
        </div>
      </div>
    </dialog>
  );
}
