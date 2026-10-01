import type { Layer } from '@deck.gl/core';
import { ArcLayer, BitmapLayer, GeoJsonLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TileLayer, type TileLayerProps } from '@deck.gl/geo-layers';
import { HeatmapLayer, HexagonLayer } from '@deck.gl/aggregation-layers';
import { resolveColorWithAlpha, resolveNumberProperty } from './accessors';
import { hexToRgb, type RGB, type RGBA } from './colors';
import { dataStore } from './data';
import { dataFilterExtensionProps, type DataFilterContext } from './layerExtensions';
import { fetchWmsImage, wmsGetMapUrl } from './ogc';
import type { BasemapConfig, Bounds, DeckLayerKind, LayerNode, LayerStyle, PropertyValue } from './types';

/** Light-to-strong ramp from the layer colour, used by aggregation layers. */
function colorRamp(hex: string): RGB[] {
  const [r, g, b] = hexToRgb(hex);
  return [0.3, 0.45, 0.6, 0.75, 0.88, 1].map((t) => [
    Math.round(255 + (r - 255) * t),
    Math.round(255 + (g - 255) * t),
    Math.round(255 + (b - 255) * t),
  ]);
}

/** A configurable basemap defaults to OpenStreetMap's own (keyless, CORS-enabled) tile server. */
export const DEFAULT_BASEMAP: BasemapConfig = {
  enabled: true,
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors',
};

type TileBBox = { west: number; south: number; east: number; north: number };

type SubLayerProps = Parameters<NonNullable<TileLayerProps<ImageBitmap | string>['renderSubLayers']>>[0];

function bitmapTile(props: SubLayerProps) {
  const [[west, south], [east, north]] = props.tile.boundingBox;
  const { data, ...rest } = props;
  return new BitmapLayer(rest, { image: data, bounds: [west, south, east, north] });
}

/** Upgrades a saved basemap value — the old `BasemapId` string preset, a corrupt object, or missing — to a `BasemapConfig`. */
export function normalizeBasemap(raw: unknown): BasemapConfig {
  if (typeof raw === 'string') return raw === 'none' ? { ...DEFAULT_BASEMAP, enabled: false } : DEFAULT_BASEMAP;
  const c = (raw ?? {}) as Partial<BasemapConfig>;
  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : DEFAULT_BASEMAP.enabled,
    url: typeof c.url === 'string' && c.url.trim() ? c.url : DEFAULT_BASEMAP.url,
    maxZoom: typeof c.maxZoom === 'number' && Number.isFinite(c.maxZoom) && c.maxZoom > 0 ? c.maxZoom : DEFAULT_BASEMAP.maxZoom,
    attribution: typeof c.attribution === 'string' ? c.attribution : DEFAULT_BASEMAP.attribution,
  };
}

export function basemapLayer(config: BasemapConfig): Layer | null {
  if (!config.enabled || !config.url.trim()) return null;
  return new TileLayer<ImageBitmap | string>({
    id: 'basemap',
    data: config.url,
    minZoom: 0,
    maxZoom: config.maxZoom,
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

const colorTrigger = (p: PropertyValue<string>) => [p.mode, p.code, p.value];
const numberTrigger = (p: PropertyValue<number>) => [p.mode, p.code, p.value];

function vectorLayer(node: LayerNode, kind: DeckLayerKind | 'wfs', style: LayerStyle, ctx: DeckLayerContext): Layer | null {
  const state = dataStore.get(node);
  if (state?.status !== 'ready') return null;
  const { loaded } = state;
  const common = {
    id: node.id,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 120] as RGBA,
    ...dataFilterExtensionProps(node.dataFilter, ctx),
  };
  // deck.gl layers don't accept a per-row accessor for their own `opacity` prop (constant only), so
  // a resolved opacity — constant or per-row — is baked into the alpha channel of whichever colour
  // the layer paints with instead; the layer's own `opacity` is left at its default (1) for every
  // kind below that uses this. (Hexagon/Heatmap are the exception — see their cases.) This replaces
  // this app's previous fixed fill/line alpha constants (90/200/255) with the user's own opacity.
  const color = resolveColorWithAlpha(style.color, style.opacity);
  const radius = resolveNumberProperty(style.radius);
  const lineWidth = resolveNumberProperty(style.lineWidth);
  // deck.gl's built-in accessor props (getFillColor, getRadius, …) are diffed by reference, and the
  // accessor functions above are cached by code string, so a prop only gets a new function reference
  // when its underlying code actually changes — these triggers are redundant insurance for that, kept
  // for the same reason the data filter's getFilterValue has one (see layerExtensions.ts): this app
  // already hit a case this session where relying on implicit reference-diffing alone silently failed.
  const colorUpdateTriggers = [...colorTrigger(style.color), ...numberTrigger(style.opacity)];

  switch (loaded.shape) {
    case 'geojson':
      return new GeoJsonLayer({
        ...common,
        data: loaded.data as never,
        filled: true,
        stroked: true,
        getFillColor: color,
        getLineColor: color,
        getPointRadius: radius,
        pointRadiusMinPixels: 3,
        getLineWidth: lineWidth,
        lineWidthUnits: 'pixels',
        updateTriggers: {
          ...common.updateTriggers,
          getFillColor: colorUpdateTriggers,
          getLineColor: colorUpdateTriggers,
          getPointRadius: numberTrigger(style.radius),
          getLineWidth: numberTrigger(style.lineWidth),
        },
      });
    case 'paths':
      return new PathLayer({
        ...common,
        data: loaded.data,
        getPath: (d) => d.path,
        getColor: color,
        getWidth: lineWidth,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        updateTriggers: { ...common.updateTriggers, getColor: colorUpdateTriggers, getWidth: numberTrigger(style.lineWidth) },
      });
    case 'arcs': {
      // Constant mode keeps the existing "solid source, lighter target" ramp look; an accessor on
      // colour or opacity has no single ramp to derive a lighter variant from, so both ends share
      // the same per-row resolved colour instead.
      const isAccessor = style.color.mode === 'accessor' || style.opacity.mode === 'accessor';
      const targetColor: RGBA | ((d: { properties?: Record<string, unknown> | null }) => RGBA) = isAccessor
        ? color
        : [...colorRamp(style.color.value)[1], Math.round(style.opacity.value * 255)];
      return new ArcLayer({
        ...common,
        data: loaded.data,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getSourceColor: color,
        getTargetColor: targetColor,
        getWidth: lineWidth,
        updateTriggers: {
          ...common.updateTriggers,
          getSourceColor: colorUpdateTriggers,
          getTargetColor: colorUpdateTriggers,
          getWidth: numberTrigger(style.lineWidth),
        },
      });
    }
    case 'points':
      if (kind === 'hexagon') {
        return new HexagonLayer({
          ...common,
          opacity: style.opacity.value,
          data: loaded.data,
          getPosition: (d) => d.position,
          radius: style.radius.value,
          coverage: 0.9,
          extruded: false,
          colorRange: colorRamp(style.color.value),
          gpuAggregation: false,
        });
      }
      if (kind === 'heatmap') {
        return new HeatmapLayer({
          ...common,
          opacity: style.opacity.value,
          pickable: false,
          data: loaded.data,
          getPosition: (d) => d.position,
          radiusPixels: style.radius.value,
          colorRange: colorRamp(style.color.value),
        });
      }
      return new ScatterplotLayer({
        ...common,
        data: loaded.data,
        getPosition: (d) => d.position,
        getRadius: radius,
        radiusMinPixels: 2,
        stroked: true,
        getFillColor: color,
        getLineColor: [255, 255, 255, 220],
        lineWidthMinPixels: 1,
        updateTriggers: { ...common.updateTriggers, getRadius: numberTrigger(style.radius), getFillColor: colorUpdateTriggers },
      });
  }
}

export type DeckLayerContext = DataFilterContext;

/** Builds the deck.gl layer for a node; returns null while data is still loading. */
export function toDeckLayer(node: LayerNode, ctx: DeckLayerContext): Layer | null {
  if (node.kind === 'wms') return node.wms ? wmsLayer(node, node.style.opacity.value) : null;
  const kind = node.kind === 'clickhouse' ? (node.clickhouse?.render ?? 'scatterplot') : node.kind;
  return vectorLayer(node, kind, node.style, ctx);
}
