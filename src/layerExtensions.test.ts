import { describe, expect, it } from 'vitest';
import { compileFilterValue, computeFilterRange, dataFilterExtensionProps, resolveFilterRange } from './layerExtensions';
import type { LoadedData } from './data';
import type { DataFilterConfig } from './types';

const T = 1_700_000_000_000;

/** Fills in mode/delay so test cases only need to spell out what they care about. */
const manual = (patch: Partial<DataFilterConfig>): DataFilterConfig => ({
  enabled: true,
  getFilterValue: 'return 1;',
  mode: 'manual',
  filterRange: [0, 1],
  delay: { value: 1000, unit: 'ms' },
  fadeOpacity: false,
  ...patch,
});

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

describe('resolveFilterRange', () => {
  it('returns filterRange as-is in manual mode', () => {
    expect(resolveFilterRange(manual({ filterRange: [5, 9] }), { timestamp: T })).toEqual([5, 9]);
  });

  it('computes [timestamp - delay, timestamp] in timeline mode', () => {
    const config = manual({ mode: 'timeline', delay: { value: 60_000, unit: 'ms' } });
    expect(resolveFilterRange(config, { timestamp: T })).toEqual([T - 60_000, T]);
  });

  it('converts non-ms delay units to ms', () => {
    const config = manual({ mode: 'timeline', delay: { value: 2, unit: 'minutes' } });
    expect(resolveFilterRange(config, { timestamp: T })).toEqual([T - 120_000, T]);
  });
});

describe('dataFilterExtensionProps', () => {
  it('always attaches the extension, with filterEnabled off and no accessor when disabled or absent', () => {
    // deck.gl only wires an extension's GPU attribute up when a layer is first created, so the
    // extension must be present even when the filter starts out off, or later enabling it (a
    // props update on the same layer id, not a fresh layer) would silently do nothing.
    const ctx = { timestamp: T };
    for (const props of [dataFilterExtensionProps(undefined, ctx), dataFilterExtensionProps(manual({ enabled: false }), ctx)]) {
      expect(props.extensions).toHaveLength(2);
      expect(props.filterEnabled).toBe(false);
      expect(props.getFilterValue).toBeUndefined();
      expect(props.fadeFilterEnabled).toBe(false);
    }
  });

  it('shares one extension instance across calls (layers)', () => {
    const ctx = { timestamp: T };
    expect(dataFilterExtensionProps(undefined, ctx).extensions).toBe(dataFilterExtensionProps(undefined, ctx).extensions);
  });

  it('wires up filterEnabled, getFilterValue and filterRange when enabled (manual mode)', () => {
    const props = dataFilterExtensionProps(manual({ getFilterValue: 'return properties.v;', filterRange: [0, 10] }), { timestamp: T });
    expect(props.extensions).toHaveLength(2);
    expect(props.filterEnabled).toBe(true);
    expect(props.filterRange).toEqual([0, 10]);
    expect(props.getFilterValue?.({ properties: { v: 42 } })).toBe(42);
  });

  it('derives filterRange from timestamp - delay in timeline mode', () => {
    const props = dataFilterExtensionProps(manual({ mode: 'timeline', delay: { value: 5000, unit: 'ms' } }), { timestamp: T });
    expect(props.filterRange).toEqual([T - 5000, T]);
  });

  it('sets updateTriggers.getFilterValue so a changed code/range/enabled is actually picked up', () => {
    // deck.gl's generic attribute system only recomputes an accessor-driven GPU attribute when
    // something in updateTriggers changes for it. Confirmed by instrumenting the real accessor in
    // the browser: without updateTriggers, it was never invoked again after the layer's first
    // draw, no matter how often the code or range changed afterwards.
    const ctx = { timestamp: T };
    const base = dataFilterExtensionProps(manual({}), ctx);
    expect(base.updateTriggers.getFilterValue).toBeDefined();

    const changedCode = dataFilterExtensionProps(manual({ getFilterValue: 'return 2;' }), ctx);
    const changedRange = dataFilterExtensionProps(manual({ filterRange: [0, 2] }), ctx);
    const disabled = dataFilterExtensionProps(manual({ enabled: false }), ctx);
    const timelineMode = dataFilterExtensionProps(manual({ mode: 'timeline', delay: { value: 1000, unit: 'ms' } }), { timestamp: T + 1 });

    expect(changedCode.updateTriggers.getFilterValue).not.toEqual(base.updateTriggers.getFilterValue);
    expect(changedRange.updateTriggers.getFilterValue).not.toEqual(base.updateTriggers.getFilterValue);
    expect(disabled.updateTriggers.getFilterValue).not.toEqual(base.updateTriggers.getFilterValue);
    // A timestamp change in timeline mode changes the *resolved* filterRange, which is what's keyed on.
    expect(timelineMode.updateTriggers.getFilterValue).not.toEqual(base.updateTriggers.getFilterValue);
  });

  describe('fade (FilterFadeExtension) props', () => {
    const ctx = { timestamp: T };

    it('is off when the data filter is disabled or absent, regardless of fadeOpacity', () => {
      for (const props of [
        dataFilterExtensionProps(undefined, ctx),
        dataFilterExtensionProps(manual({ enabled: false, fadeOpacity: true }), ctx),
      ]) {
        expect(props.fadeFilterEnabled).toBe(false);
      }
    });

    it('is off when the filter is enabled but fadeOpacity is not', () => {
      expect(dataFilterExtensionProps(manual({ fadeOpacity: false }), ctx).fadeFilterEnabled).toBe(false);
    });

    it('is on, with fadeFilterRange matching the resolved filter range, when both are enabled', () => {
      const props = dataFilterExtensionProps(manual({ fadeOpacity: true, filterRange: [3, 7] }), ctx);
      expect(props.fadeFilterEnabled).toBe(true);
      expect(props.fadeFilterRange).toEqual([3, 7]);
    });

    it('follows the resolved (not raw) range in timeline mode', () => {
      const props = dataFilterExtensionProps(
        manual({ fadeOpacity: true, mode: 'timeline', delay: { value: 2000, unit: 'ms' } }),
        { timestamp: T },
      );
      expect(props.fadeFilterRange).toEqual([T - 2000, T]);
    });
  });
});
