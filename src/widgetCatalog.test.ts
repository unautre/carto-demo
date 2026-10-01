import { describe, expect, it } from 'vitest';
import { defaultWidgetSettings, PLACEMENTS, WIDGET_KIND_ORDER, WIDGET_KINDS, withWidgetDefaults } from './widgetCatalog';

describe('defaultWidgetSettings', () => {
  it('starts every widget disabled, at its catalog default placement', () => {
    const settings = defaultWidgetSettings();
    for (const kind of WIDGET_KIND_ORDER) {
      expect(settings[kind]).toEqual({ enabled: false, placement: WIDGET_KINDS[kind].defaultPlacement });
    }
  });

  it('covers exactly the catalog order, with valid placements', () => {
    const settings = defaultWidgetSettings();
    expect(Object.keys(settings).sort()).toEqual([...WIDGET_KIND_ORDER].sort());
    for (const kind of WIDGET_KIND_ORDER) expect(PLACEMENTS).toContain(settings[kind].placement);
  });
});

describe('withWidgetDefaults', () => {
  it('falls back to defaults when nothing was saved', () => {
    expect(withWidgetDefaults(undefined)).toEqual(defaultWidgetSettings());
  });

  it('keeps a saved kind and fills in the rest', () => {
    const settings = withWidgetDefaults({ zoom: { enabled: true, placement: 'bottom-right' } });
    expect(settings.zoom).toEqual({ enabled: true, placement: 'bottom-right' });
    expect(settings.compass).toEqual(defaultWidgetSettings().compass);
  });

  it('ignores a corrupt saved entry (bad placement) and falls back to its default', () => {
    // @ts-expect-error intentionally invalid, as if from an older/corrupt localStorage blob
    const settings = withWidgetDefaults({ zoom: { enabled: true, placement: 'middle' } });
    expect(settings.zoom).toEqual(defaultWidgetSettings().zoom);
  });
});

describe('WIDGET_KINDS catalog', () => {
  it('every entry constructs a widget without throwing, at its default placement', () => {
    for (const kind of WIDGET_KIND_ORDER) {
      const info = WIDGET_KINDS[kind];
      const widget = info.create(info.defaultPlacement, { initialViewState: { longitude: 0, latitude: 0, zoom: 1 } });
      expect(widget.placement).toBe(info.defaultPlacement);
    }
  });
});
