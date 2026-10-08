import { hexToRgb } from './colors';

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

/**
 * Maps a number to a hex colour (e.g. `"#7a5ca0"`), linearly interpolated between a cold (low) and
 * hot (high) colour across `[min, max]` — default `0..1`, like a typical `t`-parameterised colour
 * scale. Clamped at both ends, so an out-of-range value still returns a valid colour.
 */
export function numberToColor(value: number, min = 0, max = 1): string {
  const t = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const r = COLD[0] + (HOT[0] - COLD[0]) * t;
  const g = COLD[1] + (HOT[1] - COLD[1]) * t;
  const b = COLD[2] + (HOT[2] - COLD[2]) * t;
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}
