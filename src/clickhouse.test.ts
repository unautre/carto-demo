// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clickhouseQueryUrl, fetchClickHouseRows, interpolateQuery } from './clickhouse';
import { dataStore } from './data';
import type { ClickHouseParams, LayerNode } from './types';

const T = 1_700_000_000_000;
const CTX = { timestamp: T, timeRangeStart: T - 1000, timeRangeEnd: T + 1000, bboxWest: -10, bboxSouth: -5, bboxEast: 10, bboxNorth: 5 };

const pv = <T,>(value: T): { mode: 'constant'; value: T; code: string } => ({ mode: 'constant', value, code: '' });
const chLayer = (clickhouse: ClickHouseParams, url = 'http://localhost:8123'): LayerNode => ({
  type: 'layer', id: 'ch-1', name: 'ClickHouse', visible: true, kind: 'clickhouse', url,
  style: { color: pv('#ffc300'), opacity: pv(1), radius: pv(100), lineWidth: pv(2), lineColor: pv('#ffc300') },
  clickhouse,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('interpolateQuery', () => {
  it('replaces all three placeholders with epoch-ms numbers', () => {
    const sql = interpolateQuery('WHERE ts BETWEEN {{timeRangeStart}} AND {{timeRangeEnd}} AND now = {{timestamp}}', CTX);
    expect(sql).toBe(`WHERE ts BETWEEN ${CTX.timeRangeStart} AND ${CTX.timeRangeEnd} AND now = ${CTX.timestamp}`);
  });

  it('tolerates whitespace inside the braces and repeats', () => {
    expect(interpolateQuery('{{ timestamp }} {{timestamp}}', CTX)).toBe(`${CTX.timestamp} ${CTX.timestamp}`);
  });

  it('leaves a query with no placeholders untouched', () => {
    expect(interpolateQuery('SELECT 1', CTX)).toBe('SELECT 1');
  });

  it("doesn't collide with ClickHouse's own {name:Type} parameter syntax", () => {
    expect(interpolateQuery('SELECT {limit:UInt32} LIMIT {{timestamp}}', CTX)).toBe(`SELECT {limit:UInt32} LIMIT ${CTX.timestamp}`);
  });

  it('replaces the four bbox placeholders with the viewport extent', () => {
    const sql = interpolateQuery(
      'WHERE lon BETWEEN {{bboxWest}} AND {{bboxEast}} AND lat BETWEEN {{bboxSouth}} AND {{bboxNorth}}',
      CTX,
    );
    expect(sql).toBe(`WHERE lon BETWEEN ${CTX.bboxWest} AND ${CTX.bboxEast} AND lat BETWEEN ${CTX.bboxSouth} AND ${CTX.bboxNorth}`);
  });
});

describe('clickhouseQueryUrl', () => {
  it('appends FORMAT JSON and strips a trailing semicolon', () => {
    const url = clickhouseQueryUrl('http://localhost:8123', { query: 'SELECT 1;', render: 'scatterplot' });
    const q = new URL(url).searchParams.get('query');
    expect(q).toBe('SELECT 1\nFORMAT JSON');
  });

  it('includes the database when set', () => {
    const url = clickhouseQueryUrl('http://localhost:8123', { query: 'SELECT 1', database: 'geo', render: 'scatterplot' });
    expect(new URL(url).searchParams.get('database')).toBe('geo');
  });

  it('does not interpolate placeholders — it is the (stable) cache key, not what gets sent', () => {
    const url = clickhouseQueryUrl('http://localhost:8123', { query: 'SELECT {{timestamp}}', render: 'scatterplot' });
    expect(new URL(url).searchParams.get('query')).toBe('SELECT {{timestamp}}\nFORMAT JSON');
  });
});

describe('fetchClickHouseRows', () => {
  it('sends credentials as headers, not in the URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ meta: [], data: [], rows: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchClickHouseRows('http://localhost:8123', { query: 'SELECT 1', username: 'default', password: 'secret', render: 'scatterplot' }, CTX);

    const [requestUrl, init] = fetchMock.mock.calls[0];
    expect(String(requestUrl)).not.toContain('secret');
    expect(init?.headers).toMatchObject({ 'X-ClickHouse-User': 'default', 'X-ClickHouse-Key': 'secret' });
  });

  it('interpolates {{timestamp}} etc. in the query it actually sends', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ meta: [], data: [], rows: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchClickHouseRows('http://localhost:8123', { query: 'SELECT * WHERE ts <= {{timestamp}}', render: 'scatterplot' }, CTX);

    const [requestUrl] = fetchMock.mock.calls[0];
    expect(new URL(String(requestUrl)).searchParams.get('query')).toBe(`SELECT * WHERE ts <= ${CTX.timestamp}\nFORMAT JSON`);
  });

  it('turns a non-2xx response into a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Code: 60. DB::Exception: Table default.nope doesn\'t exist', { status: 404 })));
    await expect(fetchClickHouseRows('http://localhost:8123', { query: 'SELECT 1', render: 'scatterplot' }, CTX))
      .rejects.toThrow(/404.*nope doesn't exist/s);
  });
});

describe('dataStore.load for a ClickHouse layer', () => {
  it('fetches, normalises rows per the render kind, and computes bounds', async () => {
    const rows = [
      { lon: 2.35, lat: 48.85, city: 'Paris' },
      { lon: -122.4, lat: 37.78, city: 'San Francisco' },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ meta: [{ name: 'lon', type: 'Float64' }], data: rows, rows: 2 }), { status: 200 })));

    const layer = chLayer({ query: 'SELECT lon, lat, city FROM cities', render: 'scatterplot' });
    const state = await dataStore.load(layer);

    expect(state.status).toBe('ready');
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.loaded.shape).toBe('points');
    expect(state.count).toBe(2);
    expect(state.loaded.shape === 'points' && state.loaded.data[0]).toEqual({
      position: [2.35, 48.85],
      properties: { lon: 2.35, lat: 48.85, city: 'Paris' },
    });
    expect(state.bounds).toEqual([-122.4, 37.78, 2.35, 48.85]);
  });

  it('reports a clear error when the query fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Code: 47. DB::Exception: Unknown column', { status: 400 })));
    const layer = chLayer({ query: 'SELECT nope FROM cities', render: 'scatterplot' }, 'http://localhost:8123/err');
    const state = await dataStore.load(layer);
    expect(state.status).toBe('error');
    if (state.status !== 'error') throw new Error('expected error');
    expect(state.error).toMatch(/Unknown column/);
  });

  it('sends the query with {{timestamp}} resolved from the given ctx', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ meta: [], data: [], rows: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const layer = chLayer({ query: 'SELECT lon, lat FROM events WHERE ts <= {{timestamp}}', render: 'scatterplot' }, 'http://localhost:8123/ts');

    await dataStore.load(layer, CTX);

    const [requestUrl] = fetchMock.mock.calls[0];
    expect(new URL(String(requestUrl)).searchParams.get('query')).toContain(String(CTX.timestamp));
  });
});
