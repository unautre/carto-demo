import { mapTree, newId } from './tree';
import type { DeckLayerKind, LayerNode, LayerStyle, PropertyMode, PropertyValue, SourceKind, TreeNode } from './types';

const SAMPLES = 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website';

/** A constant-mode style property, with `code` seeded so switching to "Accessor" starts from something valid. */
function constant<T>(value: T, code: string): PropertyValue<T> {
  return { mode: 'constant', value, code };
}

const colorAccessorHint = "return properties.value > 0 ? '#e4572e' : '#2e86ab';";

export interface RenderKindInfo {
  label: string;
  icon: string;
  hint: string;
  sampleUrl?: string;
  style: LayerStyle;
  /** which style controls are meaningful */
  controls: Array<'radius' | 'lineWidth' | 'lineColor'>;
  radiusLabel?: string;
  /**
   * Which of the always-shown controls (`color`, `opacity`) and shown `controls` can switch to a
   * per-row accessor. Aggregation layers (hexagon/heatmap bin many rows into one visual mark, so
   * there's no single row to read an accessor from) get none.
   */
  accessorCapable: Array<'color' | 'opacity' | 'radius' | 'lineWidth' | 'lineColor'>;
}

/** How a layer's rows are drawn — independent of where they came from (`SourceKind`, below). */
export const RENDER_KINDS: Record<DeckLayerKind, RenderKindInfo> = {
  scatterplot: {
    label: 'Scatterplot', icon: '●',
    hint: 'Points: GeoJSON, [lng, lat] arrays, or objects with coordinates / lng & lat.',
    sampleUrl: `${SAMPLES}/bart-stations.json`,
    style: {
      color: constant('#e4572e', colorAccessorHint),
      opacity: constant(1, 'return properties.value ?? 1;'),
      radius: constant(120, 'return properties.value ?? 120;'),
      lineWidth: constant(1, 'return properties.value ?? 1;'),
      lineColor: constant('#ffffff', colorAccessorHint),
    },
    controls: ['radius', 'lineWidth', 'lineColor'], radiusLabel: 'Radius (m)',
    accessorCapable: ['color', 'opacity', 'radius', 'lineWidth', 'lineColor'],
  },
  geojson: {
    label: 'GeoJSON', icon: '⬟',
    hint: 'Any GeoJSON FeatureCollection (points, lines, polygons).',
    sampleUrl: `${SAMPLES}/bart.geo.json`,
    style: {
      color: constant('#2e86ab', colorAccessorHint),
      opacity: constant(0.9, 'return properties.value ?? 0.9;'),
      radius: constant(60, 'return properties.value ?? 60;'),
      lineWidth: constant(2, 'return properties.value ?? 2;'),
      lineColor: constant('#2e86ab', colorAccessorHint),
    },
    controls: ['lineWidth', 'radius', 'lineColor'], radiusLabel: 'Point radius (m)',
    accessorCapable: ['color', 'opacity', 'radius', 'lineWidth', 'lineColor'],
  },
  path: {
    label: 'Path', icon: '〰',
    hint: 'Lines: GeoJSON LineStrings or objects with a path: [[lng, lat], …].',
    sampleUrl: `${SAMPLES}/bart-lines.json`,
    style: {
      color: constant('#6a4c93', colorAccessorHint),
      opacity: constant(1, 'return properties.value ?? 1;'),
      radius: constant(0, ''),
      lineWidth: constant(4, 'return properties.value ?? 4;'),
      lineColor: constant('#6a4c93', colorAccessorHint),
    },
    controls: ['lineWidth'],
    accessorCapable: ['color', 'opacity', 'lineWidth'],
  },
  arc: {
    label: 'Arc', icon: '⌒',
    hint: 'Origin–destination pairs: { from, to }, { sourcePosition, targetPosition } or GeoJSON lines.',
    sampleUrl: `${SAMPLES}/bart-segments.json`,
    style: {
      color: constant('#f18f01', colorAccessorHint),
      opacity: constant(0.9, 'return properties.value ?? 0.9;'),
      radius: constant(0, ''),
      lineWidth: constant(2, 'return properties.value ?? 2;'),
      lineColor: constant('#f18f01', colorAccessorHint),
    },
    controls: ['lineWidth'],
    accessorCapable: ['color', 'opacity', 'lineWidth'],
  },
  hexagon: {
    label: 'Hexagon bins', icon: '⬢',
    hint: 'Aggregates points into hexagonal bins.',
    sampleUrl: `${SAMPLES}/sf-bike-parking.json`,
    style: {
      color: constant('#c73e1d', colorAccessorHint),
      opacity: constant(0.8, ''),
      radius: constant(200, ''),
      lineWidth: constant(1, ''),
      lineColor: constant('#c73e1d', ''),
    },
    controls: ['radius'], radiusLabel: 'Hex radius (m)',
    accessorCapable: [],
  },
  heatmap: {
    label: 'Heatmap', icon: '◍',
    hint: 'Density surface from points.',
    sampleUrl: `${SAMPLES}/sf-bike-parking.json`,
    style: {
      color: constant('#d7263d', colorAccessorHint),
      opacity: constant(0.85, ''),
      radius: constant(30, ''),
      lineWidth: constant(1, ''),
      lineColor: constant('#d7263d', ''),
    },
    controls: ['radius'], radiusLabel: 'Radius (px)',
    accessorCapable: [],
  },
};

export const DECK_KINDS: DeckLayerKind[] = ['scatterplot', 'geojson', 'path', 'arc', 'hexagon', 'heatmap'];

/**
 * Shape-compatible with `RenderKindInfo` (minus `sampleUrl`, which is a render-kind-only concept)
 * so every consumer can treat `layerInfo()`'s result uniformly without special-casing WMS, the only
 * source with no render kind to fall back on.
 */
export interface SourceKindInfo {
  label: string;
  icon: string;
  hint: string;
  /** default render kind for a newly added layer of this source; absent for 'wms' (no render choice at all) */
  defaultRender?: DeckLayerKind;
  /**
   * Fallback style, only actually used for 'wms' (which has no render kind to borrow a style from).
   * For every other source a new layer's style comes from `RENDER_KINDS[render].style` instead.
   */
  style: LayerStyle;
  /** always empty at runtime: a source itself (as opposed to its render kind) never has meaningful style controls */
  controls: Array<'radius' | 'lineWidth' | 'lineColor'>;
  radiusLabel?: string;
  accessorCapable: Array<'color' | 'opacity' | 'radius' | 'lineWidth' | 'lineColor'>;
}

const neutralStyle: LayerStyle = {
  color: constant('#888888', ''),
  opacity: constant(0.8, ''),
  radius: constant(0, ''),
  lineWidth: constant(1, ''),
  lineColor: constant('#888888', ''),
};

/** Where a layer's rows come from — independent of how they're drawn (`RENDER_KINDS`, above). */
export const SOURCE_KINDS: Record<SourceKind, SourceKindInfo> = {
  url: {
    label: 'URL', icon: '◎',
    hint: 'A CORS-enabled JSON/GeoJSON URL, shaped to match the render kind chosen below.',
    defaultRender: 'scatterplot',
    style: neutralStyle, controls: [], accessorCapable: [],
  },
  wms: {
    label: 'WMS', icon: '▦',
    hint: 'OGC Web Map Service, requested as 256px tiles in EPSG:3857.',
    style: neutralStyle, controls: [], accessorCapable: [],
  },
  wfs: {
    label: 'WFS', icon: '◇',
    hint: 'OGC Web Feature Service, requested as GeoJSON in EPSG:4326.',
    defaultRender: 'geojson',
    style: neutralStyle, controls: [], accessorCapable: [],
  },
  clickhouse: {
    label: 'ClickHouse', icon: '▧',
    hint: 'Rows from a ClickHouse SQL query (HTTP interface), drawn with the chosen render kind.',
    defaultRender: 'scatterplot',
    style: neutralStyle, controls: [], accessorCapable: [],
  },
  duckdb: {
    label: 'DuckDB', icon: '🦆',
    hint: 'Rows from a SQL query run in-browser by DuckDB-WASM, drawn with the chosen render kind.',
    defaultRender: 'scatterplot',
    style: neutralStyle, controls: [], accessorCapable: [],
  },
};

/**
 * The catalog info to *display* for a layer (tree-row icon/tag, the settings-panel footer hint):
 * the render kind's for a plain URL source (there's nothing more specific to say — "Scatterplot" is
 * the interesting fact), but the source's own for WMS/WFS/ClickHouse ("ClickHouse" is more useful at
 * a glance than whatever it happens to be rendered as). Not the same thing as which `RenderKindInfo`
 * actually governs a layer's style controls — see `renderKindInfo` below — the two match for a plain
 * URL source but diverge for the others, intentionally.
 */
export function displayInfo(node: Pick<LayerNode, 'kind' | 'render'>): RenderKindInfo | SourceKindInfo {
  return node.kind === 'url' ? RENDER_KINDS[node.render ?? 'scatterplot'] : SOURCE_KINDS[node.kind];
}

/** The `RenderKindInfo` governing a layer's style controls (radius/lineWidth/lineColor/accessorCapable) — always its chosen render kind, or WMS's own (empty) info for the one source with no render kind at all. */
export function renderKindInfo(node: Pick<LayerNode, 'kind' | 'render'>): RenderKindInfo | SourceKindInfo {
  return node.kind === 'wms' ? SOURCE_KINDS.wms : RENDER_KINDS[node.render ?? 'scatterplot'];
}

export interface ServicePreset { label: string; url: string; layer: string }

export const WMS_PRESETS: ServicePreset[] = [
  { label: 'terrestris – OpenStreetMap', url: 'https://ows.terrestris.de/osm/service', layer: 'OSM-WMS' },
  { label: 'terrestris – Topography', url: 'https://ows.terrestris.de/osm/service', layer: 'TOPO-WMS' },
  { label: 'IGN Géoplateforme – Orthophotos', url: 'https://data.geopf.fr/wms-r/wms', layer: 'ORTHOIMAGERY.ORTHOPHOTOS' },
];

export const WFS_PRESETS: ServicePreset[] = [
  { label: 'IGN Géoplateforme – French regions', url: 'https://data.geopf.fr/wfs/ows', layer: 'ADMINEXPRESS-COG-CARTO-PE.LATEST:region' },
];

export function makeLayer(
  kind: SourceKind,
  render: DeckLayerKind | undefined,
  name: string,
  url: string,
  extra: Partial<LayerNode> = {},
): LayerNode {
  const style = render ? RENDER_KINDS[render].style : SOURCE_KINDS[kind].style;
  return { type: 'layer', id: newId('layer'), name, visible: true, kind, render, url, style: { ...style }, ...extra };
}

export function makeGroup(name: string, children: TreeNode[] = []): TreeNode {
  return { type: 'group', id: newId('group'), name, visible: true, expanded: true, children };
}

function normalizePropertyValue<T>(raw: unknown, fallback: PropertyValue<T>, isValue: (v: unknown) => v is T): PropertyValue<T> {
  if (raw && typeof raw === 'object') {
    const c = raw as Partial<PropertyValue<T>>;
    const mode: PropertyMode = c.mode === 'accessor' ? 'accessor' : 'constant';
    return { mode, value: isValue(c.value) ? c.value : fallback.value, code: typeof c.code === 'string' ? c.code : fallback.code };
  }
  // Pre-accessor save: the field itself was the raw constant value, with no mode/code at all.
  if (isValue(raw)) return { mode: 'constant', value: raw, code: fallback.code };
  return fallback;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** Upgrades a possibly old-shaped (pre-accessor) or corrupt saved `style`, falling back field-by-field to `fallback`. */
export function normalizeLayerStyle(raw: unknown, fallback: LayerStyle): LayerStyle {
  const c = (raw ?? {}) as Partial<Record<keyof LayerStyle, unknown>>;
  return {
    color: normalizePropertyValue(c.color, fallback.color, isStr),
    opacity: normalizePropertyValue(c.opacity, fallback.opacity, isNum),
    radius: normalizePropertyValue(c.radius, fallback.radius, isNum),
    lineWidth: normalizePropertyValue(c.lineWidth, fallback.lineWidth, isNum),
    lineColor: normalizePropertyValue(c.lineColor, fallback.lineColor, isStr),
  };
}

const RENDER_KIND_SET = new Set<string>(DECK_KINDS);
const isDeckLayerKind = (v: unknown): v is DeckLayerKind => typeof v === 'string' && RENDER_KIND_SET.has(v);

/**
 * Upgrades a saved layer node to the current {kind: SourceKind, render?: DeckLayerKind} shape.
 * Before this split, `kind` was itself one of the deck.gl render kinds directly for a plain URL
 * layer ('scatterplot', 'path', …), and a ClickHouse layer's render kind lived nested inside
 * `clickhouse.render` instead of at the top level — both upgrade into the new shape here.
 */
export function normalizeLayerSource(raw: unknown): Pick<LayerNode, 'kind' | 'render' | 'clickhouse' | 'duckdb'> {
  const c = (raw ?? {}) as {
    kind?: unknown;
    render?: unknown;
    clickhouse?: { render?: unknown; [k: string]: unknown };
    duckdb?: { [k: string]: unknown };
  };
  if (isDeckLayerKind(c.kind)) return { kind: 'url', render: c.kind };
  if (c.kind === 'clickhouse') {
    const ch = c.clickhouse;
    const render = isDeckLayerKind(c.render) ? c.render : isDeckLayerKind(ch?.render) ? ch!.render : 'scatterplot';
    const clickhouse: LayerNode['clickhouse'] = ch && typeof ch.query === 'string'
      ? {
          query: ch.query,
          database: typeof ch.database === 'string' ? ch.database : undefined,
          username: typeof ch.username === 'string' ? ch.username : undefined,
          password: typeof ch.password === 'string' ? ch.password : undefined,
        }
      : undefined;
    return { kind: 'clickhouse', render, clickhouse };
  }
  if (c.kind === 'duckdb') {
    const dd = c.duckdb;
    const duckdbParams: LayerNode['duckdb'] = dd && typeof dd.query === 'string' ? { query: dd.query } : undefined;
    return { kind: 'duckdb', render: isDeckLayerKind(c.render) ? c.render : 'scatterplot', duckdb: duckdbParams };
  }
  if (c.kind === 'wfs') return { kind: 'wfs', render: isDeckLayerKind(c.render) ? c.render : 'geojson' };
  if (c.kind === 'wms') return { kind: 'wms', render: undefined };
  // Already-current 'url' shape, or anything unrecognised: keep render if valid, else fall back.
  return { kind: 'url', render: isDeckLayerKind(c.render) ? c.render : 'scatterplot' };
}

/** Upgrades every layer in a saved tree to the current source/render/style shape — see `normalizeLayerSource`/`normalizeLayerStyle`. */
export function normalizeTree(tree: TreeNode[]): TreeNode[] {
  return mapTree(tree, (node) => {
    if (node.type !== 'layer') return node;
    const source = normalizeLayerSource(node);
    const fallbackStyle = source.render ? RENDER_KINDS[source.render].style : SOURCE_KINDS[source.kind].style;
    return { ...node, ...source, style: normalizeLayerStyle(node.style, fallbackStyle) };
  });
}

export function defaultTree(): TreeNode[] {
  const hidden = { visible: false };
  return [
    makeGroup('BART network', [
      makeLayer('url', 'scatterplot', 'Stations', RENDER_KINDS.scatterplot.sampleUrl!),
      makeLayer('url', 'arc', 'Station segments', RENDER_KINDS.arc.sampleUrl!, hidden),
      makeLayer('url', 'path', 'Lines', RENDER_KINDS.path.sampleUrl!),
    ]),
    makeGroup('Bike parking', [
      makeLayer('url', 'hexagon', 'Racks (hexagons)', RENDER_KINDS.hexagon.sampleUrl!),
      makeLayer('url', 'heatmap', 'Racks (heatmap)', RENDER_KINDS.heatmap.sampleUrl!, hidden),
    ]),
    makeLayer('url', 'geojson', 'BART zones (GeoJSON)', RENDER_KINDS.geojson.sampleUrl!, hidden),
    makeGroup('OGC services', [
      makeLayer('wfs', 'geojson', 'French regions (WFS)', WFS_PRESETS[0].url, {
        visible: false,
        wfs: { typeName: WFS_PRESETS[0].layer, version: '2.0.0', maxFeatures: 1000, swapXY: false },
        bounds: [-5.2, 41.3, 9.6, 51.1],
      }),
      makeLayer('wms', undefined, 'OpenStreetMap (WMS)', WMS_PRESETS[0].url, {
        visible: false,
        wms: { layers: WMS_PRESETS[0].layer, styles: '', format: 'image/png', transparent: true, version: '1.3.0' },
      }),
    ]),
  ];
}
