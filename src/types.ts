import type { WidgetPlacement } from '@deck.gl/core';

export type TimeUnit = 'ms' | 'seconds' | 'minutes' | 'hours' | 'days';

/** A user-entered duration, e.g. `{ value: 2, unit: 'hours' }`; convert with `durationMs` (see duration.ts). */
export interface Duration {
  value: number;
  unit: TimeUnit;
}

export type DeckLayerKind = 'scatterplot' | 'geojson' | 'path' | 'arc' | 'hexagon' | 'heatmap';
/** Where a layer's rows come from — independent of how they're drawn (see `DeckLayerKind`/`LayerNode.render`). */
export type SourceKind = 'url' | 'wms' | 'wfs' | 'clickhouse';

/** [west, south, east, north] in degrees */
export type Bounds = [number, number, number, number];

export type PropertyMode = 'constant' | 'accessor';

/**
 * A layer style property that's either a fixed `value`, or a per-row JS accessor (`code`, a
 * function body; `properties` and `d` — the row/feature — are in scope). Both are always kept, so
 * switching `mode` back and forth in the UI doesn't lose whichever one isn't active.
 */
export interface PropertyValue<T> {
  mode: PropertyMode;
  value: T;
  code: string;
}

export interface LayerStyle {
  /** fill/main hex colour, e.g. "#ff8800"; an accessor must return a hex string */
  color: PropertyValue<string>;
  /** 0..1; shared by both `color` and `lineColor`'s alpha channel */
  opacity: PropertyValue<number>;
  /** metres for scatterplot / hexagon, pixels for heatmap */
  radius: PropertyValue<number>;
  /** pixels */
  lineWidth: PropertyValue<number>;
  /** stroke/outline hex colour — e.g. a scatterplot point's border, a polygon's outline */
  lineColor: PropertyValue<string>;
}

export interface WmsParams {
  layers: string;
  styles: string;
  format: string;
  transparent: boolean;
  version: '1.1.1' | '1.3.0';
}

export interface WfsParams {
  typeName: string;
  version: '1.1.0' | '2.0.0';
  maxFeatures: number;
  /** some servers return lat/lon for EPSG:4326 */
  swapXY: boolean;
  /**
   * OUTPUTFORMAT sent to GetFeature. Missing = 'application/json' (layers saved before this option existed);
   * '' = omit the parameter, so the server answers with its default GML.
   */
  outputFormat?: string;
}

export interface ClickHouseParams {
  /** SQL query; result columns are interpreted the same way as `LayerNode.render`'s deck.gl layer (lng/lat, path, source/target, or GeoJSON) */
  query: string;
  database?: string;
  username?: string;
  password?: string;
}

export interface DataFilterConfig {
  enabled: boolean;
  /**
   * JS function body for deck.gl's DataFilterExtension `getFilterValue` accessor.
   * Receives `properties` (the row/feature's properties) and `d` (the raw row/feature); must
   * return a number.
   */
  getFilterValue: string;
  /** 'manual': `filterRange` below, typed in directly. 'timeline': `[timestamp - delay, timestamp]`, recomputed from the Timeline widget's position (or "now" if it's off). */
  mode: 'manual' | 'timeline';
  /** rows whose value falls within [min, max] are shown; others are hidden. Used when `mode` is 'manual'. */
  filterRange: [number, number];
  /** trailing window length. Used when `mode` is 'timeline'. */
  delay: Duration;
  /**
   * GPU-shader-computed opacity fade across the active range: 0% at its start, 100% at its end.
   * Independent of (and stacks multiplicatively with) the layer's own opacity. See `FilterFadeExtension`.
   */
  fadeOpacity: boolean;
}

export interface LayerNode {
  type: 'layer';
  id: string;
  name: string;
  visible: boolean;
  /** where rows come from */
  kind: SourceKind;
  /** how rows are drawn — a real choice for every source except 'wms' (raster tiles draw themselves) */
  render?: DeckLayerKind;
  /** data URL for deck.gl layers, service endpoint for WMS / WFS / ClickHouse */
  url: string;
  style: LayerStyle;
  wms?: WmsParams;
  wfs?: WfsParams;
  clickhouse?: ClickHouseParams;
  /** deck.gl DataFilterExtension, applied to every non-WMS layer kind */
  dataFilter?: DataFilterConfig;
  /** known extent, e.g. from GetCapabilities */
  bounds?: Bounds;
  /** bumped by "Reload" to force a refetch */
  rev?: number;
}

export interface GroupNode {
  type: 'group';
  id: string;
  name: string;
  visible: boolean;
  expanded: boolean;
  children: TreeNode[];
}

export type TreeNode = LayerNode | GroupNode;

export type DropPosition = 'before' | 'after' | 'inside';

export interface DropTarget {
  id: string;
  position: DropPosition;
}

export interface BasemapConfig {
  enabled: boolean;
  /** XYZ tile URL template, e.g. "https://tile.openstreetmap.org/{z}/{x}/{y}.png" */
  url: string;
  maxZoom: number;
  /** shown bottom-right of the map */
  attribution: string;
}

export type WidgetKind = 'zoom' | 'compass' | 'resetView' | 'gimbal' | 'fullscreen' | 'screenshot' | 'theme' | 'loading' | 'scale' | 'timeline';

export interface TimelineConfig {
  /** [min, max] epoch-ms bounds for the slider */
  timeRange: [number, number];
  autoPlay: boolean;
  /** the slider advances by this much on each auto-play tick (or arrow-key press) */
  step: Duration;
  /** ms of real time between auto-play ticks; together with `step`, sets play speed */
  playInterval: number;
}

export interface WidgetConfig {
  enabled: boolean;
  placement: WidgetPlacement;
  /** only set (and used) for the 'timeline' kind */
  timeline?: TimelineConfig;
}

export type WidgetSettings = Record<WidgetKind, WidgetConfig>;
