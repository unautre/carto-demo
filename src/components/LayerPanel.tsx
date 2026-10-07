import { createContext, useContext, useState, type Dispatch, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { displayInfo } from '../catalog';
import { dataStore, useDataStoreVersion } from '../data';
import type { Action } from '../state';
import { allLayers, descendantState, findNode, isSelfOrDescendant, ROOT_END } from '../tree';
import type { BasemapConfig, DropTarget, GroupNode, LayerNode, TreeNode } from '../types';
import { BasemapSettings } from './BasemapSettings';
import { LayerSettings } from './LayerSettings';

interface PanelCtx {
  dispatch: Dispatch<Action>;
  onZoomTo: (node: TreeNode) => void;
  dropTarget: DropTarget | null;
  activeId: string | null;
  openSettings: string | null;
  setOpenSettings: (id: string | null) => void;
  /** epoch ms, for a 'timeline'-mode data filter's computed range — see App.tsx */
  timestamp: number;
}

const Ctx = createContext<PanelCtx>(null!);

interface Props {
  tree: TreeNode[];
  dispatch: Dispatch<Action>;
  onZoomTo: (node: TreeNode) => void;
  onAddLayer: () => void;
  timestamp: number;
  basemap: BasemapConfig;
}

export function LayerPanel({ tree, dispatch, onZoomTo, onAddLayer, timestamp, basemap }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [openSettings, setOpenSettings] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const computeTarget = (e: DragMoveEvent): DropTarget | null => {
    const { active, over } = e;
    if (!over) return null;
    const overId = String(over.id);
    if (overId === ROOT_END) return { id: ROOT_END, position: 'after' };
    if (isSelfOrDescendant(tree, String(active.id), overId)) return null;

    const start = e.activatorEvent as PointerEvent;
    const y = typeof start.clientY === 'number'
      ? start.clientY + e.delta.y
      : (active.rect.current.translated?.top ?? 0) + (active.rect.current.translated?.height ?? 0) / 2;
    const rel = (y - over.rect.top) / over.rect.height;
    const node = findNode(tree, overId);
    if (node?.type === 'group') {
      // Top quarter: before. Otherwise inside, except the bottom quarter of a collapsed group: after.
      if (rel < 0.25) return { id: overId, position: 'before' };
      if (rel > 0.75 && !node.expanded) return { id: overId, position: 'after' };
      return { id: overId, position: 'inside' };
    }
    return { id: overId, position: rel < 0.5 ? 'before' : 'after' };
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragMove = (e: DragMoveEvent) => {
    const next = computeTarget(e);
    setDropTarget((prev) => (prev?.id === next?.id && prev?.position === next?.position ? prev : next));
  };
  const onDragEnd = (e: DragEndEvent) => {
    const target = computeTarget(e);
    if (target) dispatch({ type: 'move', id: String(e.active.id), targetId: target.id, position: target.position });
    setActiveId(null);
    setDropTarget(null);
  };
  const onDragCancel = () => {
    setActiveId(null);
    setDropTarget(null);
  };

  const activeNode = activeId ? findNode(tree, activeId) : undefined;
  const layers = allLayers(tree);
  const visibleCount = layers.filter((l) => l.visible).length;

  return (
    <Ctx.Provider value={{ dispatch, onZoomTo, dropTarget, activeId, openSettings, setOpenSettings, timestamp }}>
      <aside className="panel">
        <header className="panel-header">
          <div className="panel-title">
            <h1>Layers</h1>
            <span className="muted">{visibleCount}/{layers.length} shown</span>
          </div>
          <div className="toolbar">
            <button className="btn primary" onClick={onAddLayer}>+ Layer</button>
            <button className="btn" onClick={() => dispatch({ type: 'addGroup', name: 'New group' })}>+ Group</button>
            <span className="spacer" />
            <button className="btn ghost" title="Check every layer and group" onClick={() => dispatch({ type: 'setAllVisible', visible: true })}>All</button>
            <button className="btn ghost" title="Uncheck every layer and group" onClick={() => dispatch({ type: 'setAllVisible', visible: false })}>None</button>
          </div>
        </header>

        <BasemapSettings basemap={basemap} dispatch={dispatch} />

        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="tree" role="tree">
            {tree.length === 0 && <p className="empty">No layers yet. Add one with “+ Layer”.</p>}
            {tree.map((node) => <TreeItem key={node.id} node={node} depth={0} />)}
            <RootDropZone visible={!!activeId} />
          </div>
          <DragOverlay dropAnimation={null}>
            {activeNode && <DragPreview node={activeNode} />}
          </DragOverlay>
        </DndContext>

        <footer className="panel-footer muted">
          Drag <span className="grip-inline">⋮⋮</span> to reorder · drop on a group to nest · top of list draws on top
        </footer>
      </aside>
    </Ctx.Provider>
  );
}

function RootDropZone({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_END });
  return (
    <div ref={setNodeRef} className={`root-drop ${visible ? 'show' : ''} ${isOver ? 'over' : ''}`}>
      Move to bottom (top level)
    </div>
  );
}

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  return node.type === 'group' ? <GroupItem group={node} depth={depth} /> : <LayerItem layer={node} depth={depth} />;
}

/** Draggable + droppable row shell shared by layers and groups. */
function Row({ node, depth, className, children }: { node: TreeNode; depth: number; className?: string; children: (grip: ReactNode) => ReactNode }) {
  const { dropTarget, activeId } = useContext(Ctx);
  const drag = useDraggable({ id: node.id });
  const drop = useDroppable({ id: node.id });
  const setRef = (el: HTMLElement | null) => {
    drag.setNodeRef(el);
    drop.setNodeRef(el);
  };
  const dropClass = dropTarget?.id === node.id ? `drop-${dropTarget.position}` : '';
  const grip = (
    <button className="grip" aria-label={`Drag ${node.name}`} {...drag.attributes} {...drag.listeners}>
      ⋮⋮
    </button>
  );
  return (
    <div
      ref={setRef}
      className={`row ${className ?? ''} ${dropClass} ${activeId === node.id ? 'dragging' : ''}`}
      style={{ paddingLeft: 6 + depth * 18 }}
      role="treeitem"
    >
      {children(grip)}
    </div>
  );
}

function EditableName({ node }: { node: TreeNode }) {
  const { dispatch } = useContext(Ctx);
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        className="name-input"
        autoFocus
        defaultValue={node.name}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          const name = e.currentTarget.value.trim();
          if (name) dispatch({ type: 'update', id: node.id, patch: { name } });
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <span className="name" title="Double-click to rename" onDoubleClick={() => setEditing(true)}>
      {node.name}
    </span>
  );
}

function Status({ layer }: { layer: LayerNode }) {
  useDataStoreVersion();
  const state = dataStore.get(layer);
  if (!state) return null;
  if (state.status === 'loading') return <span className="spinner" title="Loading…" />;
  if (state.status === 'error') return <span className="status error" title={state.error}>⚠</span>;
  return <span className="status muted" title={`${state.count} features`}>{compact(state.count)}</span>;
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

function LayerItem({ layer, depth }: { layer: LayerNode; depth: number }) {
  const { dispatch, onZoomTo, openSettings, setOpenSettings, timestamp } = useContext(Ctx);
  const info = displayInfo(layer);
  const open = openSettings === layer.id;
  return (
    <>
      <Row node={layer} depth={depth} className={`layer ${layer.visible ? '' : 'off'}`}>
        {(grip) => (
          <>
            {grip}
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={() => dispatch({ type: 'toggle', id: layer.id })}
              aria-label={`Show ${layer.name}`}
            />
            <span className="kind-icon" style={{ color: layer.style.color.value }} title={info.label}>{info.icon}</span>
            <EditableName node={layer} />
            <span className="kind-tag">{info.label}</span>
            <Status layer={layer} />
            <span className="actions">
              <button className="icon-btn" title="Zoom to layer" onClick={() => onZoomTo(layer)}>⌖</button>
              <button className={`icon-btn ${open ? 'active' : ''}`} title="Settings" onClick={() => setOpenSettings(open ? null : layer.id)}>⚙</button>
              <button className="icon-btn danger" title="Remove layer" onClick={() => dispatch({ type: 'remove', id: layer.id })}>✕</button>
            </span>
          </>
        )}
      </Row>
      {open && <LayerSettings layer={layer} dispatch={dispatch} depth={depth} timestamp={timestamp} />}
    </>
  );
}

function GroupItem({ group, depth }: { group: GroupNode; depth: number }) {
  const { dispatch, onZoomTo } = useContext(Ctx);
  const state = descendantState(group);
  const layerCount = allLayers(group.children).length;
  const onCount = allLayers(group.children).filter((l) => l.visible).length;
  return (
    <div className={`group ${group.visible ? '' : 'off'}`}>
      <Row node={group} depth={depth} className="group-row">
        {(grip) => (
          <>
            {grip}
            <button
              className="chevron"
              aria-expanded={group.expanded}
              onClick={() => dispatch({ type: 'update', id: group.id, patch: { expanded: !group.expanded } })}
            >
              {group.expanded ? '▾' : '▸'}
            </button>
            <input
              type="checkbox"
              checked={group.visible}
              onChange={() => dispatch({ type: 'toggle', id: group.id })}
              aria-label={`Show group ${group.name}`}
            />
            <span className="kind-icon folder">▤</span>
            <EditableName node={group} />
            <span className={`status muted ${state === 'mixed' ? 'mixed' : ''}`} title={`${onCount} of ${layerCount} layers checked`}>
              {onCount}/{layerCount}
            </span>
            <span className="actions">
              <button className="icon-btn" title="Check all layers in group" onClick={() => dispatch({ type: 'setChildrenVisible', id: group.id, visible: true })}>☑</button>
              <button className="icon-btn" title="Uncheck all layers in group" onClick={() => dispatch({ type: 'setChildrenVisible', id: group.id, visible: false })}>☐</button>
              <button className="icon-btn" title="Zoom to group" onClick={() => onZoomTo(group)}>⌖</button>
              <button className="icon-btn" title="Ungroup (keep layers)" onClick={() => dispatch({ type: 'ungroup', id: group.id })}>⇱</button>
              <button
                className="icon-btn danger"
                title="Delete group and its layers"
                onClick={() => {
                  if (layerCount === 0 || confirm(`Delete “${group.name}” and its ${layerCount} layer(s)?`)) {
                    dispatch({ type: 'remove', id: group.id });
                  }
                }}
              >
                ✕
              </button>
            </span>
          </>
        )}
      </Row>
      {group.expanded && (
        <div className="group-children">
          {group.children.length === 0 && (
            <div className="empty-group" style={{ paddingLeft: 30 + (depth + 1) * 18 }}>Empty group: drop layers here</div>
          )}
          {group.children.map((child) => <TreeItem key={child.id} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

function DragPreview({ node }: { node: TreeNode }) {
  const icon = node.type === 'group' ? '▤' : displayInfo(node).icon;
  const color = node.type === 'layer' ? node.style.color.value : undefined;
  const extra = node.type === 'group' ? ` · ${allLayers(node.children).length} layers` : '';
  return (
    <div className="drag-preview">
      <span className="kind-icon" style={{ color }}>{icon}</span>
      {node.name}
      <span className="muted">{extra}</span>
    </div>
  );
}
