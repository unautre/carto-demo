import { describe, expect, it } from 'vitest';
import { basemapLayer, DEFAULT_BASEMAP, normalizeBasemap } from './deckLayers';

describe('normalizeBasemap', () => {
  it('keeps an already-current-shaped config, falling back field-by-field when corrupt', () => {
    const config = { enabled: false, url: 'https://example.com/{z}/{x}/{y}.png', maxZoom: 12, attribution: 'Example' };
    expect(normalizeBasemap(config)).toEqual(config);
    expect(normalizeBasemap({ enabled: true })).toEqual({ ...DEFAULT_BASEMAP, enabled: true });
    expect(normalizeBasemap({ maxZoom: -1 })).toEqual(DEFAULT_BASEMAP);
    expect(normalizeBasemap({ url: '   ' })).toEqual(DEFAULT_BASEMAP);
  });

  it('upgrades an old BasemapId string preset to the OpenStreetMap default', () => {
    for (const old of ['light', 'dark', 'osm', 'imagery']) expect(normalizeBasemap(old)).toEqual(DEFAULT_BASEMAP);
  });

  it("upgrades the old 'none' preset to a disabled OpenStreetMap config, not just a blank one", () => {
    expect(normalizeBasemap('none')).toEqual({ ...DEFAULT_BASEMAP, enabled: false });
  });

  it('falls back to the default for missing or non-object/non-string input', () => {
    expect(normalizeBasemap(undefined)).toEqual(DEFAULT_BASEMAP);
    expect(normalizeBasemap(null)).toEqual(DEFAULT_BASEMAP);
    expect(normalizeBasemap(42)).toEqual(DEFAULT_BASEMAP);
  });
});

describe('basemapLayer', () => {
  it('returns null when disabled or the URL is blank', () => {
    expect(basemapLayer({ ...DEFAULT_BASEMAP, enabled: false })).toBeNull();
    expect(basemapLayer({ ...DEFAULT_BASEMAP, url: '  ' })).toBeNull();
  });

  it('builds a tile layer from the configured URL/maxZoom when enabled', () => {
    const layer = basemapLayer(DEFAULT_BASEMAP);
    expect(layer).not.toBeNull();
    expect(layer!.props.id).toBe('basemap');
    expect((layer!.props as unknown as { data: string }).data).toBe(DEFAULT_BASEMAP.url);
    expect((layer!.props as unknown as { maxZoom: number }).maxZoom).toBe(DEFAULT_BASEMAP.maxZoom);
  });
});
