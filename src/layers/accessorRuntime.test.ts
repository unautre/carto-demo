import { describe, expect, it } from 'vitest';
import { hash, numberToColor } from './accessorRuntime';

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
