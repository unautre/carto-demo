import type { MapViewState, Widget, WidgetPlacement } from '@deck.gl/core';
import {
  CompassWidget,
  FullscreenWidget,
  GimbalWidget,
  LoadingWidget,
  ResetViewWidget,
  ScreenshotWidget,
  ThemeWidget,
  ZoomWidget,
  _ScaleWidget as ScaleWidget,
  _TimelineWidget as TimelineWidget,
} from '@deck.gl/widgets';
import type { TimelineConfig, WidgetConfig, WidgetKind, WidgetSettings } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fixed at module load, not "now" at render time: a stable, reasonable default range for the
 * slider. step/playInterval default to playing through the whole default (24h) range in 24
 * real seconds — deck.gl's own default (step: 1ms, playInterval: 1000ms) is 1ms of simulated
 * time per real second, i.e. visually frozen.
 */
export const DEFAULT_TIMELINE_CONFIG: TimelineConfig = {
  timeRange: [Date.now() - DAY_MS, Date.now()],
  autoPlay: false,
  step: 60 * 60 * 1000,
  playInterval: 1000,
};

/** Extra context a widget's factory may need beyond its placement. */
export interface WidgetCreateContext {
  /** View state ResetViewWidget returns to; falls back to deck.gl's own (usually unhelpful) default without this. */
  initialViewState: MapViewState;
  /** Only used by the 'timeline' kind: its controlled slider value, change handler, and settings. */
  timeline?: TimelineConfig & { time: number; onTimeChange: (time: number) => void };
}

export interface WidgetKindInfo {
  label: string;
  icon: string;
  hint: string;
  defaultPlacement: WidgetPlacement;
  create: (placement: WidgetPlacement, ctx: WidgetCreateContext) => Widget;
}

export const WIDGET_KINDS: Record<WidgetKind, WidgetKindInfo> = {
  zoom: {
    label: 'Zoom', icon: '⊕',
    hint: 'Zoom in / out buttons.',
    defaultPlacement: 'top-left',
    create: (placement) => new ZoomWidget({ placement }),
  },
  compass: {
    label: 'Compass', icon: '◆',
    hint: 'Shows the current bearing; click to reset to north.',
    defaultPlacement: 'top-left',
    create: (placement) => new CompassWidget({ placement }),
  },
  resetView: {
    label: 'Reset view', icon: '⟲',
    hint: 'Resets pan, zoom and rotation to the initial view.',
    defaultPlacement: 'top-left',
    create: (placement, ctx) => new ResetViewWidget({ placement, initialViewState: ctx.initialViewState }),
  },
  gimbal: {
    label: 'Gimbal', icon: '◎',
    hint: 'Shows pitch and rotation in 3D; click to reset.',
    defaultPlacement: 'top-left',
    create: (placement) => new GimbalWidget({ placement }),
  },
  fullscreen: {
    label: 'Fullscreen', icon: '⛶',
    hint: 'Toggles fullscreen for the map.',
    defaultPlacement: 'top-left',
    create: (placement) => new FullscreenWidget({ placement }),
  },
  screenshot: {
    label: 'Screenshot', icon: '▣',
    hint: 'Downloads a PNG of the map canvas.',
    defaultPlacement: 'top-left',
    create: (placement) => new ScreenshotWidget({ placement }),
  },
  theme: {
    label: 'Widget theme', icon: '◐',
    hint: 'Switches every active widget between light and dark styling.',
    defaultPlacement: 'top-left',
    create: (placement) => new ThemeWidget({ placement }),
  },
  loading: {
    label: 'Loading indicator', icon: '◌',
    hint: 'Shows a spinner while any layer is loading.',
    defaultPlacement: 'top-left',
    create: (placement) => new LoadingWidget({ placement }),
  },
  scale: {
    label: 'Scale bar', icon: '↔',
    hint: 'Distance scale bar (deck.gl preview widget).',
    defaultPlacement: 'top-left',
    create: (placement) => new ScaleWidget({ placement }),
  },
  timeline: {
    label: 'Timeline', icon: '▸',
    hint:
      "A time slider (deck.gl preview widget), always full-width at the bottom — TimelineWidget ignores `placement`. " +
      "Drives a layer's 'timeline'-mode data filter range and a ClickHouse query's `{{timestamp}}`/`{{timeRangeStart}}`/`{{timeRangeEnd}}` placeholders.",
    defaultPlacement: 'fill',
    create: (placement, ctx) => {
      const t = ctx.timeline!;
      return new TimelineWidget({
        placement,
        time: t.time,
        timeRange: t.timeRange,
        step: t.step,
        playInterval: t.playInterval,
        autoPlay: t.autoPlay,
        loop: t.autoPlay,
        onTimeChange: t.onTimeChange,
        formatLabel: (v) => new Date(v).toLocaleString(),
      });
    },
  },
};

export const WIDGET_KIND_ORDER: WidgetKind[] = ['zoom', 'compass', 'resetView', 'gimbal', 'fullscreen', 'screenshot', 'theme', 'loading', 'scale', 'timeline'];

/** User-selectable in the Widgets panel. Excludes 'fill': no widget here actually uses it as a choice (TimelineWidget ignores `placement` and is always 'fill'). */
export const PLACEMENTS: WidgetPlacement[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/** For validating a saved placement (localStorage), where 'fill' can legitimately appear (the Timeline widget's). */
const ALL_PLACEMENTS: WidgetPlacement[] = [...PLACEMENTS, 'fill'];

export function defaultWidgetSettings(): WidgetSettings {
  return Object.fromEntries(
    WIDGET_KIND_ORDER.map((kind): [WidgetKind, WidgetConfig] => [
      kind,
      { enabled: false, placement: WIDGET_KINDS[kind].defaultPlacement, ...(kind === 'timeline' ? { timeline: DEFAULT_TIMELINE_CONFIG } : {}) },
    ]),
  ) as WidgetSettings;
}

function isValidTimelineConfig(t: unknown): t is TimelineConfig {
  const c = t as Partial<TimelineConfig> | undefined;
  return (
    !!c &&
    Array.isArray(c.timeRange) &&
    c.timeRange.length === 2 &&
    c.timeRange.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    typeof c.autoPlay === 'boolean' &&
    typeof c.step === 'number' &&
    Number.isFinite(c.step) &&
    c.step > 0 &&
    typeof c.playInterval === 'number' &&
    Number.isFinite(c.playInterval) &&
    c.playInterval > 0
  );
}

/** Fills in any kind missing from a (possibly older, partial) saved settings blob. */
export function withWidgetDefaults(saved: Partial<WidgetSettings> | undefined): WidgetSettings {
  const defaults = defaultWidgetSettings();
  if (!saved) return defaults;
  for (const kind of WIDGET_KIND_ORDER) {
    const s = saved[kind];
    if (!s || typeof s.enabled !== 'boolean' || !ALL_PLACEMENTS.includes(s.placement)) continue;
    defaults[kind] = kind === 'timeline' ? { ...s, timeline: isValidTimelineConfig(s.timeline) ? s.timeline : DEFAULT_TIMELINE_CONFIG } : s;
  }
  return defaults;
}
