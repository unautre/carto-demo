import { useEffect, useRef, useState, type Dispatch } from 'react';
import type { WidgetPlacement } from '@deck.gl/core';
import { PLACEMENTS, WIDGET_KIND_ORDER, WIDGET_KINDS } from '../widgetCatalog';
import type { Action } from '../state';
import type { WidgetSettings } from '../types';

const PLACEMENT_LABEL: Record<WidgetPlacement, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
  fill: 'Fill',
};

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
              <div className="widgets-menu-row" key={kind}>
                <label className="check" title={info.hint}>
                  <input type="checkbox" checked={cfg.enabled} onChange={() => dispatch({ type: 'toggleWidget', kind })} />
                  <span className="kind-icon" aria-hidden>{info.icon}</span>
                  {info.label}
                </label>
                <select
                  value={cfg.placement}
                  disabled={!cfg.enabled}
                  onChange={(e) => dispatch({ type: 'setWidgetPlacement', kind, placement: e.target.value as WidgetPlacement })}
                >
                  {PLACEMENTS.map((p) => <option key={p} value={p}>{PLACEMENT_LABEL[p]}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
