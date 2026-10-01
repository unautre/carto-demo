import { describe, expect, it } from 'vitest';
import { durationMs, isValidDuration, UNIT_MS, UNIT_ORDER } from './duration';

describe('durationMs', () => {
  it('converts every unit to ms', () => {
    expect(durationMs({ value: 5, unit: 'ms' })).toBe(5);
    expect(durationMs({ value: 5, unit: 'seconds' })).toBe(5000);
    expect(durationMs({ value: 5, unit: 'minutes' })).toBe(5 * 60 * 1000);
    expect(durationMs({ value: 5, unit: 'hours' })).toBe(5 * 60 * 60 * 1000);
    expect(durationMs({ value: 5, unit: 'days' })).toBe(5 * 24 * 60 * 60 * 1000);
  });

  it('agrees with UNIT_MS for a value of 1', () => {
    for (const unit of UNIT_ORDER) expect(durationMs({ value: 1, unit })).toBe(UNIT_MS[unit]);
  });

  it('scales linearly and supports fractional values', () => {
    expect(durationMs({ value: 1.5, unit: 'hours' })).toBe(1.5 * 60 * 60 * 1000);
  });
});

describe('isValidDuration', () => {
  it('accepts a well-formed duration for every unit', () => {
    for (const unit of UNIT_ORDER) expect(isValidDuration({ value: 1, unit })).toBe(true);
  });

  it('rejects a non-positive, missing, or non-finite value', () => {
    expect(isValidDuration({ value: 0, unit: 'ms' })).toBe(false);
    expect(isValidDuration({ value: -5, unit: 'ms' })).toBe(false);
    expect(isValidDuration({ value: Infinity, unit: 'ms' })).toBe(false);
    expect(isValidDuration({ unit: 'ms' })).toBe(false);
  });

  it('rejects an unknown or missing unit', () => {
    expect(isValidDuration({ value: 1, unit: 'fortnights' })).toBe(false);
    expect(isValidDuration({ value: 1 })).toBe(false);
  });

  it('rejects undefined/null/non-objects', () => {
    expect(isValidDuration(undefined)).toBe(false);
    expect(isValidDuration(null)).toBe(false);
    expect(isValidDuration(42)).toBe(false);
    expect(isValidDuration('1 hour')).toBe(false);
  });
});
