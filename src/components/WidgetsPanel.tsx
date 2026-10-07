import { useEffect, useRef, useState, type Dispatch } from 'react';
import type { WidgetPlacement } from '@deck.gl/core';
import { UNIT_LABEL, UNIT_MS, UNIT_ORDER } from '../duration';
import { DEFAULT_TIMELINE_CONFIG, PLACEMENTS, WIDGET_KIND_ORDER, WIDGET_KINDS } from '../widgetCatalog';
import type { Action } from '../state';
import type { TimelineConfig, TimeUnit, WidgetSettings } from '../types';

const PLACEMENT_LABEL: Record<WidgetPlacement, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
  fill: 'Fill',
};

/** <input type="datetime-local"> wants local time, no timezone suffix. */
function toDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string, fallback: number): number {
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : fallback;
}

interface Props {
  settings: WidgetSettings;
  dispatch: Dispatch<Action>;
}

export function WidgetsPanel({ settings, dispatch }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeCount = WIDGET_KIND_ORDER.filter((k) => settings[k].enabled).length;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div className="widgets-toggle" ref={rootRef}>
      <button className={`btn ${activeCount ? 'active-count' : ''}`} onClick={() => setOpen((v) => !v)}>
        ⬚ Widgets{activeCount ? ` (${activeCount})` : ''}
      </button>
      {open && (
        <div className="widgets-menu">
          {WIDGET_KIND_ORDER.map((kind) => {
            const info = WIDGET_KINDS[kind];
            const cfg = settings[kind];
            return (
              <div className="widgets-menu-item" key={kind}>
                <div className="widgets-menu-row">
                  <label className="check" title={info.hint}>
                    <input type="checkbox" checked={cfg.enabled} onChange={() => dispatch({ type: 'toggleWidget', kind })} />
                    <span className="kind-icon" aria-hidden>{info.icon}</span>
                    {info.label}
                  </label>
                  {kind === 'timeline' ? (
                    <span className="muted" style={{ fontSize: 11 }}>Full width</span>
                  ) : (
                    <select
                      value={cfg.placement}
                      disabled={!cfg.enabled}
                      onChange={(e) => dispatch({ type: 'setWidgetPlacement', kind, placement: e.target.value as WidgetPlacement })}
                    >
                      {PLACEMENTS.map((p) => <option key={p} value={p}>{PLACEMENT_LABEL[p]}</option>)}
                    </select>
                  )}
                </div>
                {kind === 'timeline' && cfg.enabled && (
                  <TimelineSettings timeline={cfg.timeline ?? DEFAULT_TIMELINE_CONFIG} dispatch={dispatch} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimelineSettings({ timeline, dispatch }: { timeline: TimelineConfig; dispatch: Dispatch<Action> }) {
  const set = (patch: Partial<TimelineConfig>) => dispatch({ type: 'setTimelineConfig', patch });
  return (
    <div className="widgets-menu-sub">
      <div className="field-row">
        <label className="field">
          <span>From</span>
          <input
            type="datetime-local"
            value={toDatetimeLocal(timeline.timeRange[0])}
            onChange={(e) => set({ timeRange: [fromDatetimeLocal(e.target.value, timeline.timeRange[0]), timeline.timeRange[1]] })}
          />
        </label>
        <label className="field">
          <span>To</span>
          <input
            type="datetime-local"
            value={toDatetimeLocal(timeline.timeRange[1])}
            onChange={(e) => set({ timeRange: [timeline.timeRange[0], fromDatetimeLocal(e.target.value, timeline.timeRange[1])] })}
          />
        </label>
      </div>
      <button
        type="button"
        className="btn small"
        onClick={() => {
          const now = Date.now();
          set({ timeRange: [now - UNIT_MS.days, now] });
        }}
      >
        Last 24h
      </button>
      <div className="field-row">
        <label className="field narrow">
          <span>Step</span>
          <input
            type="number"
            min={0}
            value={timeline.step.value}
            onChange={(e) => set({ step: { ...timeline.step, value: Math.max(0, +e.target.value || 0) } })}
          />
        </label>
        <label className="field narrow">
          <span>Unit</span>
          <select value={timeline.step.unit} onChange={(e) => set({ step: { ...timeline.step, unit: e.target.value as TimeUnit } })}>
            {UNIT_ORDER.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field narrow">
          <span>Interval (ms)</span>
          <input type="number" min={1} value={timeline.playInterval} onChange={(e) => set({ playInterval: Math.max(1, +e.target.value || 1) })} />
        </label>
      </div>
      <p className="muted hint">Auto-play advances the slider by Step every Interval ms of real time — together, the play speed.</p>
      <label className="check">
        <input type="checkbox" checked={timeline.autoPlay} onChange={(e) => set({ autoPlay: e.target.checked })} />
        Auto-play (loops over the range)
      </label>
    </div>
  );
}
