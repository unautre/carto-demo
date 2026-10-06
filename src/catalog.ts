import { mapTree, newId } from './tree';
import type { DeckLayerKind, LayerKind, LayerNode, LayerStyle, PropertyMode, PropertyValue, TreeNode } from './types';

const SAMPLES = 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website';

/** A constant-mode style property, with `code` seeded so switching to "Accessor" starts from something valid. */
function constant<T>(value: T, code: string): PropertyValue<T> {
  return { mode: 'constant', value, code };
}

const colorAccessorHint = "return properties.value > 0 ? '#e4572e' : '#2e86ab';";

export interface KindInfo {
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
   * there's no single row to read an accessor from) and WMS (raster tiles, no rows at all) get none.
   */
  accessorCapable: Array<'color' | 'opacity' | 'radius' | 'lineWidth' | 'lineColor'>;
}

export const KINDS: Record<LayerKind, KindInfo> = {
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
  wms: {
    label: 'WMS', icon: '▦',
    hint: 'OGC Web Map Service, requested as 256px tiles in EPSG:3857.',
    style: {
      color: constant('#888888', ''),
      opacity: constant(0.8, ''),
      radius: constant(0, ''),
      lineWidth: constant(1, ''),
      lineColor: constant('#888888', ''),
    },
    controls: [],
    accessorCapable: [],
  },
  wfs: {
    label: 'WFS', icon: '◇',
    hint: 'OGC Web Feature Service, requested as GeoJSON in EPSG:4326.',
    style: {
      color: constant('#1b998b', colorAccessorHint),
      opacity: constant(0.9, 'return properties.value ?? 0.9;'),
      radius: constant(80, 'return properties.value ?? 80;'),
      lineWidth: constant(1.5, 'return properties.value ?? 1.5;'),
      lineColor: constant('#1b998b', colorAccessorHint),
    },
    controls: ['lineWidth', 'radius', 'lineColor'], radiusLabel: 'Point radius (m)',
    accessorCapable: ['color', 'opacity', 'radius', 'lineWidth', 'lineColor'],
  },
  clickhouse: {
    label: 'ClickHouse', icon: '▧',
    hint: 'Rows from a ClickHouse SQL query (HTTP interface), drawn with the chosen render layer.',
    style: {
      color: constant('#ffc300', colorAccessorHint),
      opacity: constant(0.85, 'return properties.value ?? 0.85;'),
      radius: constant(100, 'return properties.value ?? 100;'),
      lineWidth: constant(2, 'return properties.value ?? 2;'),
      lineColor: constant('#ffc300', colorAccessorHint),
    },
    controls: ['radius', 'lineWidth', 'lineColor'], radiusLabel: 'Radius',
    // A ClickHouse layer's accessor capability actually follows its chosen render kind (see
    // LayerSettings.tsx's `renderInfo`), not this entry — kept non-empty here only so a ClickHouse
    // layer itself (before a render kind narrows it down) doesn't look accessor-incapable by default.
    accessorCapable: ['color', 'opacity', 'radius', 'lineWidth', 'lineColor'],
  },
};

export const DECK_KINDS: DeckLayerKind[] = ['scatterplot', 'geojson', 'path', 'arc', 'hexagon', 'heatmap'];

export interface ServicePreset { label: string; url: string; layer: string }

export const WMS_PRESETS: ServicePreset[] = [
  { label: 'terrestris – OpenStreetMap', url: 'https://ows.terrestris.de/osm/service', layer: 'OSM-WMS' },
  { label: 'terrestris – Topography', url: 'https://ows.terrestris.de/osm/service', layer: 'TOPO-WMS' },
  { label: 'IGN Géoplateforme – Orthophotos', url: 'https://data.geopf.fr/wms-r/wms', layer: 'ORTHOIMAGERY.ORTHOPHOTOS' },
];

export const WFS_PRESETS: ServicePreset[] = [
  { label: 'IGN Géoplateforme – French regions', url: 'https://data.geopf.fr/wfs/ows', layer: 'ADMINEXPRESS-COG-CARTO-PE.LATEST:region' },
];

export function makeLayer(kind: LayerKind, name: string, url: string, extra: Partial<LayerNode> = {}): LayerNode {
  return { type: 'layer', id: newId('layer'), name, visible: true, kind, url, style: { ...KINDS[kind].style }, ...extra };
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

/** Upgrades every layer's `style` in a saved tree — see `normalizeLayerStyle`. */
export function normalizeTree(tree: TreeNode[]): TreeNode[] {
  return mapTree(tree, (node) => (node.type === 'layer' ? { ...node, style: normalizeLayerStyle(node.style, KINDS[node.kind].style) } : node));
}

export function defaultTree(): TreeNode[] {
  const hidden = { visible: false };
  return [
    makeGroup('BART network', [
      makeLayer('scatterplot', 'Stations', KINDS.scatterplot.sampleUrl!),
      makeLayer('arc', 'Station segments', KINDS.arc.sampleUrl!, hidden),
      makeLayer('path', 'Lines', KINDS.path.sampleUrl!),
    ]),
    makeGroup('Bike parking', [
      makeLayer('hexagon', 'Racks (hexagons)', KINDS.hexagon.sampleUrl!),
      makeLayer('heatmap', 'Racks (heatmap)', KINDS.heatmap.sampleUrl!, hidden),
    ]),
    makeLayer('geojson', 'BART zones (GeoJSON)', KINDS.geojson.sampleUrl!, hidden),
    makeGroup('OGC services', [
      makeLayer('wfs', 'French regions (WFS)', WFS_PRESETS[0].url, {
        visible: false,
        wfs: { typeName: WFS_PRESETS[0].layer, version: '2.0.0', maxFeatures: 1000, swapXY: false },
        bounds: [-5.2, 41.3, 9.6, 51.1],
      }),
      makeLayer('wms', 'OpenStreetMap (WMS)', WMS_PRESETS[0].url, {
        visible: false,
        wms: { layers: WMS_PRESETS[0].layer, styles: '', format: 'image/png', transparent: true, version: '1.3.0' },
      }),
    ]),
  ];
}
