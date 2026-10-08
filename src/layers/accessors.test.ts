import { describe, expect, it } from 'vitest';
import { colorPropertyError, compileColorAccessor, compileNumberAccessor, numberPropertyError, resolveColorWithAlpha, resolveNumberProperty } from './accessors';
import type { PropertyValue } from '../types';

const constant = <T,>(value: T): PropertyValue<T> => ({ mode: 'constant', value, code: '' });
const accessor = <T,>(code: string, value: T): PropertyValue<T> => ({ mode: 'accessor', value, code });

describe('compileNumberAccessor', () => {
  it('runs an explicit return statement', () => {
    const { fn, error } = compileNumberAccessor('return properties.v * 2;', 0);
    expect(error).toBeUndefined();
    expect(fn({ properties: { v: 3 } })).toBe(6);
  });

  it('treats a bare expression as the return value', () => {
    const { fn } = compileNumberAccessor('properties.v ?? 0', 0);
    expect(fn({ properties: { v: 5 } })).toBe(5);
    expect(fn({ properties: {} })).toBe(0);
  });

  it('falls back on a compile error', () => {
    const { fn, error } = compileNumberAccessor('return properties.(;', -1);
    expect(error).toBeTruthy();
    expect(fn({ properties: {} })).toBe(-1);
  });

  it('falls back on a runtime error instead of throwing', () => {
    const { fn } = compileNumberAccessor('return properties.missing.value;', -1);
    expect(fn({ properties: {} })).toBe(-1);
  });

  it('falls back when the result is not a finite number', () => {
    const { fn } = compileNumberAccessor('return "nope";', -1);
    expect(fn({ properties: {} })).toBe(-1);
    const { fn: fnInf } = compileNumberAccessor('return Infinity;', -1);
    expect(fnInf({ properties: {} })).toBe(-1);
  });

  it('can call the sandboxed hash() helper', () => {
    const { fn, error } = compileNumberAccessor('return hash(properties.category);', -1);
    expect(error).toBeUndefined();
    expect(fn({ properties: { category: 'a' } })).toBe(fn({ properties: { category: 'a' } }));
    expect(fn({ properties: { category: 'a' } })).not.toBe(fn({ properties: { category: 'b' } }));
  });
});

describe('compileColorAccessor', () => {
  it('parses a returned hex string into RGB', () => {
    const { fn, error } = compileColorAccessor("return '#ff8800';", [0, 0, 0]);
    expect(error).toBeUndefined();
    expect(fn({ properties: {} })).toEqual([255, 136, 0]);
  });

  it('falls back when the result is not a valid hex colour', () => {
    const { fn } = compileColorAccessor('return 42;', [1, 2, 3]);
    expect(fn({ properties: {} })).toEqual([1, 2, 3]);
    const { fn: fnBad } = compileColorAccessor("return 'not-a-color';", [1, 2, 3]);
    expect(fnBad({ properties: {} })).toEqual([1, 2, 3]);
  });

  it('can call the sandboxed numberToColor() helper', () => {
    const { fn, error } = compileColorAccessor('return numberToColor(properties.v, 0, 100);', [0, 0, 0]);
    expect(error).toBeUndefined();
    expect(fn({ properties: { v: 0 } })).toEqual([46, 134, 171]);
    expect(fn({ properties: { v: 100 } })).toEqual([228, 87, 46]);
  });

  it("doesn't collide with a number accessor using the same code string", () => {
    // Same source text, different return types — must not share a cache entry and return the wrong shape.
    const code = 'return properties.v;';
    const num = compileNumberAccessor(code, -1);
    const color = compileColorAccessor(code, [9, 9, 9]);
    expect(num.fn({ properties: { v: 7 } })).toBe(7);
    expect(color.fn({ properties: { v: '#112233' } })).toEqual([17, 34, 51]);
  });
});

describe('resolveNumberProperty / numberPropertyError', () => {
  it('returns the constant directly in constant mode', () => {
    expect(resolveNumberProperty(constant(42))).toBe(42);
    expect(numberPropertyError(constant(42))).toBeUndefined();
  });

  it('returns a compiled accessor function in accessor mode', () => {
    const resolved = resolveNumberProperty(accessor('return properties.v;', 0));
    expect(typeof resolved).toBe('function');
    expect((resolved as (d: unknown) => number)({ properties: { v: 11 } })).toBe(11);
  });

  it('surfaces the compile error only in accessor mode', () => {
    expect(numberPropertyError(accessor('return properties.(;', 0))).toBeTruthy();
  });
});

describe('colorPropertyError', () => {
  it('is undefined in constant mode, and set for bad accessor code', () => {
    expect(colorPropertyError(constant('#fff'))).toBeUndefined();
    expect(colorPropertyError(accessor('return properties.(;', '#fff'))).toBeTruthy();
  });
});

describe('resolveColorWithAlpha', () => {
  it('returns a plain RGBA tuple when both colour and opacity are constants', () => {
    const result = resolveColorWithAlpha(constant('#ff0000'), constant(0.5));
    expect(result).toEqual([255, 0, 0, 128]);
  });

  it('scales alpha by a custom alphaScale', () => {
    const result = resolveColorWithAlpha(constant('#ff0000'), constant(1), 100);
    expect(result).toEqual([255, 0, 0, 100]);
  });

  it('returns a per-row function when colour is an accessor', () => {
    const result = resolveColorWithAlpha(accessor("return properties.v > 0 ? '#00ff00' : '#ff0000';", '#000000'), constant(1));
    expect(typeof result).toBe('function');
    const fn = result as (d: unknown) => [number, number, number, number];
    expect(fn({ properties: { v: 1 } })).toEqual([0, 255, 0, 255]);
    expect(fn({ properties: { v: -1 } })).toEqual([255, 0, 0, 255]);
  });

  it('returns a per-row function when opacity is an accessor, reusing the constant colour', () => {
    const result = resolveColorWithAlpha(constant('#0000ff'), accessor('return properties.v;', 1));
    const fn = result as (d: unknown) => [number, number, number, number];
    expect(fn({ properties: { v: 0.2 } })).toEqual([0, 0, 255, 51]);
  });

  it('clamps an out-of-range accessor-resolved opacity to [0, 1]', () => {
    const result = resolveColorWithAlpha(constant('#0000ff'), accessor('return properties.v;', 1));
    const fn = result as (d: unknown) => [number, number, number, number];
    expect(fn({ properties: { v: 5 } })).toEqual([0, 0, 255, 255]);
    expect(fn({ properties: { v: -5 } })).toEqual([0, 0, 255, 0]);
  });
});
