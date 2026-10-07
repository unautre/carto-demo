// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { _computeBoundsForTests as computeBounds, _normaliseForTests as normalise } from '../data';
import { parseGml } from './gml';
import { parseWfsOutputFormats, wfsGetFeatureUrl } from './ogc';

const WFS2_GML32 = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2"
  xmlns:app="http://example.com/app" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" numberMatched="2" numberReturned="2">
  <wfs:member>
    <app:region gml:id="region.1">
      <gml:boundedBy><gml:Envelope srsName="urn:ogc:def:crs:EPSG::4326"><gml:lowerCorner>45 2</gml:lowerCorner><gml:upperCorner>46 3</gml:upperCorner></gml:Envelope></gml:boundedBy>
      <app:nom>Auvergne</app:nom>
      <app:code>084</app:code>
      <app:population>8000000</app:population>
      <app:note xsi:nil="true"/>
      <app:geom>
        <gml:MultiSurface srsName="urn:ogc:def:crs:EPSG::4326" srsDimension="2">
          <gml:surfaceMember><gml:Polygon>
            <gml:exterior><gml:LinearRing><gml:posList>45 2 46 3 45 3 45 2</gml:posList></gml:LinearRing></gml:exterior>
          </gml:Polygon></gml:surfaceMember>
          <gml:surfaceMember><gml:Polygon>
            <gml:exterior><gml:LinearRing><gml:posList>40 10 41 10 41 11 40 10</gml:posList></gml:LinearRing></gml:exterior>
          </gml:Polygon></gml:surfaceMember>
        </gml:MultiSurface>
      </app:geom>
    </app:region>
  </wfs:member>
  <wfs:member>
    <app:region gml:id="region.2">
      <app:nom>Point town</app:nom>
      <app:geom><gml:Point srsName="http://www.opengis.net/def/crs/EPSG/0/4326"><gml:pos>48.85 2.35</gml:pos></gml:Point></app:geom>
    </app:region>
  </wfs:member>
</wfs:FeatureCollection>`;

const WFS1_GML2 = `<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" xmlns:gml="http://www.opengis.net/gml" xmlns:topp="http://www.openplans.org/topp">
  <gml:featureMember>
    <topp:roads fid="roads.7">
      <topp:the_geom><gml:MultiLineString srsName="EPSG:4326">
        <gml:lineStringMember><gml:LineString><gml:coordinates decimal="." cs="," ts=" ">-103.8,44.3 -103.7,44.4</gml:coordinates></gml:LineString></gml:lineStringMember>
      </gml:MultiLineString></topp:the_geom>
      <topp:type>road</topp:type>
    </topp:roads>
  </gml:featureMember>
</wfs:FeatureCollection>`;

describe('GML parsing', () => {
  it('reads WFS 2.0 / GML 3.2, flipping lat/lon URN axis order to lon/lat', () => {
    const fc = parseGml(WFS2_GML32);
    expect(fc.features).toHaveLength(2);
    const [a, b] = fc.features;
    expect(a.id).toBe('region.1');
    expect(a.properties).toEqual({ nom: 'Auvergne', code: '084', population: 8000000, note: null });
    expect(a.geometry).toEqual({
      type: 'MultiPolygon',
      coordinates: [[[[2, 45], [3, 46], [3, 45], [2, 45]]], [[[10, 40], [10, 41], [11, 41], [10, 40]]]],
    });
    expect(b.geometry).toEqual({ type: 'Point', coordinates: [2.35, 48.85] });
    expect(computeBounds(normalise('geojson', fc, false))).toEqual([2, 40, 11, 48.85]);
  });

  it('reads WFS 1.0 / GML 2 coordinates as lon/lat', () => {
    const fc = parseGml(WFS1_GML2);
    expect(fc.features[0]).toEqual({
      type: 'Feature',
      id: 'roads.7',
      properties: { type: 'road' },
      geometry: { type: 'MultiLineString', coordinates: [[[-103.8, 44.3], [-103.7, 44.4]]] },
    });
  });

  it('reads GML 3.1 Surface patches, holes and 3D posLists', () => {
    const fc = parseGml(`<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" xmlns:gml="http://www.opengis.net/gml" xmlns:x="urn:x">
      <gml:featureMembers><x:lake>
        <x:shape><gml:Surface srsName="EPSG:4326"><gml:patches><gml:PolygonPatch>
          <gml:interior><gml:LinearRing><gml:posList srsDimension="3">1 1 0 2 1 0 2 2 0 1 1 0</gml:posList></gml:LinearRing></gml:interior>
          <gml:exterior><gml:LinearRing><gml:posList srsDimension="3">0 0 5 9 0 5 9 9 5 0 0 5</gml:posList></gml:LinearRing></gml:exterior>
        </gml:PolygonPatch></gml:patches></gml:Surface></x:shape>
      </x:lake></gml:featureMembers>
    </wfs:FeatureCollection>`);
    expect(fc.features[0].geometry).toEqual({
      type: 'Polygon',
      coordinates: [
        [[0, 0, 5], [9, 0, 5], [9, 9, 5], [0, 0, 5]],
        [[1, 1, 0], [2, 1, 0], [2, 2, 0], [1, 1, 0]],
      ],
    });
  });

  it('turns an OGC exception report into a readable error', () => {
    const xml = `<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1"><ows:Exception exceptionCode="InvalidParameterValue">
      <ows:ExceptionText>Unknown type name foo:bar</ows:ExceptionText></ows:Exception></ows:ExceptionReport>`;
    expect(() => parseGml(xml)).toThrow('WFS error: Unknown type name foo:bar');
  });
});

describe('WFS output formats', () => {
  const caps = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml').documentElement;

  it('reads GetFeature formats from WFS 2.0 capabilities', () => {
    const root = caps(`<wfs:WFS_Capabilities xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:ows="http://www.opengis.net/ows/1.1" version="2.0.0">
      <ows:OperationsMetadata><ows:Operation name="GetFeature">
        <ows:Parameter name="outputFormat"><ows:AllowedValues>
          <ows:Value>application/gml+xml; version=3.2</ows:Value><ows:Value>text/xml; subtype=gml/3.2</ows:Value>
        </ows:AllowedValues></ows:Parameter>
      </ows:Operation></ows:OperationsMetadata></wfs:WFS_Capabilities>`);
    expect(parseWfsOutputFormats(root)).toEqual(['application/gml+xml; version=3.2', 'text/xml; subtype=gml/3.2']);
  });

  it('reads WFS 1.0 ResultFormat', () => {
    const root = caps(`<WFS_Capabilities xmlns="http://www.opengis.net/wfs" version="1.0.0"><Capability><Request>
      <GetFeature><ResultFormat><GML2/></ResultFormat></GetFeature></Request></Capability></WFS_Capabilities>`);
    expect(parseWfsOutputFormats(root)).toEqual(['GML2']);
  });

  it('omits OUTPUTFORMAT for the server default, and keeps JSON for older saved layers', () => {
    const base = { typeName: 'a:b', version: '2.0.0' as const, maxFeatures: 10, swapXY: false };
    expect(wfsGetFeatureUrl('https://x.test/wfs', { ...base, outputFormat: '' })).not.toMatch(/OUTPUTFORMAT/i);
    expect(new URL(wfsGetFeatureUrl('https://x.test/wfs', base)).searchParams.get('OUTPUTFORMAT')).toBe('application/json');
  });
});
