import { describe, expect, it } from 'vitest';
import { interpolateQuery } from './queryTemplate';

const T = 1_700_000_000_000;
const CTX = { timestamp: T, timeRangeStart: T - 1000, timeRangeEnd: T + 1000, bboxWest: -10, bboxSouth: -5, bboxEast: 10, bboxNorth: 5 };

describe('interpolateQuery', () => {
  it('replaces all three placeholders with epoch-ms numbers', () => {
    const sql = interpolateQuery('WHERE ts BETWEEN {{timeRangeStart}} AND {{timeRangeEnd}} AND now = {{timestamp}}', CTX);
    expect(sql).toBe(`WHERE ts BETWEEN ${CTX.timeRangeStart} AND ${CTX.timeRangeEnd} AND now = ${CTX.timestamp}`);
  });

  it('tolerates whitespace inside the braces and repeats', () => {
    expect(interpolateQuery('{{ timestamp }} {{timestamp}}', CTX)).toBe(`${CTX.timestamp} ${CTX.timestamp}`);
  });

  it('leaves a query with no placeholders untouched', () => {
    expect(interpolateQuery('SELECT 1', CTX)).toBe('SELECT 1');
  });

  it("doesn't collide with ClickHouse's own {name:Type} parameter syntax", () => {
    expect(interpolateQuery('SELECT {limit:UInt32} LIMIT {{timestamp}}', CTX)).toBe(`SELECT {limit:UInt32} LIMIT ${CTX.timestamp}`);
  });

  it('replaces the four bbox placeholders with the viewport extent', () => {
    const sql = interpolateQuery(
      'WHERE lon BETWEEN {{bboxWest}} AND {{bboxEast}} AND lat BETWEEN {{bboxSouth}} AND {{bboxNorth}}',
      CTX,
    );
    expect(sql).toBe(`WHERE lon BETWEEN ${CTX.bboxWest} AND ${CTX.bboxEast} AND lat BETWEEN ${CTX.bboxSouth} AND ${CTX.bboxNorth}`);
  });
});
