import { NODE_H, NODE_W } from "./constants";
import type { GraphEdge, GraphNode, IngestFileEntry, LayoutResult } from "./types";

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

/**
 * Simple grid auto-layout (kept as fallback). Returns one position per
 * entry, in order.
 */
export function AutoLayoutGrid(entries: IngestFileEntry[]): { x: number; y: number }[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
  const xGap = NODE_W + 80;
  const yGap = NODE_H + 60;
  return entries.map((_, index) => ({
    x: (index % cols) * xGap + 60,
    y: Math.floor(index / cols) * yGap + 60,
  }));
}
