import * as duckdb from '@duckdb/duckdb-wasm';
import { DataType } from 'apache-arrow';
import type { DuckDbParams } from '../types';
import { interpolateQuery, type QueryTemplateContext } from './queryTemplate';

/**
 * The WASM engine + its own worker, shared by every DuckDB-kind layer. Built once on first use —
 * spinning up a fresh one per query would mean re-fetching and recompiling several MB of WASM.
 */
let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

async function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
      const worker = await duckdb.createWorker(bundle.mainWorker!);
      const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      return db;
    })();
  }
  return dbPromise;
}

/**
 * Not a real URL — there's no server to hit. Used as a stable cache key (see `data.ts`), not
 * interpolated; `fetchDuckDbRows` is what resolves `{{timestamp}}` etc. before running the query.
 */
export function duckdbQueryKey(p: DuckDbParams): string {
  return `duckdb:${p.query.trim().replace(/;\s*$/, '')}`;
}

export interface DuckDbResult {
  data: Array<Record<string, unknown>>;
  rows: number;
}

/**
 * `StructRow.toJSON()` passes Decimal/Int64/Uint64 columns through as Arrow's raw BigNum-ish
 * typed-array wrapper instead of a plain JS number — fine for exact precision, but wrong for this
 * app's generic row-shape-sniffing (`data.ts`'s `rowPosition` etc. expect plain `number`s). Decimal
 * literals are especially easy to hit by accident: DuckDB infers `-122.27` as DECIMAL(5,2), not
 * DOUBLE, in a bare `VALUES (...)` query — exactly what a user testing a quick query would type.
 */
function cellToPlainValue(raw: unknown, type: unknown): unknown {
  if (DataType.isDecimal(type) && raw && typeof raw === 'object' && 'valueOf' in raw) {
    return (raw as { valueOf(scale: number): number }).valueOf(type.scale);
  }
  if (typeof raw === 'bigint') return Number(raw);
  return raw;
}

interface ArrowTableLike {
  schema: { fields: Array<{ name: string; type: unknown }> };
  toArray(): unknown[];
}

function tableToRows(table: ArrowTableLike): Array<Record<string, unknown>> {
  const fields = table.schema.fields;
  return table.toArray().map((row) => {
    const obj: Record<string, unknown> = {};
    for (const f of fields) obj[f.name] = cellToPlainValue((row as Record<string, unknown>)[f.name], f.type);
    return obj;
  });
}

export { tableToRows as _tableToRowsForTests };

/** Runs a SQL query against an in-browser DuckDB-WASM engine and returns its rows as plain objects. */
export async function fetchDuckDbRows(p: DuckDbParams, ctx: QueryTemplateContext): Promise<DuckDbResult> {
  const sql = interpolateQuery(p.query.trim().replace(/;\s*$/, ''), ctx);
  const db = await getDb();
  const conn = await db.connect();
  try {
    const table = await conn.query(sql);
    const data = tableToRows(table);
    return { data, rows: data.length };
  } finally {
    await conn.close();
  }
}
