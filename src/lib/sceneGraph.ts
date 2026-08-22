import type { GraphNode } from "./types";

/**
 * Scene-graph tree operations over a flat node list.
 *
 * The hierarchy is stored as `parentId` on each node; these helpers answer
 * the questions the renderer and the editor need, all defensively guarded
 * against cycles so malformed data can never hang the UI.
 */

/** id → node lookup. */
export function BuildNodeMap(nodes: GraphNode[]): Map<string, GraphNode> {
  const nodeMap = new Map<string, GraphNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }
  return nodeMap;
}

/** parentId → child ids. */
export function BuildChildrenMap(nodes: GraphNode[]): Map<string, string[]> {
  const childrenMap = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId === null) {
      continue;
    }
    const siblings = childrenMap.get(node.parentId) ?? [];
    siblings.push(node.id);
    childrenMap.set(node.parentId, siblings);
  }
  return childrenMap;
}

/**
 * Ids of every node in the subtree rooted at nodeId, including nodeId.
 * Cycle-safe: a visited set stops any malformed parent loop.
 */
export function SubtreeIds(nodes: GraphNode[], nodeId: string): string[] {
  const childrenMap = BuildChildrenMap(nodes);
  const ids: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    ids.push(id);
    for (const childId of childrenMap.get(id) ?? []) {
      visit(childId);
    }
  };
  visit(nodeId);
  return ids;
}

/** Ids of every descendant of nodeId, excluding nodeId itself. */
export function DescendantIds(nodes: GraphNode[], nodeId: string): string[] {
  return SubtreeIds(nodes, nodeId).filter(id => id !== nodeId);
}

/** Number of descendants (not counting the node itself). */
export function DescendantCount(nodes: GraphNode[], nodeId: string): number {
  return DescendantIds(nodes, nodeId).length;
}

/**
 * True when any strict ancestor of nodeId is collapsed, i.e. the node is
 * tucked away inside a collapsed parent.
 */
export function IsTuckedAway(nodes: GraphNode[], nodeId: string): boolean {
  const nodeMap = BuildNodeMap(nodes);
  const visited = new Set<string>();
  let current = nodeMap.get(nodeId)?.parentId ?? null;
  while (current !== null && !visited.has(current)) {
    visited.add(current);
    const ancestor = nodeMap.get(current);
    if (ancestor === undefined) {
      return false;
    }
    if (ancestor.collapsed) {
      return true;
    }
    current = ancestor.parentId;
  }
  return false;
}

/**
 * Ids of every node the canvas should render: a node renders when it is
 * visible and no strict ancestor is collapsed. Computed in one pass.
 */
export function ComputeRenderedSet(nodes: GraphNode[]): Set<string> {
  const nodeMap = BuildNodeMap(nodes);
  const childrenMap = BuildChildrenMap(nodes);
  const rendered = new Set<string>();
  const visit = (id: string, tucked: boolean): void => {
    const node = nodeMap.get(id);
    if (node === undefined) {
      return;
    }
    if (!tucked && node.visible) {
      rendered.add(id);
    }
    for (const childId of childrenMap.get(id) ?? []) {
      visit(childId, tucked || node.collapsed);
    }
  };
  // Roots are true roots plus orphans (parent id missing) — the latter keep
  // their subtrees reachable when data is malformed.
  for (const node of nodes) {
    if (node.parentId === null || !nodeMap.has(node.parentId)) {
      visit(node.id, false);
    }
  }
  return rendered;
}

/** True when making newParentId the parent of nodeId would create a cycle. */
export function WouldCreateCycle(nodes: GraphNode[], nodeId: string, newParentId: string): boolean {
  if (nodeId === newParentId) {
    return true;
  }
  return SubtreeIds(nodes, nodeId).includes(newParentId);
}

/**
 * Return a new node list with nodeId re-parented to newParentId.
 * Cycle attempts are ignored (the list is returned unchanged).
 */
export function SetParent(nodes: GraphNode[], nodeId: string, newParentId: string | null): GraphNode[] {
  if (newParentId !== null && WouldCreateCycle(nodes, nodeId, newParentId)) {
    return nodes;
  }
  return nodes.map(node => (node.id === nodeId ? { ...node, parentId: newParentId } : node));
}
