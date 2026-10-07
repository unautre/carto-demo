import { describe, expect, it } from 'vitest';
import { normalizeLayerSource, normalizeLayerStyle, normalizeTree, RENDER_KINDS } from './catalog';
import type { GroupNode, LayerNode } from './types';

describe('normalizeLayerStyle', () => {
  const fallback = RENDER_KINDS.scatterplot.style;

  it('keeps an already-current-shaped style untouched', () => {
    const style = {
      color: { mode: 'accessor' as const, value: '#fff', code: 'return "#fff";' },
      opacity: { mode: 'constant' as const, value: 0.5, code: '' },
      radius: fallback.radius,
      lineWidth: fallback.lineWidth,
      lineColor: fallback.lineColor,
    };
    expect(normalizeLayerStyle(style, fallback)).toEqual(style);
  });

  it('upgrades a pre-accessor save (the field itself was the raw constant value)', () => {
    const old = { color: '#112233', opacity: 0.4, radius: 50, lineWidth: 3, lineColor: '#654321' };
    expect(normalizeLayerStyle(old, fallback)).toEqual({
      color: { mode: 'constant', value: '#112233', code: fallback.color.code },
      opacity: { mode: 'constant', value: 0.4, code: fallback.opacity.code },
      radius: { mode: 'constant', value: 50, code: fallback.radius.code },
      lineWidth: { mode: 'constant', value: 3, code: fallback.lineWidth.code },
      lineColor: { mode: 'constant', value: '#654321', code: fallback.lineColor.code },
    });
  });

  it('falls back field-by-field for a missing or corrupt style', () => {
    expect(normalizeLayerStyle(undefined, fallback)).toEqual(fallback);
    expect(normalizeLayerStyle({ color: '#123456' }, fallback)).toEqual({
      color: { mode: 'constant', value: '#123456', code: fallback.color.code },
      opacity: fallback.opacity,
      radius: fallback.radius,
      lineWidth: fallback.lineWidth,
      lineColor: fallback.lineColor,
    });
  });

  it('falls back to the default lineColor for a pre-lineColor save (the field predates this option)', () => {
    const old = { color: '#112233', opacity: 0.4, radius: 50, lineWidth: 3 };
    expect(normalizeLayerStyle(old, fallback).lineColor).toEqual(fallback.lineColor);
  });

  it('falls back to the default value when a value has the wrong type, but keeps a valid mode/code', () => {
    const corrupt = { opacity: { mode: 'accessor', value: 'not-a-number', code: 'return 1;' } };
    expect(normalizeLayerStyle(corrupt, fallback).opacity).toEqual({ mode: 'accessor', value: fallback.opacity.value, code: 'return 1;' });
  });

  it('treats an unknown mode string as constant', () => {
    const corrupt = { radius: { mode: 'bogus', value: 99, code: '' } };
    expect(normalizeLayerStyle(corrupt, fallback).radius).toEqual({ mode: 'constant', value: 99, code: '' });
  });
});

describe('normalizeLayerSource', () => {
  it('upgrades a pre-split deck.gl kind (kind WAS the render kind) to {kind: url, render}', () => {
    for (const k of ['scatterplot', 'geojson', 'path', 'arc', 'hexagon', 'heatmap'] as const) {
      expect(normalizeLayerSource({ kind: k })).toEqual({ kind: 'url', render: k });
    }
  });

  it('lifts a pre-split ClickHouse render out of the nested clickhouse object', () => {
    const raw = { kind: 'clickhouse', clickhouse: { query: 'SELECT 1', database: 'default', render: 'path' } };
    expect(normalizeLayerSource(raw)).toEqual({
      kind: 'clickhouse',
      render: 'path',
      clickhouse: { query: 'SELECT 1', database: 'default', username: undefined, password: undefined },
    });
  });

  it('keeps an already-current ClickHouse layer (top-level render, no nested render) untouched', () => {
    const raw = { kind: 'clickhouse', render: 'hexagon', clickhouse: { query: 'SELECT 1' } };
    expect(normalizeLayerSource(raw)).toEqual({ kind: 'clickhouse', render: 'hexagon', clickhouse: { query: 'SELECT 1', database: undefined, username: undefined, password: undefined } });
  });

  it('falls back to scatterplot for a ClickHouse layer with no valid render anywhere', () => {
    expect(normalizeLayerSource({ kind: 'clickhouse', clickhouse: { query: 'SELECT 1' } }).render).toBe('scatterplot');
  });

  it('drops a corrupt clickhouse object (no query) rather than keep a half-formed one', () => {
    expect(normalizeLayerSource({ kind: 'clickhouse', clickhouse: { database: 'x' } }).clickhouse).toBeUndefined();
  });

  it('keeps an already-current DuckDB layer', () => {
    const raw = { kind: 'duckdb', render: 'hexagon', duckdb: { query: 'SELECT 1' } };
    expect(normalizeLayerSource(raw)).toEqual({ kind: 'duckdb', render: 'hexagon', duckdb: { query: 'SELECT 1' } });
  });

  it('falls back to scatterplot for a DuckDB layer with no valid render', () => {
    expect(normalizeLayerSource({ kind: 'duckdb', duckdb: { query: 'SELECT 1' } }).render).toBe('scatterplot');
  });

  it('drops a corrupt duckdb object (no query) rather than keep a half-formed one', () => {
    expect(normalizeLayerSource({ kind: 'duckdb', duckdb: { notAQuery: 'x' } }).duckdb).toBeUndefined();
  });

  it("defaults a pre-split WFS layer (no render choice existed) to 'geojson'", () => {
    expect(normalizeLayerSource({ kind: 'wfs' })).toEqual({ kind: 'wfs', render: 'geojson' });
  });

  it('keeps an explicit WFS render if one was already saved', () => {
    expect(normalizeLayerSource({ kind: 'wfs', render: 'hexagon' })).toEqual({ kind: 'wfs', render: 'hexagon' });
  });

  it('gives WMS no render at all', () => {
    expect(normalizeLayerSource({ kind: 'wms', render: 'scatterplot' })).toEqual({ kind: 'wms', render: undefined });
  });

  it('falls back to {kind: url, render: scatterplot} for missing/unrecognised input', () => {
    expect(normalizeLayerSource(undefined)).toEqual({ kind: 'url', render: 'scatterplot' });
    expect(normalizeLayerSource({ kind: 'bogus' })).toEqual({ kind: 'url', render: 'scatterplot' });
  });

  it('keeps an already-current url layer\'s render', () => {
    expect(normalizeLayerSource({ kind: 'url', render: 'arc' })).toEqual({ kind: 'url', render: 'arc' });
  });
});

describe('normalizeTree', () => {
  const layer = (id: string, extra: Record<string, unknown>): LayerNode => ({ type: 'layer', id, name: id, visible: true, url: '', ...extra }) as unknown as LayerNode;
  const group = (id: string, children: LayerNode[]): GroupNode => ({ type: 'group', id, name: id, visible: true, expanded: true, children });

  it('upgrades every layer in the tree (source shape and style), including inside groups, and leaves groups otherwise untouched', () => {
    const tree = [
      layer('a', { kind: 'scatterplot', style: { color: '#fff', opacity: 1, radius: 1, lineWidth: 1 } }),
      group('g', [layer('b', { kind: 'clickhouse', clickhouse: { query: 'SELECT 1', render: 'path' }, style: { color: '#000', opacity: 0.5, radius: 2, lineWidth: 2 } })]),
    ];
    const result = normalizeTree(tree);

    const a = result[0] as LayerNode;
    expect(a.kind).toBe('url');
    expect(a.render).toBe('scatterplot');
    expect(a.style.color).toEqual({ mode: 'constant', value: '#fff', code: RENDER_KINDS.scatterplot.style.color.code });

    const g = result[1] as GroupNode;
    const b = g.children[0] as LayerNode;
    expect(b.kind).toBe('clickhouse');
    expect(b.render).toBe('path');
    expect(b.clickhouse).toEqual({ query: 'SELECT 1', database: undefined, username: undefined, password: undefined });
    // The raw style value (2) is kept, but the fallback `code` for a legacy constant-only field now
    // comes from the *render* kind (path), not from whatever the old flat KINDS.clickhouse entry
    // used to default to.
    expect(b.style.lineWidth).toEqual({ mode: 'constant', value: 2, code: RENDER_KINDS.path.style.lineWidth.code });
  });
});
