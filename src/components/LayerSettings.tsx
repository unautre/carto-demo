import { useState, type Dispatch } from 'react';
import { DECK_KINDS, KINDS } from '../catalog';
import { dataStore, useDataStoreVersion } from '../data';
import { UNIT_LABEL, UNIT_ORDER } from '../duration';
import { compileFilterValue, computeFilterRange, DEFAULT_DATA_FILTER, resolveFilterRange } from '../layerExtensions';
import type { Action } from '../state';
import { WFS_JSON_FORMAT } from '../ogc';
import type { ClickHouseParams, DataFilterConfig, DeckLayerKind, LayerNode, TimeUnit, WfsParams, WmsParams } from '../types';
import { WfsFormatSelect } from './WfsFormatSelect';

interface Props {
  layer: LayerNode;
  dispatch: Dispatch<Action>;
  depth: number;
  /** epoch ms, used to preview a 'timeline'-mode data filter's current [min, max] — see App.tsx */
  timestamp: number;
}

export function LayerSettings({ layer, dispatch, depth, timestamp }: Props) {
  useDataStoreVersion();
  const info = KINDS[layer.kind];
  // For a ClickHouse layer, style controls follow the render kind (e.g. a hexagon render wants a radius slider).
  const renderKind: DeckLayerKind = layer.kind === 'clickhouse' ? (layer.clickhouse?.render ?? 'scatterplot') : (layer.kind as DeckLayerKind);
  const renderInfo = layer.kind === 'clickhouse' ? KINDS[renderKind] : info;
  const state = dataStore.get(layer);
  const style = (patch: Partial<LayerNode['style']>) => dispatch({ type: 'updateStyle', id: layer.id, patch });
  const setWms = (patch: Partial<WmsParams>) => dispatch({ type: 'update', id: layer.id, patch: { wms: { ...layer.wms!, ...patch } } });
  const setWfs = (patch: Partial<WfsParams>) => dispatch({ type: 'update', id: layer.id, patch: { wfs: { ...layer.wfs!, ...patch } } });
  const setClickhouse = (patch: Partial<ClickHouseParams>) =>
    dispatch({ type: 'update', id: layer.id, patch: { clickhouse: { ...layer.clickhouse!, ...patch } } });
  const setDataFilter = (patch: Partial<DataFilterConfig>) =>
    dispatch({ type: 'update', id: layer.id, patch: { dataFilter: { ...(layer.dataFilter ?? DEFAULT_DATA_FILTER), ...patch } } });
  const [filterError, setFilterError] = useState(() => (layer.dataFilter ? compileFilterValue(layer.dataFilter.getFilterValue).error : undefined));

  return (
    <div className="settings" style={{ marginLeft: 28 + depth * 18 }}>
      {state?.status === 'error' && <div className="error-box">{state.error}</div>}

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

      <div className="field-row">
        <label className="field">
          <span>Opacity {Math.round(layer.style.opacity * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={layer.style.opacity} onChange={(e) => style({ opacity: +e.target.value })} />
        </label>
        {layer.kind !== 'wms' && (
          <label className="field color-field">
            <span>Colour</span>
            <input type="color" value={layer.style.color} onChange={(e) => style({ color: e.target.value })} />
          </label>
        )}
      </div>

      {renderInfo.controls.includes('radius') && (
        <label className="field">
          <span>{renderInfo.radiusLabel} · {layer.style.radius}</span>
          <input
            type="range"
            min={renderKind === 'heatmap' ? 5 : 10}
            max={renderKind === 'heatmap' ? 100 : 1000}
            step={renderKind === 'heatmap' ? 1 : 10}
            value={layer.style.radius}
            onChange={(e) => style({ radius: +e.target.value })}
          />
        </label>
      )}
      {renderInfo.controls.includes('lineWidth') && (
        <label className="field">
          <span>Line width (px) · {layer.style.lineWidth}</span>
          <input type="range" min={0.5} max={12} step={0.5} value={layer.style.lineWidth} onChange={(e) => style({ lineWidth: +e.target.value })} />
        </label>
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
          <label className="field">
            <span>Render as</span>
            <select value={layer.clickhouse.render} onChange={(e) => setClickhouse({ render: e.target.value as DeckLayerKind })}>
              {DECK_KINDS.map((k) => <option key={k} value={k}>{KINDS[k].label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>SQL query</span>
            <textarea
              rows={4}
              defaultValue={layer.clickhouse.query}
              key={layer.clickhouse.query}
              onBlur={(e) => {
                const query = e.currentTarget.value.trim();
                if (query && query !== layer.clickhouse!.query) setClickhouse({ query });
              }}
            />
          </label>
          <p className="muted hint">
            <code>{'{{timestamp}}'}</code>, <code>{'{{timeRangeStart}}'}</code> and <code>{'{{timeRangeEnd}}'}</code> resolve to epoch-ms numbers —
            the Timeline widget's position/range if one's enabled, else all three are "now". <code>{'{{bboxWest}}'}</code>,{' '}
            <code>{'{{bboxSouth}}'}</code>, <code>{'{{bboxEast}}'}</code> and <code>{'{{bboxNorth}}'}</code> resolve to the map's current extent
            in degrees. Re-resolved on Reload, not live.
          </p>
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
                <textarea
                  rows={3}
                  defaultValue={layer.dataFilter.getFilterValue}
                  key={layer.dataFilter.getFilterValue}
                  onBlur={(e) => {
                    const code = e.currentTarget.value;
                    setFilterError(compileFilterValue(code).error);
                    if (code !== layer.dataFilter!.getFilterValue) setDataFilter({ getFilterValue: code });
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
