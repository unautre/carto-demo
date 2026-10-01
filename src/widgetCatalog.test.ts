import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMELINE_CONFIG, defaultWidgetSettings, PLACEMENTS, WIDGET_KIND_ORDER, WIDGET_KINDS, withWidgetDefaults } from './widgetCatalog';

describe('defaultWidgetSettings', () => {
  it('starts every widget disabled, at its catalog default placement', () => {
    const settings = defaultWidgetSettings();
    for (const kind of WIDGET_KIND_ORDER) {
      const extra = kind === 'timeline' ? { timeline: DEFAULT_TIMELINE_CONFIG } : {};
      expect(settings[kind]).toEqual({ enabled: false, placement: WIDGET_KINDS[kind].defaultPlacement, ...extra });
    }
  });

  it('covers exactly the catalog order, with a placement from the catalog', () => {
    const settings = defaultWidgetSettings();
    expect(Object.keys(settings).sort()).toEqual([...WIDGET_KIND_ORDER].sort());
    for (const kind of WIDGET_KIND_ORDER) expect(settings[kind].placement).toBe(WIDGET_KINDS[kind].defaultPlacement);
  });

  it("'fill' (the Timeline widget's placement) is a valid default but not a user-selectable choice", () => {
    expect(defaultWidgetSettings().timeline.placement).toBe('fill');
    expect(PLACEMENTS).not.toContain('fill');
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

  it('keeps a saved Timeline config with valid step/playInterval', () => {
    const timeline = { timeRange: [0, 1000] as [number, number], autoPlay: true, step: 10, playInterval: 50 };
    const settings = withWidgetDefaults({ timeline: { enabled: true, placement: 'fill', timeline } });
    expect(settings.timeline.timeline).toEqual(timeline);
  });

  it('falls back to the default Timeline config when step/playInterval are missing or non-positive (older/corrupt save)', () => {
    for (const bad of [
      { timeRange: [0, 1000], autoPlay: false }, // pre-step/playInterval save
      { timeRange: [0, 1000], autoPlay: false, step: 0, playInterval: 50 },
      { timeRange: [0, 1000], autoPlay: false, step: 10, playInterval: -1 },
    ]) {
      // @ts-expect-error intentionally incomplete/invalid, as if from an older/corrupt localStorage blob
      const settings = withWidgetDefaults({ timeline: { enabled: true, placement: 'fill', timeline: bad } });
      expect(settings.timeline.timeline).toEqual(DEFAULT_TIMELINE_CONFIG);
    }
  });
});

describe('WIDGET_KINDS catalog', () => {
  it('every entry constructs a widget without throwing, at its default placement', () => {
    for (const kind of WIDGET_KIND_ORDER) {
      const info = WIDGET_KINDS[kind];
      const widget = info.create(info.defaultPlacement, {
        initialViewState: { longitude: 0, latitude: 0, zoom: 1 },
        timeline: kind === 'timeline' ? { ...DEFAULT_TIMELINE_CONFIG, time: DEFAULT_TIMELINE_CONFIG.timeRange[1], onTimeChange: () => {} } : undefined,
      });
      expect(widget.placement).toBe(info.defaultPlacement);
    }
  });

  it('passes a configured step/playInterval through to the Timeline widget', () => {
    const widget = WIDGET_KINDS.timeline.create('fill', {
      initialViewState: { longitude: 0, latitude: 0, zoom: 1 },
      timeline: { ...DEFAULT_TIMELINE_CONFIG, step: 5000, playInterval: 200, time: DEFAULT_TIMELINE_CONFIG.timeRange[1], onTimeChange: () => {} },
    });
    expect((widget.props as unknown as { step: number }).step).toBe(5000);
    expect((widget.props as unknown as { playInterval: number }).playInterval).toBe(200);
  });
});
