// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { LayerNode } from './types';

const fetchDuckDbRows = vi.fn();
vi.mock('./duckdb', () => ({
  fetchDuckDbRows: (...args: unknown[]) => fetchDuckDbRows(...args),
  duckdbQueryKey: (p: { query: string }) => `duckdb:${p.query}`,
}));

const { dataStore } = await import('./data');

const pv = <T,>(value: T): { mode: 'constant'; value: T; code: string } => ({ mode: 'constant', value, code: '' });
const ddLayer = (query: string, id = 'dd-1'): LayerNode => ({
  type: 'layer', id, name: 'DuckDB', visible: true, kind: 'duckdb', render: 'scatterplot', url: '',
  style: { color: pv('#ffc300'), opacity: pv(1), radius: pv(100), lineWidth: pv(2), lineColor: pv('#ffc300') },
  duckdb: { query },
});

describe('dataStore.load for a DuckDB layer', () => {
  it('runs the query via fetchDuckDbRows and normalises rows per the render kind', async () => {
    fetchDuckDbRows.mockResolvedValueOnce({ rows: 2, data: [{ lon: 2.35, lat: 48.85 }, { lon: -122.4, lat: 37.78 }] });

    const layer = ddLayer('SELECT lon, lat FROM cities');
    const state = await dataStore.load(layer);

    expect(state.status).toBe('ready');
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.loaded.shape).toBe('points');
    expect(state.count).toBe(2);
    expect(state.bounds).toEqual([-122.4, 37.78, 2.35, 48.85]);
  });

  it('reports a clear error when the query fails', async () => {
    fetchDuckDbRows.mockRejectedValueOnce(new Error('Binder Error: column "nope" not found'));
    const layer = ddLayer('SELECT nope FROM cities', 'dd-2');
    const state = await dataStore.load(layer);
    expect(state.status).toBe('error');
    if (state.status !== 'error') throw new Error('expected error');
    expect(state.error).toMatch(/not found/);
  });
});
