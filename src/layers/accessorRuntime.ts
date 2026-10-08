import { hexToRgb, hslToRgb } from './colors';

function stringifyArg(v: unknown): string {
  // Prefixed with `typeof` so e.g. the number 1 and the string "1" don't hash the same.
  if (v === null) return 'object:null';
  if (typeof v === 'object') {
    try {
      return `object:${JSON.stringify(v)}`;
    } catch {
      return `object:${String(v)}`;
    }
  }
  return `${typeof v}:${String(v)}`;
}

/**
 * Deterministic 32-bit unsigned hash (FNV-1a) of any number of values — same inputs always give the
 * same result. Useful for mapping a categorical property to a stable pseudo-random number, e.g. a
 * palette index or (paired with `numberToColor`) a colour: `numberToColor(hash(properties.category), 0, 2**32)`.
 */
export function hash(...values: unknown[]): number {
  const s = values.map(stringifyArg).join('');
  let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return h >>> 0;
}

const COLD = hexToRgb('#2e86ab');
const HOT = hexToRgb('#e4572e');

const toHex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
const rgbToHex = ([r, g, b]: readonly [number, number, number]) => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;

/** Normalises `value` into `[0, 1]` across `[min, max]`, clamped at both ends. */
function normalize(value: number, min: number, max: number): number {
  return max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
}

/**
 * Maps a number to a hex colour (e.g. `"#7a5ca0"`), linearly interpolated between a cold (low) and
 * hot (high) colour across `[min, max]` — default `0..1`, like a typical `t`-parameterised colour
 * scale. Clamped at both ends, so an out-of-range value still returns a valid colour.
 */
export function numberToColor(value: number, min = 0, max = 1): string {
  const t = normalize(value, min, max);
  const r = COLD[0] + (HOT[0] - COLD[0]) * t;
  const g = COLD[1] + (HOT[1] - COLD[1]) * t;
  const b = COLD[2] + (HOT[2] - COLD[2]) * t;
  return rgbToHex([r, g, b]);
}

/** Maps a number to a grayscale hex colour, from black (`min`) to white (`max`) — default `0..1`, clamped at both ends. */
export function numberToGrayscale(value: number, min = 0, max = 1): string {
  const v = normalize(value, min, max) * 255;
  return rgbToHex([v, v, v]);
}

/**
 * Maps a number to a hex colour by sweeping the full hue circle (0–360°) across `[min, max]` —
 * default `0..1`, clamped at both ends — at fixed saturation/lightness. Unlike `numberToColor`
 * (one gradient between two colours), this spreads values across the *whole* colour space, so many
 * distinct values (e.g. a `hash()`-derived category) stay visually distinguishable from each other.
 */
export function numberToRainbow(value: number, min = 0, max = 1): string {
  const t = normalize(value, min, max);
  return rgbToHex(hslToRgb(t * 360, 0.65, 0.5));
}

/**
 * Every function available inside an accessor/`getFilterValue` JS editor, besides `properties`/`d`
 * — see `accessors.ts`'s `compile` and `layerExtensions.ts`'s `compileFilterValue`, which expose
 * this object's properties directly (via `with`) rather than as individually named parameters, so
 * adding a function here is the only step needed to make it available everywhere.
 */
export const ACCESSOR_RUNTIME = { hash, numberToColor, numberToGrayscale, numberToRainbow };
