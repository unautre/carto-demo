import type { Dispatch } from 'react';
import { KINDS } from '../catalog';
import { dataStore, useDataStoreVersion } from '../data';
import type { Action } from '../state';
import { WFS_JSON_FORMAT } from '../ogc';
import type { LayerNode, WfsParams, WmsParams } from '../types';
import { WfsFormatSelect } from './WfsFormatSelect';

interface Props {
  layer: LayerNode;
  dispatch: Dispatch<Action>;
  depth: number;
}

export function LayerSettings({ layer, dispatch, depth }: Props) {
  useDataStoreVersion();
  const info = KINDS[layer.kind];
  const state = dataStore.get(layer);
  const style = (patch: Partial<LayerNode['style']>) => dispatch({ type: 'updateStyle', id: layer.id, patch });
  const setWms = (patch: Partial<WmsParams>) => dispatch({ type: 'update', id: layer.id, patch: { wms: { ...layer.wms!, ...patch } } });
  const setWfs = (patch: Partial<WfsParams>) => dispatch({ type: 'update', id: layer.id, patch: { wfs: { ...layer.wfs!, ...patch } } });

  return (
    <div className="settings" style={{ marginLeft: 28 + depth * 18 }}>
      {state?.status === 'error' && <div className="error-box">{state.error}</div>}

      <label className="field">
        <span>{layer.kind === 'wms' || layer.kind === 'wfs' ? 'Service URL' : 'Data URL'}</span>
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

      {info.controls.includes('radius') && (
        <label className="field">
          <span>{info.radiusLabel} · {layer.style.radius}</span>
          <input
            type="range"
            min={layer.kind === 'heatmap' ? 5 : 10}
            max={layer.kind === 'heatmap' ? 100 : 1000}
            step={layer.kind === 'heatmap' ? 1 : 10}
            value={layer.style.radius}
            onChange={(e) => style({ radius: +e.target.value })}
          />
        </label>
      )}
      {info.controls.includes('lineWidth') && (
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
