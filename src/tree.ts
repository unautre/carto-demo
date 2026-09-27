import type { DropPosition, GroupNode, LayerNode, TreeNode } from './types';

/** Special droppable id: appends to the end of the root list. */
export const ROOT_END = '__root_end__';

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function findNode(tree: TreeNode[], id: string): TreeNode | undefined {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.type === 'group') {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** True if `id` is `ancestorId` itself or lives somewhere below it. */
export function isSelfOrDescendant(tree: TreeNode[], ancestorId: string, id: string): boolean {
  const ancestor = findNode(tree, ancestorId);
  if (!ancestor) return false;
  return ancestor.id === id || (ancestor.type === 'group' && !!findNode(ancestor.children, id));
}

export function mapTree(tree: TreeNode[], fn: (node: TreeNode) => TreeNode): TreeNode[] {
  return tree.map((node) => {
    const mapped = fn(node);
    return mapped.type === 'group' ? { ...mapped, children: mapTree(mapped.children, fn) } : mapped;
  });
}

export function updateNode<T extends TreeNode>(tree: TreeNode[], id: string, patch: Partial<T>): TreeNode[] {
  return mapTree(tree, (node) => (node.id === id ? ({ ...node, ...patch } as TreeNode) : node));
}

export function removeNode(tree: TreeNode[], id: string): [TreeNode[], TreeNode | undefined] {
  let removed: TreeNode | undefined;
  const walk = (nodes: TreeNode[]): TreeNode[] =>
    nodes.flatMap<TreeNode>((node) => {
      if (node.id === id) {
        removed = node;
        return [];
      }
      return node.type === 'group' ? [{ ...node, children: walk(node.children) }] : [node];
    });
  const next = walk(tree);
  return [next, removed];
}

export function insertNode(tree: TreeNode[], targetId: string, position: DropPosition, node: TreeNode): TreeNode[] {
  if (targetId === ROOT_END) return [...tree, node];
  const walk = (nodes: TreeNode[]): TreeNode[] =>
    nodes.flatMap((n) => {
      if (n.id === targetId) {
        if (position === 'before') return [node, n];
        if (position === 'after') return [n, node];
        if (n.type === 'group') return [{ ...n, expanded: true, children: [node, ...n.children] }];
        return [n, node];
      }
      return n.type === 'group' ? [{ ...n, children: walk(n.children) }] : [n];
    });
  return walk(tree);
}

/** Moves `id` relative to `targetId`. Returns the tree unchanged for invalid moves. */
export function moveNode(tree: TreeNode[], id: string, targetId: string, position: DropPosition): TreeNode[] {
  if (id === targetId || isSelfOrDescendant(tree, id, targetId)) return tree;
  const [without, node] = removeNode(tree, id);
  if (!node) return tree;
  return insertNode(without, targetId, position, node);
}

/** Replaces a group by its children, in place. */
export function ungroup(tree: TreeNode[], groupId: string): TreeNode[] {
  return tree.flatMap((node) => {
    if (node.id === groupId && node.type === 'group') return node.children;
    return node.type === 'group' ? [{ ...node, children: ungroup(node.children, groupId) }] : [node];
  });
}

export function setAllVisible(tree: TreeNode[], visible: boolean): TreeNode[] {
  return mapTree(tree, (node) => ({ ...node, visible }));
}

export function allLayers(tree: TreeNode[]): LayerNode[] {
  return tree.flatMap((node) => (node.type === 'group' ? allLayers(node.children) : [node]));
}

/**
 * Layers that should be drawn, in deck.gl draw order (bottom first).
 * The panel lists the top-most layer first, like most GIS tools, so the order is reversed.
 * A layer is drawn only if it and every enclosing group are checked.
 */
export function renderOrder(tree: TreeNode[]): LayerNode[] {
  const visible = (nodes: TreeNode[]): LayerNode[] =>
    nodes.flatMap((node) => {
      if (!node.visible) return [];
      return node.type === 'group' ? visible(node.children) : [node];
    });
  return visible(tree).reverse();
}

/** 'on' | 'off' | 'mixed' for a group's descendants, used to show an indeterminate hint. */
export function descendantState(group: GroupNode): 'on' | 'off' | 'mixed' | 'empty' {
  const layers = allLayers(group.children);
  if (layers.length === 0) return 'empty';
  const on = layers.filter((l) => l.visible).length;
  if (on === 0) return 'off';
  return on === layers.length ? 'on' : 'mixed';
}
