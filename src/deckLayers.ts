import type { Layer } from '@deck.gl/core';
import { ArcLayer, BitmapLayer, GeoJsonLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TileLayer, type TileLayerProps } from '@deck.gl/geo-layers';
import { HeatmapLayer, HexagonLayer } from '@deck.gl/aggregation-layers';
import { dataStore } from './data';
import { dataFilterExtensionProps, type DataFilterContext } from './layerExtensions';
import { fetchWmsImage, wmsGetMapUrl } from './ogc';
import type { Bounds, DeckLayerKind, LayerNode, LayerStyle } from './types';

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const withAlpha = (rgb: RGB, a: number): RGBA => [rgb[0], rgb[1], rgb[2], a];

/** Light-to-strong ramp from the layer colour, used by aggregation layers. */
function colorRamp(hex: string): RGB[] {
  const [r, g, b] = hexToRgb(hex);
  return [0.3, 0.45, 0.6, 0.75, 0.88, 1].map((t) => [
    Math.round(255 + (r - 255) * t),
    Math.round(255 + (g - 255) * t),
    Math.round(255 + (b - 255) * t),
  ]);
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_ATTRIBUTION = 'Tiles © Esri';

/** Keyless, CORS-enabled raster basemaps. */
export const BASEMAPS = {
  light: { label: 'Light', url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, maxZoom: 16, attribution: `${ESRI_ATTRIBUTION} — Esri, HERE, Garmin, © OpenStreetMap contributors` },
  dark: { label: 'Dark', url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, maxZoom: 16, attribution: `${ESRI_ATTRIBUTION} — Esri, HERE, Garmin, © OpenStreetMap contributors` },
  osm: { label: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19, attribution: '© OpenStreetMap contributors' },
  imagery: { label: 'Imagery', url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, maxZoom: 19, attribution: `${ESRI_ATTRIBUTION} — Esri, Maxar, Earthstar Geographics` },
  none: { label: 'None', url: '', maxZoom: 0, attribution: '' },
} as const;
export type BasemapId = keyof typeof BASEMAPS;

type TileBBox = { west: number; south: number; east: number; north: number };

type SubLayerProps = Parameters<NonNullable<TileLayerProps<ImageBitmap | string>['renderSubLayers']>>[0];

function bitmapTile(props: SubLayerProps) {
  const [[west, south], [east, north]] = props.tile.boundingBox;
  const { data, ...rest } = props;
  return new BitmapLayer(rest, { image: data, bounds: [west, south, east, north] });
}

export function basemapLayer(id: BasemapId): Layer | null {
  const { url, maxZoom } = BASEMAPS[id];
  if (!url) return null;
  return new TileLayer<ImageBitmap | string>({
    id: `basemap-${id}`,
    data: url,
    minZoom: 0,
    maxZoom,
    tileSize: 256,
    renderSubLayers: bitmapTile,
  });
}

function wmsLayer(node: LayerNode, opacity: number): Layer {
  const p = node.wms!;
  return new TileLayer<ImageBitmap | string>({
    id: node.id,
    opacity,
    minZoom: 0,
    maxZoom: 22,
    tileSize: 256,
    // Re-request tiles when service parameters change.
    updateTriggers: { getTileData: [node.url, p.layers, p.styles, p.format, p.transparent, p.version, node.rev] },
    getTileData: async ({ bbox, signal }) => {
      const b = bbox as TileBBox;
      const bounds: Bounds = [b.west, b.south, b.east, b.north];
      const img = await fetchWmsImage(wmsGetMapUrl(node.url, p, bounds), signal);
      dataStore.setTileError(node.id, undefined);
      return img;
    },
    onTileError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if ((err as Error)?.name === 'AbortError') return;
      dataStore.setTileError(node.id, msg === 'Failed to fetch' ? 'Network or CORS error' : msg);
    },
    renderSubLayers: bitmapTile,
  });
}

function vectorLayer(node: LayerNode, kind: DeckLayerKind | 'wfs', style: LayerStyle, ctx: DeckLayerContext): Layer | null {
  const state = dataStore.get(node);
  if (state?.status !== 'ready') return null;
  const { loaded } = state;
  const rgb = hexToRgb(style.color);
  const common = {
    id: node.id,
    opacity: style.opacity,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 120] as RGBA,
    ...dataFilterExtensionProps(node.dataFilter, ctx),
  };

  switch (loaded.shape) {
    case 'geojson':
      return new GeoJsonLayer({
        ...common,
        data: loaded.data as never,
        filled: true,
        stroked: true,
        getFillColor: withAlpha(rgb, 90),
        getLineColor: withAlpha(rgb, 255),
        getPointRadius: style.radius,
        pointRadiusMinPixels: 3,
        getLineWidth: style.lineWidth,
        lineWidthUnits: 'pixels',
      });
    case 'paths':
      return new PathLayer({
        ...common,
        data: loaded.data,
        getPath: (d) => d.path,
        getColor: rgb,
        getWidth: style.lineWidth,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
      });
    case 'arcs':
      return new ArcLayer({
        ...common,
        data: loaded.data,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getSourceColor: rgb,
        getTargetColor: colorRamp(style.color)[1],
        getWidth: style.lineWidth,
      });
    case 'points':
      if (kind === 'hexagon') {
        return new HexagonLayer({
          ...common,
          data: loaded.data,
          getPosition: (d) => d.position,
          radius: style.radius,
          coverage: 0.9,
          extruded: false,
          colorRange: colorRamp(style.color),
          gpuAggregation: false,
        });
      }
      if (kind === 'heatmap') {
        return new HeatmapLayer({
          ...common,
          pickable: false,
          data: loaded.data,
          getPosition: (d) => d.position,
          radiusPixels: style.radius,
          colorRange: colorRamp(style.color),
        });
      }
      return new ScatterplotLayer({
        ...common,
        data: loaded.data,
        getPosition: (d) => d.position,
        getRadius: style.radius,
        radiusMinPixels: 2,
        stroked: true,
        getFillColor: withAlpha(rgb, 200),
        getLineColor: [255, 255, 255, 220],
        lineWidthMinPixels: 1,
      });
  }
}

export type DeckLayerContext = DataFilterContext;

/** Builds the deck.gl layer for a node; returns null while data is still loading. */
export function toDeckLayer(node: LayerNode, ctx: DeckLayerContext): Layer | null {
  if (node.kind === 'wms') return node.wms ? wmsLayer(node, node.style.opacity) : null;
  const kind = node.kind === 'clickhouse' ? (node.clickhouse?.render ?? 'scatterplot') : node.kind;
  return vectorLayer(node, kind, node.style, ctx);
}
