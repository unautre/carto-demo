import { describe, expect, it } from 'vitest';
import { ACCESSOR_RUNTIME, hash, numberToColor, numberToGrayscale, numberToRainbow } from './accessorRuntime';

describe('hash', () => {
  it('is deterministic for the same inputs', () => {
    expect(hash('foo', 1, true)).toBe(hash('foo', 1, true));
  });

  it('returns a non-negative 32-bit integer', () => {
    const h = hash('anything');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('distinguishes different inputs (no obvious collisions for near-identical values)', () => {
    expect(hash('a')).not.toBe(hash('b'));
    expect(hash('a', 'b')).not.toBe(hash('ab'));
    expect(hash(1)).not.toBe(hash('1'));
  });

  it('distinguishes argument order and arity', () => {
    expect(hash('a', 'b')).not.toBe(hash('b', 'a'));
    expect(hash('a')).not.toBe(hash('a', undefined));
  });

  it('handles null, undefined and object arguments without throwing', () => {
    expect(() => hash(null, undefined, { x: 1 }, [1, 2])).not.toThrow();
  });
});

describe('numberToColor', () => {
  it('returns a valid hex colour string', () => {
    expect(numberToColor(0.5)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns the cold colour at min and the hot colour at max (default 0..1)', () => {
    expect(numberToColor(0)).toBe('#2e86ab');
    expect(numberToColor(1)).toBe('#e4572e');
  });

  it('interpolates for a custom [min, max] range', () => {
    expect(numberToColor(0, 0, 100)).toBe('#2e86ab');
    expect(numberToColor(100, 0, 100)).toBe('#e4572e');
    expect(numberToColor(50, 0, 100)).toBe(numberToColor(0.5));
  });

  it('clamps out-of-range values instead of extrapolating', () => {
    expect(numberToColor(-5)).toBe('#2e86ab');
    expect(numberToColor(5)).toBe('#e4572e');
  });
});

describe('numberToGrayscale', () => {
  it('returns black at min and white at max (default 0..1)', () => {
    expect(numberToGrayscale(0)).toBe('#000000');
    expect(numberToGrayscale(1)).toBe('#ffffff');
  });

  it('interpolates for a custom [min, max] range', () => {
    expect(numberToGrayscale(50, 0, 100)).toBe(numberToGrayscale(0.5));
  });

  it('clamps out-of-range values instead of extrapolating', () => {
    expect(numberToGrayscale(-5)).toBe('#000000');
    expect(numberToGrayscale(5)).toBe('#ffffff');
  });
});

describe('numberToRainbow', () => {
  it('returns a valid hex colour string', () => {
    expect(numberToRainbow(0.5)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('wraps back to the same colour at min and max (0° and 360° are the same hue)', () => {
    expect(numberToRainbow(0)).toBe(numberToRainbow(1));
  });

  it('spreads distinct values across visually distinct colours', () => {
    const samples = [0, 0.2, 0.4, 0.6, 0.8].map((t) => numberToRainbow(t));
    expect(new Set(samples).size).toBe(samples.length);
  });

  it('interpolates for a custom [min, max] range', () => {
    expect(numberToRainbow(50, 0, 100)).toBe(numberToRainbow(0.5));
  });
});

describe('ACCESSOR_RUNTIME', () => {
  it('exposes every accessor runtime function by name', () => {
    expect(ACCESSOR_RUNTIME).toEqual({ hash, numberToColor, numberToGrayscale, numberToRainbow });
  });
});
