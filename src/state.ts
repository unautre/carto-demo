import { useEffect, useReducer } from 'react';
import type { WidgetPlacement } from '@deck.gl/core';
import { defaultTree, makeGroup } from './catalog';
import { BASEMAPS, type BasemapId } from './deckLayers';
import { findNode, moveNode, removeNode, setAllVisible, ungroup, updateNode } from './tree';
import { defaultWidgetSettings, withWidgetDefaults } from './widgetCatalog';
import type { DropPosition, LayerNode, TreeNode, WidgetKind, WidgetSettings } from './types';

export interface AppState {
  tree: TreeNode[];
  basemap: BasemapId;
  widgets: WidgetSettings;
}

export type Action =
  | { type: 'add'; node: TreeNode }
  | { type: 'addGroup'; name: string }
  | { type: 'update'; id: string; patch: Partial<TreeNode> }
  | { type: 'updateStyle'; id: string; patch: Partial<LayerNode['style']> }
  | { type: 'toggle'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'ungroup'; id: string }
  | { type: 'move'; id: string; targetId: string; position: DropPosition }
  | { type: 'setAllVisible'; visible: boolean }
  | { type: 'setChildrenVisible'; id: string; visible: boolean }
  | { type: 'setBasemap'; basemap: BasemapId }
  | { type: 'toggleWidget'; kind: WidgetKind }
  | { type: 'setWidgetPlacement'; kind: WidgetKind; placement: WidgetPlacement }
  | { type: 'reset' };

function reducer(state: AppState, action: Action): AppState {
  const tree = state.tree;
  switch (action.type) {
    case 'add':
      // New items go to the top of the list, i.e. drawn above everything else.
      return { ...state, tree: [action.node, ...tree] };
    case 'addGroup':
      return { ...state, tree: [makeGroup(action.name), ...tree] };
    case 'update':
      return { ...state, tree: updateNode(tree, action.id, action.patch) };
    case 'updateStyle': {
      const node = findNode(tree, action.id);
      if (node?.type !== 'layer') return state;
      return { ...state, tree: updateNode<LayerNode>(tree, action.id, { style: { ...node.style, ...action.patch } }) };
    }
    case 'toggle': {
      const node = findNode(tree, action.id);
      return node ? { ...state, tree: updateNode(tree, action.id, { visible: !node.visible }) } : state;
    }
    case 'remove':
      return { ...state, tree: removeNode(tree, action.id)[0] };
    case 'ungroup':
      return { ...state, tree: ungroup(tree, action.id) };
    case 'move':
      return { ...state, tree: moveNode(tree, action.id, action.targetId, action.position) };
    case 'setAllVisible':
      return { ...state, tree: setAllVisible(tree, action.visible) };
    case 'setChildrenVisible': {
      const group = findNode(tree, action.id);
      if (group?.type !== 'group') return state;
      const patch = { visible: true, children: setAllVisible(group.children, action.visible) };
      return { ...state, tree: updateNode(tree, action.id, patch) };
    }
    case 'setBasemap':
      return { ...state, basemap: action.basemap };
    case 'toggleWidget': {
      const w = state.widgets[action.kind];
      return { ...state, widgets: { ...state.widgets, [action.kind]: { ...w, enabled: !w.enabled } } };
    }
    case 'setWidgetPlacement':
      return { ...state, widgets: { ...state.widgets, [action.kind]: { ...state.widgets[action.kind], placement: action.placement } } };
    case 'reset':
      return { tree: defaultTree(), basemap: 'light', widgets: defaultWidgetSettings() };
  }
}

const STORAGE_KEY = 'deckgl-layer-manager:v1';

function loadInitial(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (Array.isArray(parsed.tree)) {
        return {
          tree: parsed.tree,
          basemap: parsed.basemap in BASEMAPS ? parsed.basemap : 'light',
          widgets: withWidgetDefaults(parsed.widgets),
        };
      }
    }
  } catch {
    // storage unavailable or corrupt: fall back to defaults
  }
  return { tree: defaultTree(), basemap: 'light', widgets: defaultWidgetSettings() };
}

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota / privacy-mode errors
    }
  }, [state]);
  return [state, dispatch] as const;
}

