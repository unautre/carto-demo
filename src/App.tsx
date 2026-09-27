import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { FlyToInterpolator, WebMercatorViewport, type MapViewState, type PickingInfo } from '@deck.gl/core';
import { AddLayerDialog } from './components/AddLayerDialog';
import { LayerPanel } from './components/LayerPanel';
import { dataStore, unionBounds, useDataStoreVersion } from './data';
import { clickInfoKinds, createFeatureInfoWidget } from './featureInfo';
import { basemapLayer, BASEMAPS, toDeckLayer, type BasemapId } from './deckLayers';
import { useAppState } from './state';
import { allLayers, renderOrder } from './tree';
import type { Bounds, LayerNode, TreeNode } from './types';

const INITIAL_VIEW: MapViewState = { longitude: -122.3, latitude: 37.78, zoom: 10, pitch: 0, bearing: 0 };

async function layerBounds(layer: LayerNode): Promise<Bounds | undefined> {
  if (layer.bounds) return layer.bounds;
  if (layer.kind === 'wms') return undefined;
  const state = await dataStore.load(layer);
  return state.status === 'ready' ? state.bounds : undefined;
}

export default function App() {
  const [{ tree, basemap }, dispatch] = useAppState();
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const mapRef = useRef<HTMLDivElement>(null);
  const storeVersion = useDataStoreVersion();

  const drawn = useMemo(() => renderOrder(tree), [tree]);
  // Hover tooltips are skipped on layers that use the click popup instead.
  const isClickInfoLayer = (info: PickingInfo) => {
    const node = info.layer && drawn.find((l) => l.id === info.layer!.id);
    return !!node && clickInfoKinds.has(node.kind);
  };

  // Load data for layers as soon as they are shown; hidden layers cost nothing.
  useEffect(() => {
    drawn.forEach((layer) => {
      if (layer.kind !== 'wms' && !dataStore.get(layer)) dataStore.load(layer);
    });
  }, [drawn, storeVersion]);

  const layers = useMemo(() => {
    const base = basemapLayer(basemap);
    const overlays = drawn.map(toDeckLayer).filter((l) => l !== null);
    return base ? [base, ...overlays] : overlays;
    // storeVersion: rebuild when a download finishes
  }, [drawn, basemap, storeVersion]);

  // Click-to-inspect popup (deck.gl InfoWidget). It reads the current tree through a ref,
  // so the widget instance itself never changes.
  const drawnRef = useRef(drawn);
  drawnRef.current = drawn;
  const featureInfo = useMemo(() => createFeatureInfoWidget((id) => drawnRef.current.find((l) => l.id === id)), []);
  const widgets = useMemo(() => [featureInfo.widget], [featureInfo]);
  useEffect(() => featureInfo.closeUnless(new Set(layers.map((l) => l.id))), [featureInfo, layers]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3500);
  };

  const zoomTo = useCallback(async (node: TreeNode) => {
    const targets = node.type === 'group' ? allLayers(node.children) : [node];
    const bounds = unionBounds(await Promise.all(targets.map(layerBounds)));
    if (!bounds) {
      flash(node.type === 'layer' && node.kind === 'wms' ? 'This WMS layer has no known extent' : 'No extent available (data failed to load?)');
      return;
    }
    const el = mapRef.current;
    const width = el?.clientWidth ?? 800;
    const height = el?.clientHeight ?? 600;
    // Avoid infinite zoom on a single point.
    const pad = 0.002;
    const [w, s, e, n] = bounds;
    const { longitude, latitude, zoom } = new WebMercatorViewport({ width, height }).fitBounds(
      [[w - (e - w < pad ? pad : 0), s - (n - s < pad ? pad : 0)], [e + (e - w < pad ? pad : 0), n + (n - s < pad ? pad : 0)]],
      { padding: Math.min(60, width / 6, height / 6) },
    );
    setViewState((v) => ({
      ...v,
      longitude,
      latitude,
      zoom: Math.min(zoom, 18),
      transitionDuration: 'auto',
      transitionInterpolator: new FlyToInterpolator({ speed: 2 }),
    }));
  }, []);

  const onAdd = (layer: LayerNode, zoom: boolean) => {
    dispatch({ type: 'add', node: layer });
    if (zoom) zoomTo(layer);
  };

  return (
    <div className="app">
      <LayerPanel tree={tree} dispatch={dispatch} onZoomTo={zoomTo} onAddLayer={() => setAdding(true)} />
      <main className="map" ref={mapRef}>
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: v }) => setViewState(v as MapViewState)}
          controller={{ dragRotate: true }}
          layers={layers}
          getTooltip={(info) => (isClickInfoLayer(info) ? null : tooltip(info))}
          widgets={widgets}
          onClick={(i) => console.log('DBG deck onClick', i.layer?.id)}
        />
        <div className="basemap-picker">
          {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
            <button key={id} className={basemap === id ? 'active' : ''} onClick={() => dispatch({ type: 'setBasemap', basemap: id })}>
              {BASEMAPS[id].label}
            </button>
          ))}
        </div>
        <div className="attribution">{BASEMAPS[basemap]?.attribution}</div>
        {notice && <div className="toast">{notice}</div>}
        <button
          className="btn reset"
          title="Restore the demo layers"
          onClick={() => confirm('Replace the current layer tree with the demo layers?') && dispatch({ type: 'reset' })}
        >
          Reset demo
        </button>
      </main>
      {adding && <AddLayerDialog onAdd={onAdd} onClose={() => setAdding(false)} />}
    </div>
  );
}

function escapeHtml(v: unknown): string {
  return String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function tooltip({ object, layer }: PickingInfo) {
  if (!object || !layer) return null;
  const o = object as { properties?: Record<string, unknown>; count?: number; points?: unknown[] };
  if (typeof o.count === 'number' && !o.properties) return { text: `${o.count} points` };
  const props = Object.entries(o.properties ?? {}).filter(([, v]) => v !== null && typeof v !== 'object');
  if (!props.length) return null;
  const rows = props
    .slice(0, 8)
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join('');
  return { html: `<table class="tt">${rows}</table>`, className: 'deck-tooltip-box' };
}
