import { useEffect, useMemo, useRef, useState } from 'react';
import { DECK_KINDS, makeLayer, RENDER_KINDS, SOURCE_KINDS, WFS_PRESETS, WMS_PRESETS, type ServicePreset } from '../catalog';
import { fetchClickHouseRows, type QueryTemplateContext } from '../clickhouse';
import { fetchDuckDbRows } from '../duckdb';
import { fetchWfsCapabilities, fetchWmsCapabilities, isJsonFormat, WFS_JSON_FORMAT, type Capabilities, type CapabilityLayer } from '../ogc';
import { unionBounds } from '../data';
import type { DeckLayerKind, LayerNode } from '../types';
import { WfsFormatSelect } from './WfsFormatSelect';

type Tab = 'url' | 'wms' | 'wfs' | 'clickhouse' | 'duckdb';

/** Shared by every source's form: a plain dropdown to pick how the rows are drawn. */
function RenderSelect({ value, onChange }: { value: DeckLayerKind; onChange: (k: DeckLayerKind) => void }) {
  return (
    <label className="field">
      <span>Render as</span>
      <select value={value} onChange={(e) => onChange(e.target.value as DeckLayerKind)}>
        {DECK_KINDS.map((k) => <option key={k} value={k}>{RENDER_KINDS[k].label}</option>)}
      </select>
    </label>
  );
}

interface Props {
  onAdd: (layer: LayerNode, zoom: boolean) => void;
  onClose: () => void;
  queryCtx: QueryTemplateContext;
}

export function AddLayerDialog({ onAdd, onClose, queryCtx }: Props) {
  const [tab, setTab] = useState<Tab>('url');
  const [zoom, setZoom] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const add = (layer: LayerNode) => {
    onAdd(layer, zoom);
    onClose();
  };

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()}>
      <div className="dialog-body">
        <header className="dialog-header">
          <h2>Add layer</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <nav className="tabs" role="tablist">
          {(['url', 'wms', 'wfs', 'clickhouse', 'duckdb'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'clickhouse' ? 'ClickHouse' : t === 'duckdb' ? 'DuckDB' : t.toUpperCase()}
            </button>
          ))}
        </nav>
        {tab === 'url' && <UrlForm onAdd={add} />}
        {tab === 'wms' && <ServiceForm service="WMS" onAdd={add} />}
        {tab === 'wfs' && <ServiceForm service="WFS" onAdd={add} />}
        {tab === 'clickhouse' && <ClickHouseForm onAdd={add} queryCtx={queryCtx} />}
        {tab === 'duckdb' && <DuckDbForm onAdd={add} queryCtx={queryCtx} />}
        <label className="check zoom-check">
          <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} />
          Zoom to the layer after adding
        </label>
      </div>
    </dialog>
  );
}

function UrlForm({ onAdd }: { onAdd: (l: LayerNode) => void }) {
  const [render, setRender] = useState<DeckLayerKind>('scatterplot');
  const [name, setName] = useState('');
  const [url, setUrl] = useState(RENDER_KINDS.scatterplot.sampleUrl!);
  const samples = new Set(DECK_KINDS.map((k) => RENDER_KINDS[k].sampleUrl));

  const pick = (k: DeckLayerKind) => {
    setRender(k);
    // Keep a URL the user typed; swap sample URLs for the new kind's sample.
    if (!url || samples.has(url)) setUrl(RENDER_KINDS[k].sampleUrl!);
  };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(makeLayer('url', render, name.trim() || `${RENDER_KINDS[render].label} layer`, url.trim()));
      }}
    >
      <div className="kind-grid">
        {DECK_KINDS.map((k) => (
          <button type="button" key={k} className={`kind-card ${render === k ? 'active' : ''}`} onClick={() => pick(k)}>
            <span className="kind-icon big" style={{ color: RENDER_KINDS[k].style.color.value }}>{RENDER_KINDS[k].icon}</span>
            {RENDER_KINDS[k].label}
          </button>
        ))}
      </div>
      <p className="muted hint">{RENDER_KINDS[render].hint}</p>
      <label className="field">
        <span>Name</span>
        <input value={name} placeholder={`${RENDER_KINDS[render].label} layer`} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Data URL (JSON / GeoJSON, CORS-enabled)</span>
        <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <button type="button" className="link" onClick={() => setUrl(RENDER_KINDS[render].sampleUrl!)}>Use sample data</button>
      <div className="form-actions">
        <button className="btn primary" type="submit">Add {RENDER_KINDS[render].label} layer</button>
      </div>
    </form>
  );
}

function ServiceForm({ service, onAdd }: { service: 'WMS' | 'WFS'; onAdd: (l: LayerNode) => void }) {
  const presets: ServicePreset[] = service === 'WMS' ? WMS_PRESETS : WFS_PRESETS;
  const [url, setUrl] = useState(presets[0].url);
  const [selected, setSelected] = useState<string[]>([presets[0].layer]);
  const [manual, setManual] = useState(presets[0].layer);
  const [name, setName] = useState('');
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [maxFeatures, setMaxFeatures] = useState(1000);
  const [swapXY, setSwapXY] = useState(false);
  const [format, setFormat] = useState('image/png');
  const [outputFormat, setOutputFormat] = useState(WFS_JSON_FORMAT);
  const [render, setRender] = useState<DeckLayerKind>(SOURCE_KINDS.wfs.defaultRender!);

  const applyPreset = (p: ServicePreset) => {
    setUrl(p.url);
    setSelected([p.layer]);
    setManual(p.layer);
    setName(p.label.split('–').pop()!.trim());
    setCaps(null);
    setError('');
  };

  const loadCaps = async () => {
    setLoading(true);
    setError('');
    try {
      const c = service === 'WMS' ? await fetchWmsCapabilities(url) : await fetchWfsCapabilities(url);
      if (!c.layers.length) throw new Error('No layers found in capabilities');
      // Fall back to GML when the server doesn't offer any JSON output.
      if (c.outputFormats) setOutputFormat(c.outputFormats.find(isJsonFormat) ?? '');
      setCaps(c);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === 'Failed to fetch' ? 'Network or CORS error: the server must allow cross-origin requests' : msg);
      setCaps(null);
    } finally {
      setLoading(false);
    }
  };

  const visibleLayers = useMemo(() => {
    const q = filter.toLowerCase();
    const list = caps?.layers ?? [];
    return (q ? list.filter((l) => l.name.toLowerCase().includes(q) || l.title.toLowerCase().includes(q)) : list).slice(0, 300);
  }, [caps, filter]);

  const layerNames = caps ? selected : manual.split(',').map((s) => s.trim()).filter(Boolean);
  const chosen: CapabilityLayer[] = caps ? caps.layers.filter((l) => selected.includes(l.name)) : [];

  const toggle = (n: string) => {
    if (service === 'WFS') setSelected([n]);
    else setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  };

  const submit = () => {
    const bounds = unionBounds(chosen.map((l) => l.bounds));
    const title = name.trim() || chosen.map((l) => l.title).join(', ') || layerNames.join(', ');
    if (service === 'WMS') {
      const version = caps?.version === '1.1.1' ? '1.1.1' : '1.3.0';
      onAdd(makeLayer('wms', undefined, title, url.trim(), { bounds, wms: { layers: layerNames.join(','), styles: '', format, transparent: true, version } }));
    } else {
      const version = caps?.version.startsWith('1.') ? '1.1.0' : '2.0.0';
      onAdd(makeLayer('wfs', render, title, url.trim(), { bounds, wfs: { typeName: layerNames[0], version, maxFeatures, swapXY, outputFormat } }));
    }
  };

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label className="field">
        <span>Examples</span>
        <select onChange={(e) => applyPreset(presets[+e.target.value])} defaultValue="0">
          {presets.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{service} endpoint</span>
        <div className="input-with-btn">
          <input type="url" required value={url} onChange={(e) => { setUrl(e.target.value); setCaps(null); }} />
          <button type="button" className="btn" onClick={loadCaps} disabled={loading || !url}>
            {loading ? 'Loading…' : service === 'WMS' ? 'Get layers' : 'Get feature types'}
          </button>
        </div>
      </label>
      {error && <div className="error-box">{error}</div>}

      {caps ? (
        <div className="caps">
          <div className="caps-head">
            <strong>{caps.title || service}</strong>
            <span className="muted"> · v{caps.version} · {caps.layers.length} {service === 'WMS' ? 'layers' : 'feature types'}</span>
          </div>
          <input className="filter" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul className="caps-list">
            {visibleLayers.map((l) => (
              <li key={l.name}>
                <label>
                  <input
                    type={service === 'WMS' ? 'checkbox' : 'radio'}
                    name="caps-layer"
                    checked={selected.includes(l.name)}
                    onChange={() => toggle(l.name)}
                  />
                  <span className="caps-title">{l.title}</span>
                  <code>{l.name}</code>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <label className="field">
          <span>{service === 'WMS' ? 'Layer name(s), comma-separated' : 'Feature type name'}</span>
          <input required value={manual} onChange={(e) => setManual(e.target.value)} />
        </label>
      )}

      <div className="field-row">
        <label className="field">
          <span>Name</span>
          <input value={name} placeholder="Defaults to the layer title" onChange={(e) => setName(e.target.value)} />
        </label>
        {service === 'WMS' ? (
          <label className="field">
            <span>Format</span>
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option>image/png</option>
              <option>image/jpeg</option>
            </select>
          </label>
        ) : (
          <>
            <label className="field narrow">
              <span>Max features</span>
              <input type="number" min={1} value={maxFeatures} onChange={(e) => setMaxFeatures(Math.max(1, +e.target.value))} />
            </label>
            <label className="check" title="Use when features appear mirrored (lat/lon axis order)">
              <input type="checkbox" checked={swapXY} onChange={(e) => setSwapXY(e.target.checked)} />
              Swap X/Y
            </label>
          </>
        )}
      </div>
      {service === 'WFS' && (
        <div className="field-row">
          <RenderSelect value={render} onChange={setRender} />
          <WfsFormatSelect value={outputFormat} onChange={setOutputFormat} serverFormats={caps?.outputFormats} />
        </div>
      )}
      <div className="form-actions">
        <button className="btn primary" type="submit" disabled={!layerNames.length}>Add {service} layer</button>
      </div>
    </form>
  );
}

function ClickHouseForm({ onAdd, queryCtx }: { onAdd: (l: LayerNode) => void; queryCtx: QueryTemplateContext }) {
  const [url, setUrl] = useState('http://localhost:8123');
  const [database, setDatabase] = useState('');
  const [username, setUsername] = useState('default');
  const [password, setPassword] = useState('');
  const [query, setQuery] = useState('SELECT lon, lat FROM my_table LIMIT 1000');
  const [render, setRender] = useState<DeckLayerKind>('scatterplot');
  const [name, setName] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const params = { query, database: database.trim() || undefined, username: username.trim() || undefined, password: password || undefined };

  const test = async () => {
    setTesting(true);
    setError('');
    setResult('');
    try {
      const r = await fetchClickHouseRows(url.trim(), params, queryCtx);
      setResult(`${r.rows} row${r.rows === 1 ? '' : 's'} · columns: ${r.meta.map((m) => m.name).join(', ') || '—'}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(makeLayer('clickhouse', render, name.trim() || 'ClickHouse layer', url.trim(), { clickhouse: params }));
      }}
    >
      <label className="field">
        <span>HTTP endpoint</span>
        <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:8123" />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Database</span>
          <input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="default" />
        </label>
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      </div>
      <RenderSelect value={render} onChange={setRender} />
      <p className="muted hint">{RENDER_KINDS[render].hint}</p>
      <label className="field">
        <span>SQL query</span>
        <textarea required rows={5} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <p className="muted hint">
        <code>{'{{timestamp}}'}</code>, <code>{'{{timeRangeStart}}'}</code> and <code>{'{{timeRangeEnd}}'}</code> are replaced with epoch-ms
        numbers before the query runs — the Timeline widget's position/range if it's enabled, else all three are "now".{' '}
        <code>{'{{bboxWest}}'}</code>, <code>{'{{bboxSouth}}'}</code>, <code>{'{{bboxEast}}'}</code> and <code>{'{{bboxNorth}}'}</code> are
        replaced with the map's current extent in degrees.
      </p>
      <div className="field-row">
        <button type="button" className="btn" onClick={test} disabled={testing || !url.trim() || !query.trim()}>
          {testing ? 'Running…' : 'Test query'}
        </button>
        {result && <span className="muted">{result}</span>}
      </div>
      {error && <div className="error-box">{error}</div>}
      <label className="field">
        <span>Name</span>
        <input value={name} placeholder="ClickHouse layer" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="form-actions">
        <button className="btn primary" type="submit">Add ClickHouse layer</button>
      </div>
    </form>
  );
}

function DuckDbForm({ onAdd, queryCtx }: { onAdd: (l: LayerNode) => void; queryCtx: QueryTemplateContext }) {
  const [query, setQuery] = useState("SELECT * FROM (VALUES (-122.27, 37.80), (-122.42, 37.77)) AS t(lon, lat)");
  const [render, setRender] = useState<DeckLayerKind>(SOURCE_KINDS.duckdb.defaultRender!);
  const [name, setName] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const test = async () => {
    setTesting(true);
    setError('');
    setResult('');
    try {
      const r = await fetchDuckDbRows({ query }, queryCtx);
      setResult(`${r.rows} row${r.rows === 1 ? '' : 's'} · columns: ${Object.keys(r.data[0] ?? {}).join(', ') || '—'}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(makeLayer('duckdb', render, name.trim() || 'DuckDB layer', '', { duckdb: { query } }));
      }}
    >
      <p className="muted hint">Runs entirely in the browser via DuckDB-WASM — no server, no credentials.</p>
      <RenderSelect value={render} onChange={setRender} />
      <p className="muted hint">{RENDER_KINDS[render].hint}</p>
      <label className="field">
        <span>SQL query</span>
        <textarea required rows={5} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <p className="muted hint">
        <code>{'{{timestamp}}'}</code>, <code>{'{{timeRangeStart}}'}</code> and <code>{'{{timeRangeEnd}}'}</code> are replaced with epoch-ms
        numbers before the query runs — the Timeline widget's position/range if it's enabled, else all three are "now".{' '}
        <code>{'{{bboxWest}}'}</code>, <code>{'{{bboxSouth}}'}</code>, <code>{'{{bboxEast}}'}</code> and <code>{'{{bboxNorth}}'}</code> are
        replaced with the map's current extent in degrees.
      </p>
      <div className="field-row">
        <button type="button" className="btn" onClick={test} disabled={testing || !query.trim()}>
          {testing ? 'Running…' : 'Test query'}
        </button>
        {result && <span className="muted">{result}</span>}
      </div>
      {error && <div className="error-box">{error}</div>}
      <label className="field">
        <span>Name</span>
        <input value={name} placeholder="DuckDB layer" onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="form-actions">
        <button className="btn primary" type="submit">Add DuckDB layer</button>
      </div>
    </form>
  );
}
