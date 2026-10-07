import { useEffect, useReducer } from 'react';
import type { WidgetPlacement } from '@deck.gl/core';
import { defaultTree, makeGroup, normalizeTree } from './catalog';
import { DEFAULT_BASEMAP, normalizeBasemap } from './layers/deckLayers';
import { findNode, moveNode, removeNode, setAllVisible, ungroup, updateNode } from './tree';
import { DEFAULT_TIMELINE_CONFIG, defaultWidgetSettings, withWidgetDefaults } from './widgetCatalog';
import type { BasemapConfig, DropPosition, LayerNode, TimelineConfig, TreeNode, WidgetKind, WidgetSettings } from './types';

export interface AppState {
  tree: TreeNode[];
  basemap: BasemapConfig;
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
  | { type: 'setBasemap'; patch: Partial<BasemapConfig> }
  | { type: 'toggleWidget'; kind: WidgetKind }
  | { type: 'setWidgetPlacement'; kind: WidgetKind; placement: WidgetPlacement }
  | { type: 'setTimelineConfig'; patch: Partial<TimelineConfig> }
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
      return { ...state, basemap: { ...state.basemap, ...action.patch } };
    case 'toggleWidget': {
      const w = state.widgets[action.kind];
      return { ...state, widgets: { ...state.widgets, [action.kind]: { ...w, enabled: !w.enabled } } };
    }
    case 'setWidgetPlacement':
      return { ...state, widgets: { ...state.widgets, [action.kind]: { ...state.widgets[action.kind], placement: action.placement } } };
    case 'setTimelineConfig': {
      const w = state.widgets.timeline;
      const timeline = { ...(w.timeline ?? DEFAULT_TIMELINE_CONFIG), ...action.patch };
      return { ...state, widgets: { ...state.widgets, timeline: { ...w, timeline } } };
    }
    case 'reset':
      return { tree: defaultTree(), basemap: DEFAULT_BASEMAP, widgets: defaultWidgetSettings() };
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
          tree: normalizeTree(parsed.tree),
          basemap: normalizeBasemap(parsed.basemap),
          widgets: withWidgetDefaults(parsed.widgets),
        };
      }
    }
  } catch {
    // storage unavailable or corrupt: fall back to defaults
  }
  return { tree: defaultTree(), basemap: DEFAULT_BASEMAP, widgets: defaultWidgetSettings() };
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

