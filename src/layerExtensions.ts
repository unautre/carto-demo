import type { LayerExtension } from '@deck.gl/core';
import { DataFilterExtension } from '@deck.gl/extensions';
import type { LoadedData } from './data';
import type { DataFilterConfig } from './types';

export const DEFAULT_DATA_FILTER: DataFilterConfig = {
  enabled: true,
  getFilterValue: 'return properties.value ?? 0;',
  filterRange: [-1, 1],
};

export interface RowLike {
  properties?: Record<string, unknown> | null;
}

export interface CompiledFilter {
  fn: (d: RowLike) => number;
  /** Set when `code` failed to compile; `fn` falls back to returning 0. */
  error?: string;
}

const cache = new Map<string, CompiledFilter>();

/**
 * Compiles user-supplied JS into a `getFilterValue` accessor. `code` is a function body
 * (an implicit `return` is added if it looks like a bare expression); it receives
 * `properties` (the row/feature's properties object) and `d` (the raw row/feature).
 */
export function compileFilterValue(code: string): CompiledFilter {
  const cached = cache.get(code);
  if (cached) return cached;

  let compiled: CompiledFilter;
  try {
    const body = /\breturn\b/.test(code) ? code : `return (${code});`;
    // eslint-disable-next-line no-new-func -- the whole point: users write the filter's JS
    const raw = new Function('properties', 'd', body) as (properties: Record<string, unknown>, d: RowLike) => unknown;
    compiled = {
      fn: (d: RowLike) => {
        try {
          const v = raw(d.properties ?? {}, d);
          return typeof v === 'number' && Number.isFinite(v) ? v : 0;
        } catch {
          return 0;
        }
      },
    };
  } catch (e) {
    compiled = { fn: () => 0, error: e instanceof Error ? e.message : String(e) };
  }
  cache.set(code, compiled);
  return compiled;
}

function filterRows(loaded: LoadedData): RowLike[] {
  return loaded.shape === 'geojson' ? loaded.data.features : loaded.data;
}

/** Runs `fn` over the currently loaded rows to suggest a [min, max] `filterRange`. */
export function computeFilterRange(loaded: LoadedData, fn: (d: RowLike) => number): [number, number] | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const row of filterRows(loaded)) {
    const v = fn(row);
    if (Number.isFinite(v)) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  return min <= max ? [min, max] : undefined;
}

export interface DataFilterLayerProps {
  extensions: LayerExtension[];
  filterEnabled: boolean;
  getFilterValue?: (d: RowLike) => number;
  filterRange: [number, number];
}

/**
 * A single extension instance shared by every layer. deck.gl only wires an extension's GPU
 * attribute up when a layer is first created (`initializeState`); a later props update that adds
 * `extensions` to an already-existing layer id is a no-op. So every vector layer carries this
 * extension from creation, and the filter is switched on/off with its own `filterEnabled` prop.
 */
const EXTENSIONS: LayerExtension[] = [new DataFilterExtension({ filterSize: 1 })];

/** deck.gl layer props that wire up the DataFilterExtension (on every layer, filter on or off). */
export function dataFilterExtensionProps(config: DataFilterConfig | undefined): DataFilterLayerProps {
  const enabled = config?.enabled ?? false;
  return {
    extensions: EXTENSIONS,
    filterEnabled: enabled,
    filterRange: config?.filterRange ?? DEFAULT_DATA_FILTER.filterRange,
    // Omitted (not just `undefined`-valued) when disabled, so deck.gl's own default accessor
    // (a constant) applies — an explicit `getFilterValue: undefined` key fails its own validation.
    ...(enabled ? { getFilterValue: compileFilterValue(config!.getFilterValue).fn } : {}),
  };
}
