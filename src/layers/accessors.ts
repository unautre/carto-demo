import { hexToRgb, isValidHexColor, type RGB, type RGBA } from './colors';
import type { PropertyValue } from '../types';

export interface RowLike {
  properties?: Record<string, unknown> | null;
}

export interface CompiledAccessor<T> {
  fn: (d: RowLike) => T;
  /** Set when `code` failed to compile; `fn` falls back to `fallback` for every row. */
  error?: string;
}

const cache = new Map<string, CompiledAccessor<unknown>>();

/**
 * Compiles `code` (a function body; an implicit `return` is added for a bare expression) into a
 * per-row accessor. `parse` validates/converts the raw return value, falling back to `fallback`
 * when it's missing, the wrong type, or the code throws at runtime. Cached by `cacheKey` (not
 * `code` alone — a number accessor and a colour accessor could otherwise share one cache entry
 * for the same code string and return each other's stale, wrongly-typed result).
 */
function compile<T>(cacheKey: string, code: string, parse: (raw: unknown) => T | undefined, fallback: T): CompiledAccessor<T> {
  const cached = cache.get(cacheKey);
  if (cached) return cached as CompiledAccessor<T>;

  let compiled: CompiledAccessor<T>;
  try {
    const body = /\breturn\b/.test(code) ? code : `return (${code});`;
    // eslint-disable-next-line no-new-func -- the whole point: users write the accessor's JS
    const raw = new Function('properties', 'd', body) as (properties: Record<string, unknown>, d: RowLike) => unknown;
    compiled = {
      fn: (d: RowLike) => {
        try {
          const v = parse(raw(d.properties ?? {}, d));
          return v !== undefined ? v : fallback;
        } catch {
          return fallback;
        }
      },
    };
  } catch (e) {
    compiled = { fn: () => fallback, error: e instanceof Error ? e.message : String(e) };
  }
  cache.set(cacheKey, compiled as CompiledAccessor<unknown>);
  return compiled;
}

/** Compiles a number-returning property accessor (opacity, radius, line width). */
export function compileNumberAccessor(code: string, fallback: number): CompiledAccessor<number> {
  return compile(`number:${code}`, code, (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined), fallback);
}

/** Compiles a colour-returning property accessor; must return a hex string (e.g. `"#ff8800"`). */
export function compileColorAccessor(code: string, fallback: RGB): CompiledAccessor<RGB> {
  return compile(`color:${code}`, code, (v) => (isValidHexColor(v) ? hexToRgb(v) : undefined), fallback);
}

/** Resolves a numeric property to its constant, or a compiled per-row accessor — ready to pass straight to a deck.gl accessor prop. */
export function resolveNumberProperty(prop: PropertyValue<number>): number | ((d: RowLike) => number) {
  return prop.mode === 'accessor' ? compileNumberAccessor(prop.code, prop.value).fn : prop.value;
}

/** Error from the last compile of `prop`'s accessor code, if it's in accessor mode and failed. */
export function numberPropertyError(prop: PropertyValue<number>): string | undefined {
  return prop.mode === 'accessor' ? compileNumberAccessor(prop.code, prop.value).error : undefined;
}

export function colorPropertyError(prop: PropertyValue<string>): string | undefined {
  return prop.mode === 'accessor' ? compileColorAccessor(prop.code, hexToRgb(prop.value)).error : undefined;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Combines a colour property and an opacity property into a single RGBA accessor/constant — deck.gl
 * layers don't accept a per-row accessor for their layer-level `opacity` prop, only a constant, so a
 * per-row opacity has to be baked into the alpha channel of the colour it's painted with instead.
 */
export function resolveColorWithAlpha(color: PropertyValue<string>, opacity: PropertyValue<number>, alphaScale = 255): RGBA | ((d: RowLike) => RGBA) {
  if (color.mode !== 'accessor' && opacity.mode !== 'accessor') {
    const [r, g, b] = hexToRgb(color.value);
    return [r, g, b, Math.round(clamp01(opacity.value) * alphaScale)];
  }
  const colorFn = color.mode === 'accessor' ? compileColorAccessor(color.code, hexToRgb(color.value)).fn : () => hexToRgb(color.value);
  const opacityFn = opacity.mode === 'accessor' ? compileNumberAccessor(opacity.code, opacity.value).fn : () => opacity.value;
  return (d: RowLike) => {
    const [r, g, b] = colorFn(d);
    return [r, g, b, Math.round(clamp01(opacityFn(d)) * alphaScale)];
  };
}
