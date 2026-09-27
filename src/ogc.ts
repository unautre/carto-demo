import type { Bounds, WfsParams, WmsParams } from './types';

const R = 6378137;

/** lon/lat degrees -> EPSG:3857 metres */
export function toMercator(lon: number, lat: number): [number, number] {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = (R * lon * Math.PI) / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
  return [x, y];
}

/** Adds query params to a service URL that may already have some (e.g. "?map=foo"). */
function withParams(url: string, params: Record<string, string>): string {
  const u = new URL(url, window.location.href);
  const existing = new Set([...u.searchParams.keys()].map((k) => k.toLowerCase()));
  for (const [k, v] of Object.entries(params)) {
    if (!existing.has(k.toLowerCase())) u.searchParams.set(k, v);
  }
  return u.toString();
}

export function wmsGetMapUrl(url: string, p: WmsParams, bbox: Bounds, size = 256): string {
  const [minX, minY] = toMercator(bbox[0], bbox[1]);
  const [maxX, maxY] = toMercator(bbox[2], bbox[3]);
  return withParams(url, {
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: p.version,
    LAYERS: p.layers,
    STYLES: p.styles,
    FORMAT: p.format,
    TRANSPARENT: p.transparent ? 'TRUE' : 'FALSE',
    [p.version === '1.3.0' ? 'CRS' : 'SRS']: 'EPSG:3857',
    BBOX: [minX, minY, maxX, maxY].join(','),
    WIDTH: String(size),
    HEIGHT: String(size),
  });
}

/** Fetches one WMS image; turns an XML ServiceException into a readable error. */
export async function fetchWmsImage(src: string, signal?: AbortSignal): Promise<ImageBitmap> {
  const res = await fetch(src, { signal });
  if (!res.ok) throw new Error(`WMS HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) {
    const text = await res.text();
    throw new Error(`WMS error: ${extractOgcError(text) ?? text.slice(0, 200)}`);
  }
  return createImageBitmap(await res.blob());
}

export const WFS_JSON_FORMAT = 'application/json';

export function wfsGetFeatureUrl(url: string, p: WfsParams): string {
  const v2 = p.version === '2.0.0';
  const outputFormat = p.outputFormat ?? WFS_JSON_FORMAT;
  return withParams(url, {
    SERVICE: 'WFS',
    REQUEST: 'GetFeature',
    VERSION: p.version,
    [v2 ? 'TYPENAMES' : 'TYPENAME']: p.typeName,
    [v2 ? 'COUNT' : 'MAXFEATURES']: String(p.maxFeatures),
    ...(outputFormat ? { OUTPUTFORMAT: outputFormat } : {}),
    SRSNAME: 'EPSG:4326',
  });
}

/** True for output formats we can read as GeoJSON (the rest are parsed as GML). */
export const isJsonFormat = (format: string) => /json/i.test(format);

export function capabilitiesUrl(url: string, service: 'WMS' | 'WFS'): string {
  return withParams(url, { SERVICE: service, REQUEST: 'GetCapabilities' });
}

function extractOgcError(text: string): string | undefined {
  const m = text.match(/<(?:\w+:)?(?:ServiceException|ExceptionText)[^>]*>([\s\S]*?)<\//);
  return m?.[1].trim();
}

export interface CapabilityLayer {
  name: string;
  title: string;
  bounds?: Bounds;
}

export interface Capabilities {
  version: string;
  title: string;
  layers: CapabilityLayer[];
  /** WFS GetFeature output formats advertised by the server, when listed */
  outputFormats?: string[];
}

/** Direct children with a given local name (namespace-agnostic). */
function children(el: Element, name: string): Element[] {
  return [...el.children].filter((c) => c.localName === name);
}

function childText(el: Element, name: string): string {
  return children(el, name)[0]?.textContent?.trim() ?? '';
}

async function fetchXml(url: string, signal?: AbortSignal): Promise<Document> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Response is not valid XML');
  const err = extractOgcError(text);
  if (err && !doc.documentElement.localName.includes('Capabilities')) throw new Error(err);
  return doc;
}

function parseWmsBounds(layer: Element): Bounds | undefined {
  const ex = children(layer, 'EX_GeographicBoundingBox')[0];
  if (ex) {
    const n = (k: string) => Number(childText(ex, k));
    return [n('westBoundLongitude'), n('southBoundLatitude'), n('eastBoundLongitude'), n('northBoundLatitude')];
  }
  const ll = children(layer, 'LatLonBoundingBox')[0];
  if (ll) {
    const a = (k: string) => Number(ll.getAttribute(k));
    return [a('minx'), a('miny'), a('maxx'), a('maxy')];
  }
  return undefined;
}

export async function fetchWmsCapabilities(url: string, signal?: AbortSignal): Promise<Capabilities> {
  const doc = await fetchXml(capabilitiesUrl(url, 'WMS'), signal);
  const root = doc.documentElement;
  const layers: CapabilityLayer[] = [];
  // Walk nested <Layer> elements, inheriting the parent's extent when a child has none.
  const walk = (el: Element, inherited?: Bounds) => {
    for (const layer of children(el, 'Layer')) {
      const bounds = parseWmsBounds(layer) ?? inherited;
      const name = childText(layer, 'Name');
      if (name) layers.push({ name, title: childText(layer, 'Title') || name, bounds });
      walk(layer, bounds);
    }
  };
  const capability = children(root, 'Capability')[0];
  if (capability) walk(capability);
  return {
    version: root.getAttribute('version') ?? '1.3.0',
    title: childText(children(root, 'Service')[0] ?? root, 'Title'),
    layers,
  };
}

export async function fetchWfsCapabilities(url: string, signal?: AbortSignal): Promise<Capabilities> {
  const doc = await fetchXml(capabilitiesUrl(url, 'WFS'), signal);
  const root = doc.documentElement;
  const list = [...root.getElementsByTagNameNS('*', 'FeatureType')];
  const layers = list.map((ft): CapabilityLayer => {
    const name = childText(ft, 'Name');
    const bbox = children(ft, 'WGS84BoundingBox')[0];
    let bounds: Bounds | undefined;
    if (bbox) {
      const lower = childText(bbox, 'LowerCorner').split(/\s+/).map(Number);
      const upper = childText(bbox, 'UpperCorner').split(/\s+/).map(Number);
      if (lower.length === 2 && upper.length === 2) bounds = [lower[0], lower[1], upper[0], upper[1]];
    }
    return { name, title: childText(ft, 'Title') || name, bounds };
  });
  const ident = children(root, 'ServiceIdentification')[0] ?? children(root, 'Service')[0];
  return {
    version: root.getAttribute('version') ?? '2.0.0',
    title: ident ? childText(ident, 'Title') : '',
    layers: layers.filter((l) => l.name),
    outputFormats: parseWfsOutputFormats(root),
  };
}

/** GetFeature output formats: OWS OperationsMetadata (WFS 1.1 / 2.0) or ResultFormat (WFS 1.0). */
export function parseWfsOutputFormats(root: Element): string[] | undefined {
  const getFeature = [...root.getElementsByTagNameNS('*', 'Operation')].find((o) => o.getAttribute('name') === 'GetFeature');
  const param = getFeature && children(getFeature, 'Parameter').find((p) => p.getAttribute('name')?.toLowerCase() === 'outputformat');
  let formats = param ? [...param.getElementsByTagNameNS('*', 'Value')].map((v) => v.textContent?.trim() ?? '') : [];
  if (!formats.length) {
    const resultFormat = [...root.getElementsByTagNameNS('*', 'GetFeature')].flatMap((g) => children(g, 'ResultFormat'))[0];
    // WFS 1.0 lists formats as empty elements, e.g. <GML2/>, <GeoJSON/>
    if (resultFormat) formats = [...resultFormat.children].map((c) => c.localName);
  }
  formats = [...new Set(formats.filter(Boolean))];
  return formats.length ? formats : undefined;
}
