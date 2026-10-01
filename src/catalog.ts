import { newId } from './tree';
import type { DeckLayerKind, LayerKind, LayerNode, LayerStyle, TreeNode } from './types';

const SAMPLES = 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website';

export interface KindInfo {
  label: string;
  icon: string;
  hint: string;
  sampleUrl?: string;
  style: LayerStyle;
  /** which style controls are meaningful */
  controls: Array<'radius' | 'lineWidth'>;
  radiusLabel?: string;
}

export const KINDS: Record<LayerKind, KindInfo> = {
  scatterplot: {
    label: 'Scatterplot', icon: '●',
    hint: 'Points: GeoJSON, [lng, lat] arrays, or objects with coordinates / lng & lat.',
    sampleUrl: `${SAMPLES}/bart-stations.json`,
    style: { color: '#e4572e', opacity: 1, radius: 120, lineWidth: 1 },
    controls: ['radius'], radiusLabel: 'Radius (m)',
  },
  geojson: {
    label: 'GeoJSON', icon: '⬟',
    hint: 'Any GeoJSON FeatureCollection (points, lines, polygons).',
    sampleUrl: `${SAMPLES}/bart.geo.json`,
    style: { color: '#2e86ab', opacity: 0.9, radius: 60, lineWidth: 2 },
    controls: ['lineWidth', 'radius'], radiusLabel: 'Point radius (m)',
  },
  path: {
    label: 'Path', icon: '〰',
    hint: 'Lines: GeoJSON LineStrings or objects with a path: [[lng, lat], …].',
    sampleUrl: `${SAMPLES}/bart-lines.json`,
    style: { color: '#6a4c93', opacity: 1, radius: 0, lineWidth: 4 },
    controls: ['lineWidth'],
  },
  arc: {
    label: 'Arc', icon: '⌒',
    hint: 'Origin–destination pairs: { from, to }, { sourcePosition, targetPosition } or GeoJSON lines.',
    sampleUrl: `${SAMPLES}/bart-segments.json`,
    style: { color: '#f18f01', opacity: 0.9, radius: 0, lineWidth: 2 },
    controls: ['lineWidth'],
  },
  hexagon: {
    label: 'Hexagon bins', icon: '⬢',
    hint: 'Aggregates points into hexagonal bins.',
    sampleUrl: `${SAMPLES}/sf-bike-parking.json`,
    style: { color: '#c73e1d', opacity: 0.8, radius: 200, lineWidth: 1 },
    controls: ['radius'], radiusLabel: 'Hex radius (m)',
  },
  heatmap: {
    label: 'Heatmap', icon: '◍',
    hint: 'Density surface from points.',
    sampleUrl: `${SAMPLES}/sf-bike-parking.json`,
    style: { color: '#d7263d', opacity: 0.85, radius: 30, lineWidth: 1 },
    controls: ['radius'], radiusLabel: 'Radius (px)',
  },
  wms: {
    label: 'WMS', icon: '▦',
    hint: 'OGC Web Map Service, requested as 256px tiles in EPSG:3857.',
    style: { color: '#888888', opacity: 0.8, radius: 0, lineWidth: 1 },
    controls: [],
  },
  wfs: {
    label: 'WFS', icon: '◇',
    hint: 'OGC Web Feature Service, requested as GeoJSON in EPSG:4326.',
    style: { color: '#1b998b', opacity: 0.9, radius: 80, lineWidth: 1.5 },
    controls: ['lineWidth', 'radius'], radiusLabel: 'Point radius (m)',
  },
  clickhouse: {
    label: 'ClickHouse', icon: '▧',
    hint: 'Rows from a ClickHouse SQL query (HTTP interface), drawn with the chosen render layer.',
    style: { color: '#ffc300', opacity: 0.85, radius: 100, lineWidth: 2 },
    controls: ['radius', 'lineWidth'], radiusLabel: 'Radius',
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
