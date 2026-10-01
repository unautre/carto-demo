// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clickhouseQueryUrl, fetchClickHouseRows } from './clickhouse';
import { dataStore } from './data';
import type { ClickHouseParams, LayerNode } from './types';

const chLayer = (clickhouse: ClickHouseParams, url = 'http://localhost:8123'): LayerNode => ({
  type: 'layer', id: 'ch-1', name: 'ClickHouse', visible: true, kind: 'clickhouse', url,
  style: { color: '#ffc300', opacity: 1, radius: 100, lineWidth: 2 },
  clickhouse,
});

afterEach(() => {
  vi.unstubAllGlobals();
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
});

describe('fetchClickHouseRows', () => {
  it('sends credentials as headers, not in the URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ meta: [], data: [], rows: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchClickHouseRows('http://localhost:8123', { query: 'SELECT 1', username: 'default', password: 'secret', render: 'scatterplot' });

    const [requestUrl, init] = fetchMock.mock.calls[0];
    expect(String(requestUrl)).not.toContain('secret');
    expect(init?.headers).toMatchObject({ 'X-ClickHouse-User': 'default', 'X-ClickHouse-Key': 'secret' });
  });

  it('turns a non-2xx response into a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Code: 60. DB::Exception: Table default.nope doesn\'t exist', { status: 404 })));
    await expect(fetchClickHouseRows('http://localhost:8123', { query: 'SELECT 1', render: 'scatterplot' }))
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
});
