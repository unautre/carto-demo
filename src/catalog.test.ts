import { describe, expect, it } from 'vitest';
import { KINDS, normalizeLayerStyle, normalizeTree } from './catalog';
import type { GroupNode, LayerNode } from './types';

describe('normalizeLayerStyle', () => {
  const fallback = KINDS.scatterplot.style;

  it('keeps an already-current-shaped style untouched', () => {
    const style = { color: { mode: 'accessor' as const, value: '#fff', code: 'return "#fff";' }, opacity: { mode: 'constant' as const, value: 0.5, code: '' }, radius: fallback.radius, lineWidth: fallback.lineWidth };
    expect(normalizeLayerStyle(style, fallback)).toEqual(style);
  });

  it('upgrades a pre-accessor save (the field itself was the raw constant value)', () => {
    const old = { color: '#112233', opacity: 0.4, radius: 50, lineWidth: 3 };
    expect(normalizeLayerStyle(old, fallback)).toEqual({
      color: { mode: 'constant', value: '#112233', code: fallback.color.code },
      opacity: { mode: 'constant', value: 0.4, code: fallback.opacity.code },
      radius: { mode: 'constant', value: 50, code: fallback.radius.code },
      lineWidth: { mode: 'constant', value: 3, code: fallback.lineWidth.code },
    });
  });

  it('falls back field-by-field for a missing or corrupt style', () => {
    expect(normalizeLayerStyle(undefined, fallback)).toEqual(fallback);
    expect(normalizeLayerStyle({ color: '#123456' }, fallback)).toEqual({
      color: { mode: 'constant', value: '#123456', code: fallback.color.code },
      opacity: fallback.opacity,
      radius: fallback.radius,
      lineWidth: fallback.lineWidth,
    });
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

describe('normalizeTree', () => {
  const layer = (id: string, style: unknown): LayerNode =>
    ({ type: 'layer', id, name: id, visible: true, kind: 'scatterplot', url: '', style }) as unknown as LayerNode;
  const group = (id: string, children: LayerNode[]): GroupNode => ({ type: 'group', id, name: id, visible: true, expanded: true, children });

  it('upgrades every layer in the tree, including inside groups, and leaves groups otherwise untouched', () => {
    const tree = [layer('a', { color: '#fff', opacity: 1, radius: 1, lineWidth: 1 }), group('g', [layer('b', { color: '#000', opacity: 0.5, radius: 2, lineWidth: 2 })])];
    const result = normalizeTree(tree);
    const a = result[0] as LayerNode;
    expect(a.style.color).toEqual({ mode: 'constant', value: '#fff', code: KINDS.scatterplot.style.color.code });
    const g = result[1] as GroupNode;
    const b = g.children[0] as LayerNode;
    expect(b.style.opacity).toEqual({ mode: 'constant', value: 0.5, code: KINDS.scatterplot.style.opacity.code });
  });
});
