import { useState, type Dispatch } from 'react';
import { colorPropertyError, numberPropertyError } from '../layers/accessors';
import { DECK_KINDS, displayInfo, RENDER_KINDS, renderKindInfo } from '../catalog';
import { dataStore, useDataStoreVersion } from '../data';
import { UNIT_LABEL, UNIT_ORDER } from '../duration';
import { compileFilterValue, computeFilterRange, DEFAULT_DATA_FILTER, resolveFilterRange } from '../layers/layerExtensions';
import { fetchClickHouseRows } from '../sources/clickhouse';
import { fetchDuckDbRows } from '../sources/duckdb';
import type { QueryTemplateContext } from '../sources/queryTemplate';
import type { Action } from '../state';
import { WFS_JSON_FORMAT } from '../sources/ogc';
import type { ClickHouseParams, DataFilterConfig, DeckLayerKind, DuckDbParams, LayerNode, LayerStyle, PropertyMode, PropertyValue, TimeUnit, WfsParams, WmsParams } from '../types';
import { CodeEditor } from './CodeEditor';
import { QueryField } from './QueryField';
import { WfsFormatSelect } from './WfsFormatSelect';

function PropertyModeSelect({ mode, onChange }: { mode: PropertyMode; onChange: (mode: PropertyMode) => void }) {
  return (
    <select value={mode} onChange={(e) => onChange(e.target.value as PropertyMode)}>
      <option value="constant">Value</option>
      <option value="accessor">Accessor</option>
    </select>
  );
}

/**
 * JS accessor code, edited locally and only reported via `onCommit` on blur — recompiling (and
 * re-running) the accessor on every keystroke would be wasteful and distracting (error flashing
 * mid-edit). Remounted (via the caller's `key={initialCode}`) whenever the saved code changes from
 * outside this editor — e.g. switching layers, undo, or a Reload-driven reset.
 */
function AccessorCodeEditor({ initialCode, placeholder, onCommit }: { initialCode: string; placeholder: string; onCommit: (code: string) => void }) {
  const [code, setCode] = useState(initialCode);
  return (
    <CodeEditor
      language="javascript"
      value={code}
      onChange={setCode}
      placeholder={placeholder}
      minHeight="50px"
      onBlur={() => code !== initialCode && onCommit(code)}
    />
  );
}

interface NumberPropertyFieldProps {
  label: string;
  prop: PropertyValue<number>;
  accessorCapable: boolean;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  placeholder: string;
  onChange: (patch: Partial<PropertyValue<number>>) => void;
}

function NumberPropertyField({ label, prop, accessorCapable, min, max, step, format, placeholder, onChange }: NumberPropertyFieldProps) {
  const error = numberPropertyError(prop);
  return (
    // A plain `<div>`, not `<label>`: a native label forwards a click anywhere inside it that
    // isn't itself a labelable element (button/input/select/textarea/…) to its first labelable
    // descendant — CodeMirror's `contenteditable` div doesn't qualify, so every click meant for the
    // editor would instead refocus the mode `<select>` below.
    <div className="field">
      <span className="prop-header">
        <span>{label}{prop.mode === 'constant' ? ` · ${format ? format(prop.value) : prop.value}` : ''}</span>
        {accessorCapable && <PropertyModeSelect mode={prop.mode} onChange={(mode) => onChange({ mode })} />}
      </span>
      {prop.mode === 'constant' ? (
        <input type="range" min={min} max={max} step={step} value={prop.value} onChange={(e) => onChange({ value: +e.target.value })} />
      ) : (
        <AccessorCodeEditor key={prop.code} initialCode={prop.code} placeholder={placeholder} onCommit={(code) => onChange({ code })} />
      )}
      {prop.mode === 'accessor' && error && <span className="error-box">{error}</span>}
    </div>
  );
}

function ColorPropertyField({
  prop,
  accessorCapable,
  onChange,
  label = 'Colour',
}: {
  prop: PropertyValue<string>;
  accessorCapable: boolean;
  onChange: (patch: Partial<PropertyValue<string>>) => void;
  label?: string;
}) {
  const error = colorPropertyError(prop);
  return (
    // See the comment in NumberPropertyField: a `<label>` here would forward clicks meant for the
    // CodeMirror editor to the mode `<select>` instead.
    <div className={`field ${prop.mode === 'constant' ? 'color-field' : ''}`}>
      <span className="prop-header">
        <span>{label}</span>
        {accessorCapable && <PropertyModeSelect mode={prop.mode} onChange={(mode) => onChange({ mode })} />}
      </span>
      {prop.mode === 'constant' ? (
        <input type="color" value={prop.value} onChange={(e) => onChange({ value: e.target.value })} />
      ) : (
        <AccessorCodeEditor
          key={prop.code}
          initialCode={prop.code}
          placeholder="return properties.value > 0 ? '#e4572e' : '#2e86ab';"
          onCommit={(code) => onChange({ code })}
        />
      )}
      {prop.mode === 'accessor' && error && <span className="error-box">{error}</span>}
    </div>
  );
}

interface Props {
  layer: LayerNode;
  dispatch: Dispatch<Action>;
  depth: number;
  /** epoch ms, used to preview a 'timeline'-mode data filter's current [min, max] — see App.tsx */
  timestamp: number;
  /** for testing a ClickHouse/DuckDB query's {{timestamp}} etc. placeholders in the query editor modal */
  queryCtx: QueryTemplateContext;
}

export function LayerSettings({ layer, dispatch, depth, timestamp, queryCtx }: Props) {
  useDataStoreVersion();
  const info = displayInfo(layer);
  const renderKind: DeckLayerKind = layer.render ?? 'scatterplot';
  const renderInfo = renderKindInfo(layer);
  const state = dataStore.get(layer);
  const setProp = <K extends keyof LayerStyle>(key: K, patch: Partial<LayerStyle[K]>) =>
    dispatch({ type: 'updateStyle', id: layer.id, patch: { [key]: { ...layer.style[key], ...patch } } as Partial<LayerNode['style']> });
  const accessorCapable = new Set(renderInfo.accessorCapable);
  const setRender = (render: DeckLayerKind) => dispatch({ type: 'update', id: layer.id, patch: { render } });
  const setWms = (patch: Partial<WmsParams>) => dispatch({ type: 'update', id: layer.id, patch: { wms: { ...layer.wms!, ...patch } } });
  const setWfs = (patch: Partial<WfsParams>) => dispatch({ type: 'update', id: layer.id, patch: { wfs: { ...layer.wfs!, ...patch } } });
  const setClickhouse = (patch: Partial<ClickHouseParams>) =>
    dispatch({ type: 'update', id: layer.id, patch: { clickhouse: { ...layer.clickhouse!, ...patch } } });
  const setDuckdb = (patch: Partial<DuckDbParams>) =>
    dispatch({ type: 'update', id: layer.id, patch: { duckdb: { ...layer.duckdb!, ...patch } } });
  const setDataFilter = (patch: Partial<DataFilterConfig>) =>
    dispatch({ type: 'update', id: layer.id, patch: { dataFilter: { ...(layer.dataFilter ?? DEFAULT_DATA_FILTER), ...patch } } });
  const [filterError, setFilterError] = useState(() => (layer.dataFilter ? compileFilterValue(layer.dataFilter.getFilterValue).error : undefined));

  return (
    <div className="settings" style={{ marginLeft: 28 + depth * 18 }}>
      {state?.status === 'error' && <div className="error-box">{state.error}</div>}

      {layer.kind !== 'duckdb' && (
        <label className="field">
          <span>{layer.kind === 'wms' || layer.kind === 'wfs' ? 'Service URL' : layer.kind === 'clickhouse' ? 'HTTP endpoint' : 'Data URL'}</span>
          <input
            type="url"
            defaultValue={layer.url}
            key={layer.url}
            onBlur={(e) => {
              const url = e.currentTarget.value.trim();
              if (url && url !== layer.url) dispatch({ type: 'update', id: layer.id, patch: { url } });
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
      )}

      {layer.kind !== 'wms' && (
        <label className="field">
          <span>Render as</span>
          <select value={renderKind} onChange={(e) => setRender(e.target.value as DeckLayerKind)}>
            {DECK_KINDS.map((k) => <option key={k} value={k}>{RENDER_KINDS[k].label}</option>)}
          </select>
        </label>
      )}

      <NumberPropertyField
        label="Opacity"
        prop={layer.style.opacity}
        accessorCapable={accessorCapable.has('opacity')}
        min={0}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        placeholder="return properties.value ?? 1;"
        onChange={(patch) => setProp('opacity', patch)}
      />
      {layer.kind !== 'wms' && (
        <ColorPropertyField
          // Only call it "Fill colour" where a separate "Line colour" is also shown, otherwise
          // (Path/Arc, where this colour IS the line — there's no fill at all) that label would
          // be actively wrong, not just redundant.
          label={renderInfo.controls.includes('lineColor') ? 'Fill colour' : 'Colour'}
          prop={layer.style.color}
          accessorCapable={accessorCapable.has('color')}
          onChange={(patch) => setProp('color', patch)}
        />
      )}

      {renderInfo.controls.includes('radius') && (
        <NumberPropertyField
          label={renderInfo.radiusLabel ?? 'Radius'}
          prop={layer.style.radius}
          accessorCapable={accessorCapable.has('radius')}
          min={renderKind === 'heatmap' ? 5 : 10}
          max={renderKind === 'heatmap' ? 100 : 10000}
          step={renderKind === 'heatmap' ? 1 : 10}
          placeholder="return properties.value ?? 100;"
          onChange={(patch) => setProp('radius', patch)}
        />
      )}
      {renderInfo.controls.includes('lineWidth') && (
        <NumberPropertyField
          label="Line width (px)"
          prop={layer.style.lineWidth}
          accessorCapable={accessorCapable.has('lineWidth')}
          min={0.5}
          max={12}
          step={0.5}
          placeholder="return properties.value ?? 2;"
          onChange={(patch) => setProp('lineWidth', patch)}
        />
      )}
      {renderInfo.controls.includes('lineColor') && (
        <ColorPropertyField
          label="Line colour"
          prop={layer.style.lineColor}
          accessorCapable={accessorCapable.has('lineColor')}
          onChange={(patch) => setProp('lineColor', patch)}
        />
      )}

      {layer.wms && (
        <>
          <label className="field">
            <span>Layers (comma-separated)</span>
            <input defaultValue={layer.wms.layers} key={layer.wms.layers} onBlur={(e) => setWms({ layers: e.currentTarget.value.trim() })} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Format</span>
              <select value={layer.wms.format} onChange={(e) => setWms({ format: e.target.value })}>
                <option>image/png</option>
                <option>image/jpeg</option>
                <option>image/webp</option>
              </select>
            </label>
            <label className="field">
              <span>Version</span>
              <select value={layer.wms.version} onChange={(e) => setWms({ version: e.target.value as WmsParams['version'] })}>
                <option>1.3.0</option>
                <option>1.1.1</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={layer.wms.transparent} onChange={(e) => setWms({ transparent: e.target.checked })} />
              Transparent
            </label>
          </div>
        </>
      )}

      {layer.wfs && (
        <>
          <label className="field">
            <span>Feature type</span>
            <input defaultValue={layer.wfs.typeName} key={layer.wfs.typeName} onBlur={(e) => setWfs({ typeName: e.currentTarget.value.trim() })} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Max features</span>
              <input
                type="number"
                min={1}
                defaultValue={layer.wfs.maxFeatures}
                key={layer.wfs.maxFeatures}
                onBlur={(e) => setWfs({ maxFeatures: Math.max(1, +e.currentTarget.value || 1000) })}
              />
            </label>
            <label className="check" title="Use when features appear mirrored (lat/lon axis order)">
              <input type="checkbox" checked={layer.wfs.swapXY} onChange={(e) => setWfs({ swapXY: e.target.checked })} />
              Swap X/Y
            </label>
          </div>
          <div className="field-row">
            <WfsFormatSelect value={layer.wfs.outputFormat ?? WFS_JSON_FORMAT} onChange={(outputFormat) => setWfs({ outputFormat })} />
          </div>
        </>
      )}

      {layer.clickhouse && (
        <>
          <QueryField
            label="SQL query"
            query={layer.clickhouse.query}
            onSave={(query) => setClickhouse({ query })}
            queryCtx={queryCtx}
            run={(q, ctx) => fetchClickHouseRows(layer.url, { ...layer.clickhouse!, query: q }, ctx).then((r) => ({ data: r.data, rows: r.rows }))}
          />
          <div className="field-row">
            <label className="field">
              <span>Database</span>
              <input
                defaultValue={layer.clickhouse.database ?? ''}
                key={layer.clickhouse.database}
                placeholder="default"
                onBlur={(e) => setClickhouse({ database: e.currentTarget.value.trim() || undefined })}
              />
            </label>
            <label className="field">
              <span>Username</span>
              <input
                defaultValue={layer.clickhouse.username ?? ''}
                key={layer.clickhouse.username}
                onBlur={(e) => setClickhouse({ username: e.currentTarget.value.trim() || undefined })}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                defaultValue={layer.clickhouse.password ?? ''}
                key={layer.clickhouse.password}
                onBlur={(e) => setClickhouse({ password: e.currentTarget.value || undefined })}
              />
            </label>
          </div>
        </>
      )}

      {layer.duckdb && (
        <>
          <p className="muted hint">Runs entirely in the browser via DuckDB-WASM — no server, no credentials.</p>
          <QueryField
            label="SQL query"
            query={layer.duckdb.query}
            onSave={(query) => setDuckdb({ query })}
            queryCtx={queryCtx}
            run={(q, ctx) => fetchDuckDbRows({ query: q }, ctx)}
          />
        </>
      )}

      {layer.kind !== 'wms' && (
        <>
          <label className="check">
            <input type="checkbox" checked={layer.dataFilter?.enabled ?? false} onChange={(e) => setDataFilter({ enabled: e.target.checked })} />
            Data filter (DataFilterExtension)
          </label>
          {layer.dataFilter?.enabled && (
            <>
              <label className="field">
                <span>getFilterValue(properties)</span>
                <AccessorCodeEditor
                  key={layer.dataFilter.getFilterValue}
                  initialCode={layer.dataFilter.getFilterValue}
                  placeholder="return properties.value ?? 0;"
                  onCommit={(code) => {
                    setFilterError(compileFilterValue(code).error);
                    setDataFilter({ getFilterValue: code });
                  }}
                />
              </label>
              {filterError && <div className="error-box">getFilterValue error (every row scores 0 until fixed): {filterError}</div>}
              <p className="muted hint">
                Runs once per row; <code>properties</code> is the row's/feature's properties. Must return a number — rows outside the range below are hidden.
              </p>

              <label className="field">
                <span>Range</span>
                <select value={layer.dataFilter.mode} onChange={(e) => setDataFilter({ mode: e.target.value as DataFilterConfig['mode'] })}>
                  <option value="manual">Manual [min, max]</option>
                  <option value="timeline">Timeline-relative [timestamp − delay, timestamp]</option>
                </select>
              </label>

              {layer.dataFilter.mode === 'manual' ? (
                <div className="field-row">
                  <label className="field narrow">
                    <span>Min</span>
                    <input
                      type="number"
                      value={layer.dataFilter.filterRange[0]}
                      onChange={(e) => setDataFilter({ filterRange: [+e.target.value, layer.dataFilter!.filterRange[1]] })}
                    />
                  </label>
                  <label className="field narrow">
                    <span>Max</span>
                    <input
                      type="number"
                      value={layer.dataFilter.filterRange[1]}
                      onChange={(e) => setDataFilter({ filterRange: [layer.dataFilter!.filterRange[0], +e.target.value] })}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn small"
                    disabled={state?.status !== 'ready'}
                    title={state?.status !== 'ready' ? 'Data is still loading' : 'Run getFilterValue over the loaded rows and use their min/max as the range'}
                    onClick={() => {
                      if (state?.status !== 'ready') return;
                      const { fn, error } = compileFilterValue(layer.dataFilter!.getFilterValue);
                      setFilterError(error);
                      const range = computeFilterRange(state.loaded, fn);
                      if (range) setDataFilter({ filterRange: range });
                    }}
                  >
                    Set range from data
                  </button>
                </div>
              ) : (
                <>
                  <div className="field-row">
                    <label className="field narrow">
                      <span>Delay</span>
                      <input
                        type="number"
                        min={0}
                        value={layer.dataFilter.delay.value}
                        onChange={(e) => setDataFilter({ delay: { ...layer.dataFilter!.delay, value: Math.max(0, +e.target.value || 0) } })}
                      />
                    </label>
                    <label className="field narrow">
                      <span>Unit</span>
                      <select
                        value={layer.dataFilter.delay.unit}
                        onChange={(e) => setDataFilter({ delay: { ...layer.dataFilter!.delay, unit: e.target.value as TimeUnit } })}
                      >
                        {UNIT_ORDER.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
                      </select>
                    </label>
                  </div>
                  <p className="muted hint">
                    Shows rows from <code>timestamp − delay</code> to <code>timestamp</code>, where <code>timestamp</code> is the Timeline widget's
                    position (or "now" if it's off). Currently{' '}
                    {(() => {
                      const [min, max] = resolveFilterRange(layer.dataFilter, { timestamp });
                      return `${new Date(min).toLocaleString()} – ${new Date(max).toLocaleString()}`;
                    })()}
                    .
                  </p>
                </>
              )}

              <label className="check" title="Computed on the GPU, in a shader — not a JS accessor">
                <input
                  type="checkbox"
                  checked={layer.dataFilter.fadeOpacity}
                  onChange={(e) => setDataFilter({ fadeOpacity: e.target.checked })}
                />
                Fade opacity across range (GPU)
              </label>
              {layer.dataFilter.fadeOpacity && (
                <p className="muted hint">
                  Rows near the start of the range above fade toward 0% opacity; rows near its end are at 100%. Stacks with the layer's own Opacity.
                </p>
              )}
            </>
          )}
        </>
      )}

      <div className="settings-foot">
        <span className="muted">{info.hint}</span>
        <button
          className="btn small"
          onClick={() => {
            dataStore.invalidate(layer);
            // Bumping rev also makes deck.gl refetch WMS tiles.
            dispatch({ type: 'update', id: layer.id, patch: { rev: (layer.rev ?? 0) + 1 } });
          }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
