import { useState, type Dispatch } from 'react';
import { DEFAULT_BASEMAP } from '../layers/deckLayers';
import type { Action } from '../state';
import type { BasemapConfig } from '../types';

interface Props {
  basemap: BasemapConfig;
  dispatch: Dispatch<Action>;
}

/** A basemap-shaped row at the top of the layer tree — same look as a layer row, same place you'd expect to edit one. */
export function BasemapSettings({ basemap, dispatch }: Props) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<BasemapConfig>) => dispatch({ type: 'setBasemap', patch });

  return (
    <div className="basemap-block">
      <div className={`row layer ${basemap.enabled ? '' : 'off'}`}>
        <input type="checkbox" checked={basemap.enabled} onChange={(e) => set({ enabled: e.target.checked })} aria-label="Show basemap" />
        <span className="kind-icon" title="Basemap">▦</span>
        <span className="name">Basemap</span>
        <span className="kind-tag">XYZ tiles</span>
        <span className="actions">
          <button className={`icon-btn ${open ? 'active' : ''}`} title="Basemap settings" onClick={() => setOpen((v) => !v)}>⚙</button>
        </span>
      </div>
      {open && (
        <div className="settings">
          <label className="field">
            <span>Tile URL (XYZ template)</span>
            <input
              type="url"
              defaultValue={basemap.url}
              key={basemap.url}
              placeholder={DEFAULT_BASEMAP.url}
              onBlur={(e) => {
                const url = e.currentTarget.value.trim();
                if (url && url !== basemap.url) set({ url });
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </label>
          <p className="muted hint">
            Any raster XYZ tile server, e.g. <code>{'{z}/{x}/{y}'}</code> in the URL. Defaults to OpenStreetMap's own tiles.
          </p>
          <div className="field-row">
            <label className="field narrow">
              <span>Max zoom</span>
              <input
                type="number"
                min={1}
                max={24}
                defaultValue={basemap.maxZoom}
                key={basemap.maxZoom}
                onBlur={(e) => set({ maxZoom: Math.min(24, Math.max(1, +e.currentTarget.value || DEFAULT_BASEMAP.maxZoom)) })}
              />
            </label>
            <label className="field">
              <span>Attribution</span>
              <input defaultValue={basemap.attribution} key={basemap.attribution} onBlur={(e) => set({ attribution: e.currentTarget.value })} />
            </label>
          </div>
          <div className="settings-foot">
            <span className="muted">Shown bottom-right of the map.</span>
            <button type="button" className="btn small" onClick={() => set(DEFAULT_BASEMAP)}>Reset to OpenStreetMap</button>
          </div>
        </div>
      )}
    </div>
  );
}
