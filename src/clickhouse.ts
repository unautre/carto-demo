import type { ClickHouseParams } from './types';

/** Builds the ClickHouse HTTP interface URL for a SELECT query, requesting `FORMAT JSON`. */
export function clickhouseQueryUrl(baseUrl: string, p: ClickHouseParams): string {
  const u = new URL(baseUrl, window.location.href);
  const sql = p.query.trim().replace(/;\s*$/, '');
  u.searchParams.set('query', `${sql}\nFORMAT JSON`);
  if (p.database) u.searchParams.set('database', p.database);
  return u.toString();
}

/** Credentials go in headers, not the query string, so they don't end up in server access logs. */
function authHeaders(p: ClickHouseParams): HeadersInit {
  const h: Record<string, string> = {};
  if (p.username) h['X-ClickHouse-User'] = p.username;
  if (p.password) h['X-ClickHouse-Key'] = p.password;
  return h;
}

export interface ClickHouseResult {
  meta: Array<{ name: string; type: string }>;
  data: Array<Record<string, unknown>>;
  rows: number;
}

/** Runs a query against the ClickHouse HTTP interface (https://clickhouse.com/docs/interfaces/http) and returns its rows. */
export async function fetchClickHouseRows(baseUrl: string, p: ClickHouseParams, signal?: AbortSignal): Promise<ClickHouseResult> {
  const res = await fetch(clickhouseQueryUrl(baseUrl, p), { headers: authHeaders(p), signal });
  const text = await res.text();
  if (!res.ok) throw new Error(`ClickHouse HTTP ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as ClickHouseResult;
  } catch {
    throw new Error(`Response is not JSON (set FORMAT JSON, or check the query): ${text.slice(0, 200)}`);
  }
}
