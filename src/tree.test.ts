import { describe, expect, it } from 'vitest';
import { _computeBoundsForTests as computeBounds, _normaliseForTests as normalise } from './data';
import { moveNode, renderOrder, ROOT_END, ungroup } from './tree';
import type { GroupNode, LayerNode, TreeNode } from './types';

const layer = (id: string, visible = true): LayerNode => ({
  type: 'layer', id, name: id, visible, kind: 'scatterplot', url: '',
  style: { color: '#000000', opacity: 1, radius: 1, lineWidth: 1 },
});
const group = (id: string, children: TreeNode[], visible = true): GroupNode => ({
  type: 'group', id, name: id, visible, expanded: true, children,
});
const ids = (tree: TreeNode[]): unknown[] => tree.map((n) => (n.type === 'group' ? { [n.id]: ids(n.children) } : n.id));

describe('tree', () => {
  const tree = () => [layer('a'), group('g', [layer('b'), group('h', [layer('c')])]), layer('d')];

  it('reorders at the root', () => {
    expect(ids(moveNode(tree(), 'd', 'a', 'before'))).toEqual(['d', 'a', { g: ['b', { h: ['c'] }] }]);
  });

  it('moves a layer into a group and out again', () => {
    const inside = moveNode(tree(), 'a', 'h', 'inside');
    expect(ids(inside)).toEqual([{ g: ['b', { h: ['a', 'c'] }] }, 'd']);
    expect(ids(moveNode(inside, 'c', 'd', 'after'))).toEqual([{ g: ['b', { h: ['a'] }] }, 'd', 'c']);
  });

  it('moves to the root end', () => {
    expect(ids(moveNode(tree(), 'b', ROOT_END, 'after'))).toEqual(['a', { g: [{ h: ['c'] }] }, 'd', 'b']);
  });

  it('refuses to drop a group into itself or a descendant', () => {
    const t = tree();
    expect(moveNode(t, 'g', 'h', 'inside')).toBe(t);
    expect(moveNode(t, 'g', 'c', 'before')).toBe(t);
    expect(moveNode(t, 'g', 'g', 'inside')).toBe(t);
  });

  it('ungroups in place', () => {
    expect(ids(ungroup(tree(), 'g'))).toEqual(['a', 'b', { h: ['c'] }, 'd']);
  });

  it('renders bottom-first and respects hidden groups', () => {
    const t = [layer('a'), group('g', [layer('b'), layer('x', false)], true), group('off', [layer('c')], false), layer('d')];
    expect(renderOrder(t).map((l) => l.id)).toEqual(['d', 'b', 'a']);
  });
});

describe('normalise', () => {
  it('reads BART-style station objects as points', () => {
    const out = normalise('scatterplot', [{ name: 'X', coordinates: [-122.4, 37.7] }], false);
    expect(out).toEqual({ shape: 'points', data: [{ position: [-122.4, 37.7], properties: { name: 'X' } }] });
  });

  it('reads BART-style segments as arcs', () => {
    const out = normalise('arc', [{ from: { name: 'A', coordinates: [1, 2] }, to: { name: 'B', coordinates: [3, 4] }, inbound: 5 }], false);
    expect(out.shape).toBe('arcs');
    expect((out.data as unknown[])[0]).toEqual({ source: [1, 2], target: [3, 4], properties: { inbound: 5, from: 'A', to: 'B' } });
  });

  it('swaps WFS axis order when asked, and computes bounds', () => {
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[45, 2], [46, 3], [45, 3], [45, 2]]] } }] };
    const out = normalise('wfs', fc, true);
    expect(computeBounds(out)).toEqual([2, 45, 3, 46]);
  });

  it('rejects non-GeoJSON for a GeoJSON layer', () => {
    expect(() => normalise('geojson', [1, 2, 3], false)).toThrow(/GeoJSON/);
  });
});
