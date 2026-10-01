import { describe, expect, it } from 'vitest';
import { compileFilterValue, computeFilterRange, dataFilterExtensionProps } from './layerExtensions';
import type { LoadedData } from './data';

describe('compileFilterValue', () => {
  it('runs an explicit `return` statement', () => {
    const { fn, error } = compileFilterValue('return properties.magnitude * 2;');
    expect(error).toBeUndefined();
    expect(fn({ properties: { magnitude: 3 } })).toBe(6);
  });

  it('treats a bare expression as the return value', () => {
    const { fn, error } = compileFilterValue('properties.magnitude ?? 0');
    expect(error).toBeUndefined();
    expect(fn({ properties: { magnitude: 5 } })).toBe(5);
    expect(fn({ properties: {} })).toBe(0);
  });

  it('reports a compile error and falls back to 0', () => {
    const { fn, error } = compileFilterValue('return properties.(;');
    expect(error).toBeTruthy();
    expect(fn({ properties: {} })).toBe(0);
  });

  it('falls back to 0 on a runtime error instead of throwing', () => {
    const { fn, error } = compileFilterValue('return properties.missing.value;');
    expect(error).toBeUndefined();
    expect(fn({ properties: {} })).toBe(0);
  });

  it('falls back to 0 when the result is not a finite number', () => {
    const { fn } = compileFilterValue('return "not a number";');
    expect(fn({ properties: {} })).toBe(0);
  });

  it('caches by code string', () => {
    const a = compileFilterValue('return 1;');
    const b = compileFilterValue('return 1;');
    expect(a).toBe(b);
  });
});

describe('computeFilterRange', () => {
  it('scans point rows for the min/max filter value', () => {
    const loaded: LoadedData = {
      shape: 'points',
      data: [
        { position: [0, 0], properties: { v: 3 } },
        { position: [1, 1], properties: { v: -2 } },
        { position: [2, 2], properties: { v: 7 } },
      ],
    };
    const { fn } = compileFilterValue('return properties.v;');
    expect(computeFilterRange(loaded, fn)).toEqual([-2, 7]);
  });

  it('scans GeoJSON feature properties', () => {
    const loaded: LoadedData = {
      shape: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: null, properties: { v: 10 } },
          { type: 'Feature', geometry: null, properties: { v: 1 } },
        ],
      },
    };
    const { fn } = compileFilterValue('return properties.v;');
    expect(computeFilterRange(loaded, fn)).toEqual([1, 10]);
  });

  it('returns undefined for an empty dataset', () => {
    const loaded: LoadedData = { shape: 'points', data: [] };
    const { fn } = compileFilterValue('return 1;');
    expect(computeFilterRange(loaded, fn)).toBeUndefined();
  });
});

describe('dataFilterExtensionProps', () => {
  it('always attaches the extension, with filterEnabled off and no accessor when disabled or absent', () => {
    // deck.gl only wires an extension's GPU attribute up when a layer is first created, so the
    // extension must be present even when the filter starts out off, or later enabling it (a
    // props update on the same layer id, not a fresh layer) would silently do nothing.
    for (const props of [dataFilterExtensionProps(undefined), dataFilterExtensionProps({ enabled: false, getFilterValue: 'return 1;', filterRange: [0, 1] })]) {
      expect(props.extensions).toHaveLength(1);
      expect(props.filterEnabled).toBe(false);
      expect(props.getFilterValue).toBeUndefined();
    }
  });

  it('shares one extension instance across calls (layers)', () => {
    expect(dataFilterExtensionProps(undefined).extensions).toBe(dataFilterExtensionProps(undefined).extensions);
  });

  it('wires up filterEnabled, getFilterValue and filterRange when enabled', () => {
    const props = dataFilterExtensionProps({ enabled: true, getFilterValue: 'return properties.v;', filterRange: [0, 10] });
    expect(props.extensions).toHaveLength(1);
    expect(props.filterEnabled).toBe(true);
    expect(props.filterRange).toEqual([0, 10]);
    expect(props.getFilterValue?.({ properties: { v: 42 } })).toBe(42);
  });
});
