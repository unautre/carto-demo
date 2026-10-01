import { useSyncExternalStore } from 'react';
import { fetchClickHouseRows, clickhouseQueryUrl, type QueryTemplateContext } from './clickhouse';
import { parseGml } from './gml';
import { wfsGetFeatureUrl } from './ogc';
import type { Bounds, LayerKind, LayerNode } from './types';

type Position = [number, number];
type Props = Record<string, unknown>;

export interface PointDatum { position: Position; properties: Props }
export interface PathDatum { path: Position[]; properties: Props }
export interface ArcDatum { source: Position; target: Position; properties: Props }

export type LoadedData =
  | { shape: 'geojson'; data: FeatureCollection }
  | { shape: 'points'; data: PointDatum[] }
  | { shape: 'paths'; data: PathDatum[] }
  | { shape: 'arcs'; data: ArcDatum[] };

export type DataState =
  | { status: 'loading' }
  | { status: 'ready'; loaded: LoadedData; count: number; bounds?: Bounds }
  | { status: 'error'; error: string };

// Minimal GeoJSON typings, enough for normalisation.
export interface Geometry { type: string; coordinates?: unknown; geometries?: Geometry[] }
export interface Feature { type: 'Feature'; geometry: Geometry | null; properties: Props | null; id?: string | number }
export interface FeatureCollection { type: 'FeatureCollection'; features: Feature[] }

const isPos = (v: unknown): v is Position =>
  Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number';

/** Recursively yields every position in a nested coordinate array. */
function* positions(coords: unknown): Generator<Position> {
  if (isPos(coords)) yield coords;
  else if (Array.isArray(coords)) for (const c of coords) yield* positions(c);
}

function geometryCoords(g: Geometry | null): unknown {
  if (!g) return [];
  if (g.type === 'GeometryCollection') return (g.geometries ?? []).map(geometryCoords);
  return g.coordinates ?? [];
}

function swapCoords(coords: unknown): unknown {
  if (isPos(coords)) return [coords[1], coords[0], ...coords.slice(2)];
  return Array.isArray(coords) ? coords.map(swapCoords) : coords;
}

function swapGeometry(g: Geometry | null): Geometry | null {
  if (!g) return g;
  if (g.type === 'GeometryCollection') return { ...g, geometries: (g.geometries ?? []).map((x) => swapGeometry(x)!) };
  return { ...g, coordinates: swapCoords(g.coordinates) };
}

function asFeatureCollection(json: unknown): FeatureCollection | undefined {
  const j = json as { type?: string };
  if (j?.type === 'FeatureCollection') return json as FeatureCollection;
  if (j?.type === 'Feature') return { type: 'FeatureCollection', features: [json as Feature] };
  if (Array.isArray(json) && json.length && (json[0] as { type?: string })?.type === 'Feature') {
    return { type: 'FeatureCollection', features: json as Feature[] };
  }
  return undefined;
}

const COORD_KEYS = ['coordinates', 'COORDINATES', 'position', 'coords', 'lnglat', 'lonlat'];

/** Finds a [lng, lat] in a plain object or array row. */
function rowPosition(row: unknown): Position | undefined {
  if (isPos(row)) return [row[0], row[1]];
  if (!row || typeof row !== 'object') return undefined;
  const o = row as Props;
  for (const k of COORD_KEYS) if (isPos(o[k])) return o[k] as Position;
  const lng = o.lng ?? o.lon ?? o.longitude ?? o.x;
  const lat = o.lat ?? o.latitude ?? o.y;
  if (typeof lng === 'number' && typeof lat === 'number') return [lng, lat];
  return undefined;
}

function rowProperties(row: unknown, omit: string[]): Props {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
  return Object.fromEntries(Object.entries(row as Props).filter(([k]) => !omit.includes(k)));
}

function normalise(kind: LayerKind, json: unknown, swapXY: boolean): LoadedData {
  let fc = asFeatureCollection(json);
  if (fc && swapXY) fc = { ...fc, features: fc.features.map((f) => ({ ...f, geometry: swapGeometry(f.geometry) })) };

  if (kind === 'geojson' || kind === 'wfs') {
    if (!fc) throw new Error('Expected GeoJSON (FeatureCollection or Feature)');
    return { shape: 'geojson', data: fc };
  }

  if (kind === 'scatterplot' || kind === 'hexagon' || kind === 'heatmap') {
    if (fc) {
      const data = fc.features.flatMap((f) =>
        [...positions(geometryCoords(f.geometry))].map((position) => ({ position, properties: f.properties ?? {} })),
      );
      return { shape: 'points', data };
    }
    if (!Array.isArray(json)) throw new Error('Expected an array of points or GeoJSON');
    const data = json.flatMap((row) => {
      const position = rowPosition(row);
      return position ? [{ position, properties: rowProperties(row, COORD_KEYS) }] : [];
    });
    return { shape: 'points', data };
  }

  if (kind === 'path') {
    if (fc) {
      const data = fc.features.flatMap((f) => {
        const g = f.geometry;
        const lines = g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? (g.coordinates as unknown[]) : [];
        return lines.map((l) => ({ path: [...positions(l)], properties: f.properties ?? {} }));
      });
      return { shape: 'paths', data };
    }
    if (!Array.isArray(json)) throw new Error('Expected an array of { path: [[lng, lat], ...] } or GeoJSON');
    const data = json.flatMap((row) => {
      const o = row as Props;
      const path = (o.path ?? o.coordinates) as unknown;
      return Array.isArray(path) ? [{ path: [...positions(path)], properties: rowProperties(row, ['path', 'coordinates']) }] : [];
    });
    return { shape: 'paths', data };
  }

  // arc
  if (fc) {
    const data = fc.features.flatMap((f) => {
      const pts = [...positions(geometryCoords(f.geometry))];
      return pts.length >= 2 ? [{ source: pts[0], target: pts[pts.length - 1], properties: f.properties ?? {} }] : [];
    });
    return { shape: 'arcs', data };
  }
  if (!Array.isArray(json)) throw new Error('Expected an array of { from, to } / { sourcePosition, targetPosition } or GeoJSON lines');
  const data = json.flatMap((row) => {
    const o = row as Props;
    const source = rowPosition(o.from) ?? rowPosition(o.source) ?? rowPosition(o.sourcePosition);
    const target = rowPosition(o.to) ?? rowPosition(o.target) ?? rowPosition(o.targetPosition);
    if (!source || !target) return [];
    const from = (o.from as Props | undefined)?.name;
    const to = (o.to as Props | undefined)?.name;
    const properties = rowProperties(row, ['from', 'to', 'source', 'target', 'sourcePosition', 'targetPosition']);
    if (from || to) Object.assign(properties, { from, to });
    return [{ source, target, properties }];
  });
  return { shape: 'arcs', data };
}

export function unionBounds(list: Array<Bounds | undefined>): Bounds | undefined {
  const valid = list.filter((b): b is Bounds => !!b && b.every(Number.isFinite));
  if (!valid.length) return undefined;
  return [
    Math.min(...valid.map((b) => b[0])),
    Math.min(...valid.map((b) => b[1])),
    Math.max(...valid.map((b) => b[2])),
    Math.max(...valid.map((b) => b[3])),
  ];
}

function computeBounds(loaded: LoadedData): Bounds | undefined {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const add = (p: Position) => {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
    w = Math.min(w, p[0]); e = Math.max(e, p[0]);
    s = Math.min(s, p[1]); n = Math.max(n, p[1]);
  };
  switch (loaded.shape) {
    case 'geojson': for (const f of loaded.data.features) for (const p of positions(geometryCoords(f.geometry))) add(p); break;
    case 'points': for (const d of loaded.data) add(d.position); break;
    case 'paths': for (const d of loaded.data) d.path.forEach(add); break;
    case 'arcs': for (const d of loaded.data) { add(d.source); add(d.target); } break;
  }
  return w <= e && s <= n ? [w, s, e, n] : undefined;
}

export function sourceUrl(layer: LayerNode): string {
  if (layer.kind === 'wfs' && layer.wfs) return wfsGetFeatureUrl(layer.url, layer.wfs);
  if (layer.kind === 'clickhouse' && layer.clickhouse) return clickhouseQueryUrl(layer.url, layer.clickhouse);
  return layer.url;
}

/** Cache key; layers with identical sources share one download. WMS has no key (tiles load on demand). */
export function dataKey(layer: LayerNode): string | undefined {
  if (layer.kind === 'wms') return undefined;
  // The query result is normalised according to `render`, so it's part of the key.
  const render = layer.kind === 'clickhouse' ? `|render=${layer.clickhouse?.render}` : '';
  return `${layer.kind}|${layer.wfs?.swapXY ? 'swap|' : ''}${sourceUrl(layer)}${render}`;
}

/** Tiny external store so any component can read load status without prop drilling. */
class DataStore {
  private states = new Map<string, DataState>();
  private inflight = new Map<string, Promise<DataState>>();
  /** per-layer tile errors for WMS */
  private tileErrors = new Map<string, string>();
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;

  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  get(layer: LayerNode): DataState | undefined {
    if (layer.kind === 'wms') {
      const err = this.tileErrors.get(layer.id);
      return err ? { status: 'error', error: err } : undefined;
    }
    const key = dataKey(layer);
    return key ? this.states.get(key) : undefined;
  }

  setTileError(layerId: string, error: string | undefined) {
    if (this.tileErrors.get(layerId) === error) return;
    if (error) this.tileErrors.set(layerId, error);
    else this.tileErrors.delete(layerId);
    this.emit();
  }

  /** `ctx` only matters for ClickHouse layers (resolves `{{timestamp}}` etc.); defaults to "now"/whole-world when omitted. */
  load(
    layer: LayerNode,
    ctx: QueryTemplateContext = {
      timestamp: Date.now(),
      timeRangeStart: Date.now(),
      timeRangeEnd: Date.now(),
      bboxWest: -180,
      bboxSouth: -90,
      bboxEast: 180,
      bboxNorth: 90,
    },
  ): Promise<DataState> {
    const key = dataKey(layer);
    if (!key) return Promise.resolve({ status: 'error', error: 'WMS layers load as tiles' });
    const existing = this.states.get(key);
    if (existing && existing.status !== 'loading') return Promise.resolve(existing);
    const pending = this.inflight.get(key);
    if (pending) return pending;

    this.states.set(key, { status: 'loading' });
    this.emit();
    const promise = (async (): Promise<DataState> => {
      try {
        let json: unknown;
        let normKind: LayerKind = layer.kind;
        if (layer.kind === 'clickhouse' && layer.clickhouse) {
          json = (await fetchClickHouseRows(layer.url, layer.clickhouse, ctx)).data;
          normKind = layer.clickhouse.render;
        } else {
          const res = await fetch(sourceUrl(layer));
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          const text = await res.text();
          if (text.trimStart().startsWith('<')) {
            // XML: a GML FeatureCollection (WFS without JSON output) or an OGC exception report
            if (layer.kind !== 'wfs' && layer.kind !== 'geojson') throw new Error(`Response is XML, not JSON: ${text.slice(0, 160)}`);
            json = parseGml(text);
          } else {
            try {
              json = JSON.parse(text);
            } catch {
              throw new Error(`Response is not JSON: ${text.slice(0, 160)}`);
            }
          }
        }
        const loaded = normalise(normKind, json, !!layer.wfs?.swapXY);
        const count = loaded.shape === 'geojson' ? loaded.data.features.length : loaded.data.length;
        return { status: 'ready', loaded, count, bounds: computeBounds(loaded) };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { status: 'error', error: msg === 'Failed to fetch' ? 'Network or CORS error' : msg };
      }
    })();
    this.inflight.set(key, promise);
    promise.then((state) => {
      this.inflight.delete(key);
      this.states.set(key, state);
      this.emit();
    });
    return promise;
  }

  /** Drop a cached result (errors included) so the next load refetches. */
  invalidate(layer: LayerNode) {
    const key = dataKey(layer);
    if (key) this.states.delete(key);
    this.tileErrors.delete(layer.id);
    this.emit();
  }
}

export const dataStore = new DataStore();

/** Re-renders the caller whenever any load status changes. */
export function useDataStoreVersion(): number {
  return useSyncExternalStore(dataStore.subscribe, dataStore.getVersion);
}

export { normalise as _normaliseForTests, computeBounds as _computeBoundsForTests };
