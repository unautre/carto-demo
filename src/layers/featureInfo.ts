import type { PickingInfo } from '@deck.gl/core';
import { InfoWidget } from '@deck.gl/widgets';
import type { LayerNode } from '../types';

type Props = Record<string, unknown>;

/** Layers whose features open a property popup on click (instead of a hover tooltip). */
export const clickInfoKinds = new Set<LayerNode['kind']>(['wfs', 'clickhouse']);

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function popupContent(node: LayerNode, feature: { id?: unknown; properties?: Props | null }, close: () => void): HTMLElement {
  const root = el('div', 'feature-info');

  const head = el('div', 'feature-info-head');
  const title = el('div', 'feature-info-title');
  title.append(el('strong', undefined, node.name));
  if (feature.id !== undefined && feature.id !== null) title.append(el('span', 'muted', String(feature.id)));
  const closeBtn = el('button', 'icon-btn feature-info-close', '✕');
  closeBtn.type = 'button';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', close);
  head.append(title, closeBtn);
  root.append(head);

  const entries = Object.entries(feature.properties ?? {});
  if (!entries.length) {
    root.append(el('div', 'muted', 'No properties'));
    return root;
  }
  const table = el('table', 'feature-info-table');
  for (const [k, v] of entries) {
    const tr = el('tr');
    tr.append(el('th', undefined, k), el('td', undefined, formatValue(v)));
    table.append(tr);
  }
  const body = el('div', 'feature-info-body');
  body.append(table);
  root.append(body);
  return root;
}

/**
 * deck.gl InfoWidget in click mode: clicking a feature of a `clickInfoKinds` layer opens a popup
 * with all its properties, anchored to the clicked point; clicking elsewhere closes it.
 */
export function createFeatureInfoWidget(findNode: (layerId: string) => LayerNode | undefined) {
  let openLayerId: string | null = null;

  const widget = new InfoWidget({
    id: 'feature-info',
    mode: 'click',
    placement: 'top',
    getTooltip: (info: PickingInfo) => {
      console.log('DBG getTooltip', info.layer?.id, !!info.object, info.coordinate);
      openLayerId = null;
      const node = info.layer ? findNode(info.layer.id) : undefined;
      if (!info.object || !node || !clickInfoKinds.has(node.kind)) return null;
      openLayerId = node.id;
      return { element: popupContent(node, info.object, close), className: 'feature-info-popup' };
    },
  });

  function close() {
    openLayerId = null;
    widget.tooltip = null;
    widget.updateHTML();
  }

  return {
    widget,
    close,
    /** Close the popup if its layer is no longer drawn (hidden or removed). */
    closeUnless(drawnIds: Set<string>) {
      if (openLayerId && !drawnIds.has(openLayerId)) close();
    },
  };
}
