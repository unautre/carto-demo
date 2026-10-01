import { describe, expect, it } from 'vitest';
import { compileFilterValue, computeFilterRange, dataFilterExtensionProps } from './layerExtensions';
import type { LoadedData } from './data';

const T = 1_700_000_000_000;

describe('compileFilterValue', () => {
  it('runs an explicit `return` statement', () => {
    const { fn, error } = compileFilterValue('return properties.magnitude * 2;');
    expect(error).toBeUndefined();
    expect(fn({ properties: { magnitude: 3 } }, T)).toBe(6);
  });

  it('treats a bare expression as the return value', () => {
    const { fn, error } = compileFilterValue('properties.magnitude ?? 0');
    expect(error).toBeUndefined();
    expect(fn({ properties: { magnitude: 5 } }, T)).toBe(5);
    expect(fn({ properties: {} }, T)).toBe(0);
  });

  it('exposes `timestamp` to the code', () => {
    const { fn } = compileFilterValue('return timestamp;');
    expect(fn({ properties: {} }, T)).toBe(T);
    expect(fn({ properties: {} }, T + 1000)).toBe(T + 1000);
  });

  it('reports a compile error and falls back to 0', () => {
    const { fn, error } = compileFilterValue('return properties.(;');
    expect(error).toBeTruthy();
    expect(fn({ properties: {} }, T)).toBe(0);
  });

  it('falls back to 0 on a runtime error instead of throwing', () => {
    const { fn, error } = compileFilterValue('return properties.missing.value;');
    expect(error).toBeUndefined();
    expect(fn({ properties: {} }, T)).toBe(0);
  });

  it('falls back to 0 when the result is not a finite number', () => {
    const { fn } = compileFilterValue('return "not a number";');
    expect(fn({ properties: {} }, T)).toBe(0);
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
    expect(computeFilterRange(loaded, fn, T)).toEqual([-2, 7]);
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
    expect(computeFilterRange(loaded, fn, T)).toEqual([1, 10]);
  });

  it('returns undefined for an empty dataset', () => {
    const loaded: LoadedData = { shape: 'points', data: [] };
    const { fn } = compileFilterValue('return 1;');
    expect(computeFilterRange(loaded, fn, T)).toBeUndefined();
  });

  it('passes the given timestamp through to the filter function', () => {
    const loaded: LoadedData = { shape: 'points', data: [{ position: [0, 0], properties: {} }] };
    const { fn } = compileFilterValue('return timestamp;');
    expect(computeFilterRange(loaded, fn, T)).toEqual([T, T]);
  });
});

describe('dataFilterExtensionProps', () => {
  it('always attaches the extension, with filterEnabled off and no accessor when disabled or absent', () => {
    // deck.gl only wires an extension's GPU attribute up when a layer is first created, so the
    // extension must be present even when the filter starts out off, or later enabling it (a
    // props update on the same layer id, not a fresh layer) would silently do nothing.
    const ctx = { timestamp: T };
    for (const props of [dataFilterExtensionProps(undefined, ctx), dataFilterExtensionProps({ enabled: false, getFilterValue: 'return 1;', filterRange: [0, 1] }, ctx)]) {
      expect(props.extensions).toHaveLength(1);
      expect(props.filterEnabled).toBe(false);
      expect(props.getFilterValue).toBeUndefined();
    }
  });

  it('shares one extension instance across calls (layers)', () => {
    const ctx = { timestamp: T };
    expect(dataFilterExtensionProps(undefined, ctx).extensions).toBe(dataFilterExtensionProps(undefined, ctx).extensions);
  });

  it('wires up filterEnabled, getFilterValue and filterRange when enabled', () => {
    const props = dataFilterExtensionProps({ enabled: true, getFilterValue: 'return properties.v;', filterRange: [0, 10] }, { timestamp: T });
    expect(props.extensions).toHaveLength(1);
    expect(props.filterEnabled).toBe(true);
    expect(props.filterRange).toEqual([0, 10]);
    expect(props.getFilterValue?.({ properties: { v: 42 } })).toBe(42);
  });

  it("binds the context's timestamp into the accessor", () => {
    const props = dataFilterExtensionProps({ enabled: true, getFilterValue: 'return timestamp;', filterRange: [0, Infinity] }, { timestamp: T });
    expect(props.getFilterValue?.({ properties: {} })).toBe(T);
  });

  it('sets updateTriggers.getFilterValue so a changed code/timestamp/enabled is actually picked up', () => {
    // deck.gl's generic attribute system only recomputes an accessor-driven GPU attribute when
    // something in updateTriggers changes for it — a fresh getFilterValue *function reference*
    // on every render (which this module always produces, since it closes over ctx.timestamp) is
    // not by itself treated as "needs recompute". Confirmed by instrumenting the real accessor in
    // the browser: without updateTriggers, it was never invoked again after the layer's first
    // draw, no matter how often the code, range, or timestamp changed afterwards.
    const base = dataFilterExtensionProps({ enabled: true, getFilterValue: 'return 1;', filterRange: [0, 1] }, { timestamp: T });
    expect(base.updateTriggers.getFilterValue).toBeDefined();

    const changedCode = dataFilterExtensionProps({ enabled: true, getFilterValue: 'return 2;', filterRange: [0, 1] }, { timestamp: T });
    const changedTimestamp = dataFilterExtensionProps({ enabled: true, getFilterValue: 'return 1;', filterRange: [0, 1] }, { timestamp: T + 1 });
    const disabled = dataFilterExtensionProps({ enabled: false, getFilterValue: 'return 1;', filterRange: [0, 1] }, { timestamp: T });

    expect(changedCode.updateTriggers.getFilterValue).not.toEqual(base.updateTriggers.getFilterValue);
    expect(changedTimestamp.updateTriggers.getFilterValue).not.toEqual(base.updateTriggers.getFilterValue);
    expect(disabled.updateTriggers.getFilterValue).not.toEqual(base.updateTriggers.getFilterValue);
  });
});
