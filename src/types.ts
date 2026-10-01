import type { WidgetPlacement } from '@deck.gl/core';

export type DeckLayerKind = 'scatterplot' | 'geojson' | 'path' | 'arc' | 'hexagon' | 'heatmap';
export type LayerKind = DeckLayerKind | 'wms' | 'wfs' | 'clickhouse';

/** [west, south, east, north] in degrees */
export type Bounds = [number, number, number, number];

export interface LayerStyle {
  /** hex colour, e.g. "#ff8800" */
  color: string;
  /** 0..1 */
  opacity: number;
  /** metres for scatterplot / hexagon, pixels for heatmap */
  radius: number;
  /** pixels */
  lineWidth: number;
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
  /** SQL query; result columns are interpreted the same way as `render`'s deck.gl layer (lng/lat, path, source/target, or GeoJSON) */
  query: string;
  database?: string;
  username?: string;
  password?: string;
  /** deck.gl layer used to draw the query's rows */
  render: DeckLayerKind;
}

export interface DataFilterConfig {
  enabled: boolean;
  /**
   * JS function body for deck.gl's DataFilterExtension `getFilterValue` accessor.
   * Receives `properties` (the row/feature's properties), `d` (the raw row/feature), and
   * `timestamp` (epoch ms: the Timeline widget's current position if one is enabled, else the
   * time the layer was last (re)built); must return a number.
   */
  getFilterValue: string;
  /** rows whose value falls within [min, max] are shown; others are hidden */
  filterRange: [number, number];
}

export interface LayerNode {
  type: 'layer';
  id: string;
  name: string;
  visible: boolean;
  kind: LayerKind;
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

export type WidgetKind = 'zoom' | 'compass' | 'resetView' | 'gimbal' | 'fullscreen' | 'screenshot' | 'theme' | 'loading' | 'scale' | 'timeline';

export interface TimelineConfig {
  /** [min, max] epoch-ms bounds for the slider */
  timeRange: [number, number];
  autoPlay: boolean;
}

export interface WidgetConfig {
  enabled: boolean;
  placement: WidgetPlacement;
  /** only set (and used) for the 'timeline' kind */
  timeline?: TimelineConfig;
}

export type WidgetSettings = Record<WidgetKind, WidgetConfig>;
