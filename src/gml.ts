import type { Feature, FeatureCollection, Geometry } from './data';

/**
 * Minimal GML → GeoJSON reader for WFS GetFeature responses (GML 2, 3.1 and 3.2).
 * Handles points, lines, polygons (incl. Surface / Curve segments) and their Multi* forms.
 * Curved segments (arcs) are read as straight lines through their control points.
 */

type Position = number[];

const isGml = (el: Element) => (el.namespaceURI ?? '').startsWith('http://www.opengis.net/gml');

const GEOMETRY_TYPES = new Set([
  'Point', 'MultiPoint', 'LineString', 'Curve', 'CompositeCurve', 'MultiLineString', 'MultiCurve',
  'Polygon', 'Surface', 'CompositeSurface', 'MultiPolygon', 'MultiSurface', 'MultiGeometry', 'Envelope',
]);

const elementChildren = (el: Element) => [...el.children];

/** GML descendants with one of the given local names, in document order. */
function gmlDescendants(el: Element, names: string[]): Element[] {
  return [...el.getElementsByTagName('*')].filter((d) => isGml(d) && names.includes(d.localName));
}

/**
 * EPSG:4326 in URN / URI form means lat/lon axis order; "EPSG:4326" and CRS84 mean lon/lat.
 * Other CRSs are assumed x/y.
 */
export function isLatLonCrs(srsName: string | null | undefined): boolean {
  if (!srsName) return false;
  return /^urn:ogc:def:crs:EPSG:[\d.]*:4326$/i.test(srsName) || /opengis\.net\/def\/crs\/EPSG\/\d+\/4326$/i.test(srsName);
}

function parseNumbers(text: string | null): number[] {
  return (text ?? '').trim().split(/\s+/).filter(Boolean).map(Number);
}

/** Reads every coordinate held by pos / posList / coordinates / coord elements under `el`. */
function readPositions(el: Element, latLon: boolean): Position[] {
  const out: Position[] = [];
  const holders = [el, ...el.getElementsByTagName('*')].filter(
    (d) => isGml(d) && ['pos', 'posList', 'coordinates', 'coord', 'lowerCorner', 'upperCorner'].includes(d.localName),
  );
  for (const h of holders) {
    if (h.localName === 'coordinates') {
      // GML 2: "x,y x,y" with configurable separators
      const cs = h.getAttribute('cs') ?? ',';
      const ts = h.getAttribute('ts') ?? ' ';
      const dec = h.getAttribute('decimal') ?? '.';
      const tuples = (h.textContent ?? '').trim().split(ts === ' ' ? /\s+/ : ts).filter(Boolean);
      for (const t of tuples) out.push(t.split(cs).map((n) => Number(dec === '.' ? n : n.replace(dec, '.'))));
    } else if (h.localName === 'coord') {
      const v = (name: string) => elementChildren(h).find((c) => c.localName === name)?.textContent;
      out.push([Number(v('X')), Number(v('Y')), ...(v('Z') != null ? [Number(v('Z'))] : [])]);
    } else {
      const nums = parseNumbers(h.textContent);
      const dimAttr = h.getAttribute('srsDimension') ?? h.getAttribute('dimension') ?? h.closest('[srsDimension]')?.getAttribute('srsDimension');
      const dim = h.localName === 'posList' ? Number(dimAttr) || 2 : nums.length;
      for (let i = 0; i + dim <= nums.length; i += dim) out.push(nums.slice(i, i + dim));
    }
  }
  return latLon ? out.map(([a, b, ...rest]) => [b, a, ...rest]) : out;
}

function polygonRings(poly: Element, latLon: boolean): Position[][] {
  const rings = elementChildren(poly).filter((c) =>
    ['exterior', 'interior', 'outerBoundaryIs', 'innerBoundaryIs'].includes(c.localName),
  );
  // exterior first, whatever the document order
  rings.sort((a, b) => Number(/^(interior|innerBoundaryIs)$/.test(a.localName)) - Number(/^(interior|innerBoundaryIs)$/.test(b.localName)));
  return rings.map((r) => readPositions(r, latLon)).filter((r) => r.length >= 3);
}

function polygonsIn(el: Element, latLon: boolean): Position[][][] {
  const polys = el.localName === 'Polygon' || el.localName === 'PolygonPatch' ? [el] : gmlDescendants(el, ['Polygon', 'PolygonPatch']);
  return polys.map((p) => polygonRings(p, latLon)).filter((r) => r.length);
}

function linesIn(el: Element, latLon: boolean): Position[][] {
  // A Curve is one line even when split into several segments, so only take outermost ones.
  const all = gmlDescendants(el, ['LineString', 'Curve']);
  const outermost = all.filter((l) => !all.some((o) => o !== l && o.contains(l)));
  return outermost.map((l) => readPositions(l, latLon)).filter((l) => l.length >= 2);
}

function toGeometry(el: Element, srsName: string | null): Geometry | null {
  const srs = el.getAttribute('srsName') ?? srsName;
  const latLon = isLatLonCrs(srs);
  switch (el.localName) {
    case 'Point': {
      const [p] = readPositions(el, latLon);
      return p ? { type: 'Point', coordinates: p } : null;
    }
    case 'MultiPoint':
      return { type: 'MultiPoint', coordinates: gmlDescendants(el, ['Point']).flatMap((p) => readPositions(p, latLon).slice(0, 1)) };
    case 'LineString':
    case 'Curve':
    case 'CompositeCurve': {
      const coords = readPositions(el, latLon);
      return coords.length >= 2 ? { type: 'LineString', coordinates: coords } : null;
    }
    case 'MultiLineString':
    case 'MultiCurve':
      return { type: 'MultiLineString', coordinates: linesIn(el, latLon) };
    case 'Polygon': {
      const rings = polygonRings(el, latLon);
      return rings.length ? { type: 'Polygon', coordinates: rings } : null;
    }
    case 'Surface':
    case 'CompositeSurface':
    case 'MultiPolygon':
    case 'MultiSurface': {
      const polys = polygonsIn(el, latLon);
      if (!polys.length) return null;
      return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
    }
    case 'Envelope': {
      const [lo, hi] = readPositions(el, latLon);
      if (!lo || !hi) return null;
      return { type: 'Polygon', coordinates: [[[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]], [lo[0], lo[1]]]] };
    }
    case 'MultiGeometry': {
      const members = elementChildren(el)
        .flatMap(elementChildren) // geometryMember -> geometry; geometryMembers -> geometries
        .filter((g) => isGml(g) && GEOMETRY_TYPES.has(g.localName));
      return { type: 'GeometryCollection', geometries: members.map((g) => toGeometry(g, srs)).filter((g): g is Geometry => !!g) };
    }
  }
  return null;
}

function coerce(text: string): string | number | boolean {
  if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(text) && !/^-?0\d/.test(text)) return Number(text);
  if (text === 'true' || text === 'false') return text === 'true';
  return text;
}

function toFeature(el: Element, srsName: string | null): Feature {
  let geometry: Geometry | null = null;
  const properties: Record<string, unknown> = {};
  for (const child of elementChildren(el)) {
    if (isGml(child)) continue; // gml:boundedBy, gml:name, …
    const geomEl = elementChildren(child).find((g) => isGml(g) && GEOMETRY_TYPES.has(g.localName));
    if (geomEl) {
      if (!geometry) geometry = toGeometry(geomEl, srsName);
      continue;
    }
    const nil = child.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'nil') === 'true';
    const text = child.textContent?.trim() ?? '';
    properties[child.localName] = nil ? null : coerce(text);
  }
  const id = el.getAttributeNS('http://www.opengis.net/gml/3.2', 'id') ?? el.getAttributeNS('http://www.opengis.net/gml', 'id') ?? el.getAttribute('fid');
  return { type: 'Feature', geometry, properties, ...(id ? { id } : {}) };
}

/** Feature elements of a (possibly nested) WFS / GML FeatureCollection. */
function featureElements(collection: Element): Element[] {
  const out: Element[] = [];
  for (const child of elementChildren(collection)) {
    const name = child.localName;
    if (name === 'member' || name === 'featureMember' || name === 'featureMembers') {
      for (const f of elementChildren(child)) {
        // WFS 2.0 joins / additionalObjects wrap another collection
        if (f.localName === 'FeatureCollection' || f.localName === 'SimpleFeatureCollection') out.push(...featureElements(f));
        else if (f.localName === 'Tuple') out.push(...elementChildren(f).flatMap(elementChildren));
        else out.push(f);
      }
    } else if (name === 'additionalObjects') {
      out.push(...elementChildren(child).flatMap(featureElements));
    }
  }
  return out;
}

export function ogcExceptionText(doc: Document): string | undefined {
  const root = doc.documentElement;
  if (!/Exception/.test(root.localName)) return undefined;
  const texts = [...root.getElementsByTagName('*')]
    .filter((e) => e.localName === 'ExceptionText' || e.localName === 'ServiceException')
    .map((e) => e.textContent?.trim())
    .filter(Boolean);
  return texts.join(' — ') || root.textContent?.trim() || 'Unknown service exception';
}

/** Parses a WFS GetFeature GML response into lon/lat GeoJSON. Throws on OGC exception reports. */
export function parseGml(text: string): FeatureCollection {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Response is not valid XML');
  const exception = ogcExceptionText(doc);
  if (exception) throw new Error(`WFS error: ${exception}`);
  const root = doc.documentElement;
  if (!/FeatureCollection$/.test(root.localName)) {
    throw new Error(`Expected a WFS FeatureCollection, got <${root.localName}>`);
  }
  // Fallback CRS for geometries without their own srsName (usually set on the collection's boundedBy).
  const defaultSrs = root.querySelector('[srsName]')?.getAttribute('srsName') ?? null;
  return { type: 'FeatureCollection', features: featureElements(root).map((f) => toFeature(f, defaultSrs)) };
}
