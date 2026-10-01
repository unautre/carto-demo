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
} from '@deck.gl/widgets';
import type { WidgetConfig, WidgetKind, WidgetSettings } from './types';

/** Extra context a widget's factory may need beyond its placement. */
export interface WidgetCreateContext {
  /** View state ResetViewWidget returns to; falls back to deck.gl's own (usually unhelpful) default without this. */
  initialViewState: MapViewState;
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
};

export const WIDGET_KIND_ORDER: WidgetKind[] = ['zoom', 'compass', 'resetView', 'gimbal', 'fullscreen', 'screenshot', 'theme', 'loading', 'scale'];

export const PLACEMENTS: WidgetPlacement[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export function defaultWidgetSettings(): WidgetSettings {
  return Object.fromEntries(
    WIDGET_KIND_ORDER.map((kind): [WidgetKind, WidgetConfig] => [kind, { enabled: false, placement: WIDGET_KINDS[kind].defaultPlacement }]),
  ) as WidgetSettings;
}

/** Fills in any kind missing from a (possibly older, partial) saved settings blob. */
export function withWidgetDefaults(saved: Partial<WidgetSettings> | undefined): WidgetSettings {
  const defaults = defaultWidgetSettings();
  if (!saved) return defaults;
  for (const kind of WIDGET_KIND_ORDER) {
    const s = saved[kind];
    if (s && typeof s.enabled === 'boolean' && PLACEMENTS.includes(s.placement)) defaults[kind] = s;
  }
  return defaults;
}
