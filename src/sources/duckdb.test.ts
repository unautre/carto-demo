import { Decimal, Field, Int64, Utf8 } from 'apache-arrow';
import { describe, expect, it } from 'vitest';
import { _tableToRowsForTests as tableToRows, duckdbQueryKey } from './duckdb';

describe('duckdbQueryKey', () => {
  it('strips a trailing semicolon', () => {
    expect(duckdbQueryKey({ query: 'SELECT 1;' })).toBe('duckdb:SELECT 1');
  });

  it('does not interpolate placeholders — it is the (stable) cache key, not what gets sent', () => {
    expect(duckdbQueryKey({ query: 'SELECT {{timestamp}}' })).toBe('duckdb:SELECT {{timestamp}}');
  });

  it('is stable for the same query', () => {
    expect(duckdbQueryKey({ query: 'SELECT 1' })).toBe(duckdbQueryKey({ query: 'SELECT 1' }));
  });
});

describe('tableToRows', () => {
  it('converts a Decimal column using its scale, not the raw unscaled digits', () => {
    // DuckDB infers e.g. -122.27 as DECIMAL(5,2): the raw cell is Arrow's BigNum-ish wrapper, whose
    // `.valueOf(scale)` applies the decimal point — calling it bare (or via naive toJSON) would give -12227.
    const lon = { valueOf: (scale: number) => -12227 / 10 ** scale };
    const table = {
      schema: { fields: [new Field('lon', new Decimal(2, 5)), new Field('city', new Utf8())] },
      toArray: () => [{ lon, city: 'Oakland' }],
    };
    expect(tableToRows(table)).toEqual([{ lon: -122.27, city: 'Oakland' }]);
  });

  it('converts a bigint (Int64/Uint64) column to a plain number', () => {
    const table = {
      schema: { fields: [new Field('n', new Int64())] },
      toArray: () => [{ n: 42n }],
    };
    expect(tableToRows(table)).toEqual([{ n: 42 }]);
  });

  it('passes plain values (strings, numbers) through untouched', () => {
    const table = {
      schema: { fields: [new Field('city', new Utf8())] },
      toArray: () => [{ city: 'Paris' }],
    };
    expect(tableToRows(table)).toEqual([{ city: 'Paris' }]);
  });
});
