import { NODE_H, NODE_W } from "./constants";
import type { GraphEdge, GraphNode, IngestFileEntry, LayoutResult, Point } from "./types";

/**
 * Automatic layout: Sugiyama-style DAG arrangement.
 *
 * 1. Assign layers by longest path from roots
 * 2. Order within layers to minimize crossings (barycenter heuristic)
 * 3. Position: layers = Y, order within layer = X
 */

const LAYOUT_X_GAP = NODE_W + 40;
const LAYOUT_Y_GAP = NODE_H + 50;
const LAYOUT_START = 60;
const BARYCENTER_PASSES = 6;

/** Display key for sorting: prefer the path, fall back to the name. */
function SortKeyOf(node: GraphNode): string {
  return node.path || node.name || "";
}

/**
 * Lay out all nodes as a top-to-bottom DAG: each layer is a horizontal
 * row, and edges flow downward from a layer to the next. Cycles are
 * tolerated. Hierarchy (parent/child) does not affect positioning — nodes
 * keep free world coordinates.
 */
export function DagLayout(nodes: GraphNode[], edges: GraphEdge[]): LayoutResult {
  if (nodes.length === 0) {
    return { nodes };
  }

  // ── 1. Build adjacency ──
  const ids = new Set(nodes.map(node => node.id));
  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  for (const node of nodes) {
    forward.set(node.id, []);
    reverse.set(node.id, []);
  }
  for (const edge of edges) {
    if (ids.has(edge.from) && ids.has(edge.to)) {
      forward.get(edge.from)?.push(edge.to);
      reverse.get(edge.to)?.push(edge.from);
    }
  }

  // ── 2. Layer assignment (longest path from any root) ──
  const layer = new Map<string, number>();
  const visited = new Set<string>();
  const assignLayer = (id: string, depth: number): void => {
    if (visited.has(id) && (layer.get(id) ?? 0) >= depth) {
      return;
    }
    visited.add(id);
    layer.set(id, Math.max(layer.get(id) ?? 0, depth));
    for (const target of forward.get(id) ?? []) {
      assignLayer(target, depth + 1);
    }
  };

  const roots = nodes.filter(node => (reverse.get(node.id) ?? []).length === 0);
  if (roots.length > 0) {
    for (const root of roots) {
      assignLayer(root.id, 0);
    }
  } else {
    for (const node of nodes) {
      assignLayer(node.id, 0);
    }
  }
  for (const node of nodes) {
    if (layer.get(node.id) === undefined) {
      layer.set(node.id, 0);
    }
  }

  // ── 3. Bucket into layers, initial order alphabetical ──
  const maxLayer = Math.max(...Array.from(layer.values()));
  const layers: GraphNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const node of nodes) {
    layers[layer.get(node.id) ?? 0].push(node);
  }
  for (const layerNodes of layers) {
    layerNodes.sort((a, b) => SortKeyOf(a).localeCompare(SortKeyOf(b)));
  }

  // ── 4. Barycenter crossing minimization (several passes) ──
  const orderIndex = (layerNodes: GraphNode[]): Map<string, number> => {
    const index = new Map<string, number>();
    layerNodes.forEach((node, indexValue) => index.set(node.id, indexValue));
    return index;
  };

  for (let pass = 0; pass < BARYCENTER_PASSES; pass += 1) {
    // Top-down pass.
    for (let layerIndex = 1; layerIndex < layers.length; layerIndex += 1) {
      const previousIndex = orderIndex(layers[layerIndex - 1]);
      layers[layerIndex].sort((a, b) => {
        const parentsA = (reverse.get(a.id) ?? []).filter(parent => previousIndex.has(parent));
        const parentsB = (reverse.get(b.id) ?? []).filter(parent => previousIndex.has(parent));
        const barycenterA = parentsA.length > 0
          ? parentsA.reduce((sum, parent) => sum + (previousIndex.get(parent) ?? 0), 0) / parentsA.length
          : Infinity;
        const barycenterB = parentsB.length > 0
          ? parentsB.reduce((sum, parent) => sum + (previousIndex.get(parent) ?? 0), 0) / parentsB.length
          : Infinity;
        return (barycenterA - barycenterB) || SortKeyOf(a).localeCompare(SortKeyOf(b));
      });
    }
    // Bottom-up pass.
    for (let layerIndex = layers.length - 2; layerIndex >= 0; layerIndex -= 1) {
      const nextIndex = orderIndex(layers[layerIndex + 1]);
      layers[layerIndex].sort((a, b) => {
        const childrenA = (forward.get(a.id) ?? []).filter(child => nextIndex.has(child));
        const childrenB = (forward.get(b.id) ?? []).filter(child => nextIndex.has(child));
        const barycenterA = childrenA.length > 0
          ? childrenA.reduce((sum, child) => sum + (nextIndex.get(child) ?? 0), 0) / childrenA.length
          : Infinity;
        const barycenterB = childrenB.length > 0
          ? childrenB.reduce((sum, child) => sum + (nextIndex.get(child) ?? 0), 0) / childrenB.length
          : Infinity;
        return (barycenterA - barycenterB) || SortKeyOf(a).localeCompare(SortKeyOf(b));
      });
    }
  }

  // ── 5. Assign positions (left-aligned rows) ──
  const positions = new Map<string, { x: number; y: number }>();
  layers.forEach((layerNodes, layerIndex) => {
    layerNodes.forEach((node, positionInLayer) => {
      positions.set(node.id, {
        x: LAYOUT_START + positionInLayer * LAYOUT_X_GAP,
        y: LAYOUT_START + layerIndex * LAYOUT_Y_GAP,
      });
    });
  });

  return {
    nodes: nodes.map(node => ({
      ...node,
      x: positions.get(node.id)?.x ?? node.x,
      y: positions.get(node.id)?.y ?? node.y,
    })),
  };
}

const TIDY_SIBLING_GAP_X = 40;
const TIDY_SIBLING_GAP_Y = 44;
const TIDY_LEVEL_GAP_Y = 70;
const TIDY_ROOT_GAP_X = 90;
const TIDY_ROOT_GAP_Y = 90;

/** A laid-out subtree: its size and the position of every node inside it. */
interface LayoutBlock {
  width: number;
  height: number;
  positions: Map<string, Point>;
}

/** One row of sibling blocks plus the row's measured size. */
interface LayoutRow {
  blocks: LayoutBlock[];
  width: number;
  height: number;
  gapX: number;
}

/** Direct children of every parent, preserving input order. */
function ChildrenByParent(nodes: GraphNode[]): Map<string, GraphNode[]> {
  const childrenByParent = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    if (node.parentId === null) {
      continue;
    }
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }
  return childrenByParent;
}

/** Pack blocks into left-aligned rows, wrapping before `maxWidth`. */
function PackRows(blocks: LayoutBlock[], gapX: number, maxWidth: number): LayoutRow[] {
  const rows: LayoutRow[] = [];
  let currentBlocks: LayoutBlock[] = [];
  let currentWidth = 0;
  for (const block of blocks) {
    const widthWithGap = currentBlocks.length === 0 ? block.width : currentWidth + gapX + block.width;
    if (currentBlocks.length > 0 && widthWithGap > maxWidth) {
      rows.push({
        blocks: currentBlocks,
        width: currentWidth,
        height: Math.max(...currentBlocks.map(entry => entry.height)),
        gapX,
      });
      currentBlocks = [];
      currentWidth = 0;
    }
    currentWidth = currentBlocks.length === 0 ? block.width : currentWidth + gapX + block.width;
    currentBlocks.push(block);
  }
  if (currentBlocks.length > 0) {
    rows.push({
      blocks: currentBlocks,
      width: currentWidth,
      height: Math.max(...currentBlocks.map(entry => entry.height)),
      gapX,
    });
  }
  return rows;
}

/** Stack the rows vertically, offsetting every block's positions into place. */
function StackRows(rows: LayoutRow[], gapY: number): LayoutBlock {
  const positions = new Map<string, Point>();
  let rowY = 0;
  let width = 0;
  for (const row of rows) {
    let blockX = 0;
    for (const block of row.blocks) {
      for (const [id, position] of block.positions) {
        positions.set(id, { x: blockX + position.x, y: rowY + position.y });
      }
      blockX += block.width + row.gapX;
    }
    width = Math.max(width, row.width);
    rowY += row.height + gapY;
  }
  const height = rowY > 0 ? rowY - gapY : 0;
  return { width, height, positions };
}

/**
 * Lay a node and its descendants out as a nested block: the node sits above
 * a wrapped grid of its children's own blocks, so folders stay visually
 * grouped instead of being flattened into one very wide row.
 */
function LayoutSubtree(
  node: GraphNode,
  childrenByParent: Map<string, GraphNode[]>,
  placed: Set<string>,
  rowWidth: number,
): LayoutBlock {
  placed.add(node.id);
  const positions = new Map<string, Point>();
  positions.set(node.id, { x: 0, y: 0 });

  const children = (childrenByParent.get(node.id) ?? []).filter(child => !placed.has(child.id));
  if (children.length === 0) {
    return { width: NODE_W, height: NODE_H, positions };
  }

  const childBlocks = children
    .map(child => LayoutSubtree(child, childrenByParent, placed, rowWidth))
    .filter(block => block.positions.size > 0);
  const rows = PackRows(childBlocks, TIDY_SIBLING_GAP_X, rowWidth);
  const childrenArea = StackRows(rows, TIDY_SIBLING_GAP_Y);
  if (childrenArea.positions.size === 0) {
    return { width: NODE_W, height: NODE_H, positions };
  }

  const blockWidth = Math.max(NODE_W, childrenArea.width);
  positions.set(node.id, { x: (blockWidth - NODE_W) / 2, y: 0 });
  for (const [id, position] of childrenArea.positions) {
    positions.set(id, { x: position.x, y: NODE_H + TIDY_LEVEL_GAP_Y + position.y });
  }
  return { width: blockWidth, height: NODE_H + TIDY_LEVEL_GAP_Y + childrenArea.height, positions };
}

/**
 * Hierarchy-aware tidy layout: every node sits above the children it groups,
 * so folder boxes and their noodles stay meaningful. Child grids wrap at a
 * readable width instead of stretching into a single screen-wide row.
 */
export function HierarchyLayout(nodes: GraphNode[]): LayoutResult {
  if (nodes.length === 0) {
    return { nodes };
  }

  const ids = new Set(nodes.map(node => node.id));
  const childrenByParent = ChildrenByParent(nodes);
  const sortKey = (node: GraphNode): string => node.path || node.name || "";
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => sortKey(left).localeCompare(sortKey(right)));
  }

  const ordered = nodes.slice().sort((left, right) => sortKey(left).localeCompare(sortKey(right)));
  const roots = ordered.filter(node => node.parentId === null || !ids.has(node.parentId));
  const rootOrder = roots.length > 0 ? roots : ordered;
  const rowWidth = Math.max(NODE_W * 3, Math.ceil(Math.sqrt(nodes.length)) * (NODE_W + TIDY_SIBLING_GAP_X));

  const placed = new Set<string>();
  const rootBlocks: LayoutBlock[] = [];
  for (const root of rootOrder) {
    if (placed.has(root.id)) {
      continue;
    }
    rootBlocks.push(LayoutSubtree(root, childrenByParent, placed, rowWidth));
  }
  // A parent cycle leaves no reachable roots; lay the leftovers out anyway.
  for (const node of ordered) {
    if (placed.has(node.id)) {
      continue;
    }
    rootBlocks.push(LayoutSubtree(node, childrenByParent, placed, rowWidth));
  }

  const rootRows = PackRows(rootBlocks, TIDY_ROOT_GAP_X, rowWidth * 1.6);
  const graph = StackRows(rootRows, TIDY_ROOT_GAP_Y);
  const minX = Math.min(...Array.from(graph.positions.values()).map(position => position.x));
  const minY = Math.min(...Array.from(graph.positions.values()).map(position => position.y));

  return {
    nodes: nodes.map(node => {
      const position = graph.positions.get(node.id);
      if (position === undefined) {
        return node;
      }
      return { ...node, x: LAYOUT_START + position.x - minX, y: LAYOUT_START + position.y - minY };
    }),
  };
}

/**
 * Simple grid auto-layout (kept as fallback). Returns one position per
 * entry, in order.
 */
export function AutoLayoutGrid(entries: IngestFileEntry[]): { x: number; y: number }[] {  const cols = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
  const xGap = NODE_W + 80;
  const yGap = NODE_H + 60;
  return entries.map((_, index) => ({
    x: (index % cols) * xGap + 60,
    y: Math.floor(index / cols) * yGap + 60,
  }));
}
