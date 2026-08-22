import { NODE_H, NODE_W } from "./constants";
import type { Bounds, GraphNode, Point } from "./types";

/**
 * Canvas geometry: port positions, edge curves, coordinate conversion,
 * and bounding boxes.
 */

/** Center of a node. */
export function CenterOf(node: GraphNode): Point {
  return { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 };
}

/** Output port: right edge, vertically centered. */
export function PortOut(node: GraphNode): Point {
  return { x: node.x + NODE_W, y: node.y + NODE_H / 2 };
}

/** Input port: left edge, vertically centered. */
export function PortIn(node: GraphNode): Point {
  return { x: node.x, y: node.y + NODE_H / 2 };
}

/**
 * Cubic bezier path between two ports. Control point distance grows with
 * horizontal span (capped) so long connections curve wider.
 */
export function EdgePathFromPoints(from: Point, to: Point): string {
  const controlDistance = Math.max(50, Math.min(Math.abs(to.x - from.x) * 0.5, 200));
  return `M${from.x},${from.y} C${from.x + controlDistance},${from.y} ${to.x - controlDistance},${to.y} ${to.x},${to.y}`;
}

/** SVG path for an edge between two nodes, using their ports. */
export function EdgePath(from: GraphNode, to: GraphNode): string {
  return EdgePathFromPoints(PortOut(from), PortIn(to));
}

/** Midpoint of an edge between two nodes. */
export function EdgeMidpoint(from: GraphNode, to: GraphNode): Point {
  const out = PortOut(from);
  const input = PortIn(to);
  return { x: (out.x + input.x) / 2, y: (out.y + input.y) / 2 };
}

/** Convert screen coordinates to world coordinates. */
export function ScreenToWorld(screenX: number, screenY: number, pan: Point, zoom: number): Point {
  return { x: (screenX - pan.x) / zoom, y: (screenY - pan.y) / zoom };
}

/**
 * Bounds of a node plus every descendant whose id is in memberIds, padded.
 * Returns null when there is nothing to bound.
 */
export function DescendantBounds(
  nodes: GraphNode[],
  nodeId: string,
  memberIds: Set<string>,
  pad = 20,
): Bounds | null {
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const self = nodeMap.get(nodeId);
  if (self === undefined) {
    return null;
  }
  const members = [self, ...SubtreeMembers(nodes, nodeId, memberIds, nodeMap)];
  if (members.length === 0) {
    return null;
  }
  const x1 = Math.min(...members.map(node => node.x)) - pad;
  const y1 = Math.min(...members.map(node => node.y)) - pad;
  const x2 = Math.max(...members.map(node => node.x + NODE_W)) + pad;
  const y2 = Math.max(...members.map(node => node.y + NODE_H)) + pad;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Descendants of nodeId whose id is in memberIds. */
function SubtreeMembers(
  nodes: GraphNode[],
  nodeId: string,
  memberIds: Set<string>,
  nodeMap: Map<string, GraphNode>,
): GraphNode[] {
  const childrenMap = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId === null) {
      continue;
    }
    const siblings = childrenMap.get(node.parentId) ?? [];
    siblings.push(node.id);
    childrenMap.set(node.parentId, siblings);
  }
  const members: GraphNode[] = [];
  const visited = new Set<string>([nodeId]);
  const visit = (id: string): void => {
    for (const childId of childrenMap.get(id) ?? []) {
      if (visited.has(childId)) {
        continue;
      }
      visited.add(childId);
      const child = nodeMap.get(childId);
      if (child !== undefined && memberIds.has(childId)) {
        members.push(child);
      }
      visit(childId);
    }
  };
  visit(nodeId);
  return members;
}

/** Bounds enclosing all nodes, padded. Falls back to a default canvas. */
export function WorldBounds(nodes: GraphNode[]): Bounds {
  if (nodes.length === 0) {
    return { x: 0, y: 0, w: 800, h: 600 };
  }
  const pad = 80;
  const x1 = Math.min(...nodes.map(node => node.x)) - pad;
  const y1 = Math.min(...nodes.map(node => node.y)) - pad;
  const x2 = Math.max(...nodes.map(node => node.x + NODE_W)) + pad;
  const y2 = Math.max(...nodes.map(node => node.y + NODE_H)) + pad;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Bounds of the nodes currently rendered on the canvas.
 * Used for "fit to view".
 */
export function VisibleBounds(nodes: GraphNode[], rendered: Set<string>): Bounds {
  const visible = nodes.filter(node => rendered.has(node.id));
  if (visible.length === 0) {
    return { x: 0, y: 0, w: 800, h: 600 };
  }

  const pad = 80;
  const x1 = Math.min(...visible.map(node => node.x)) - pad;
  const y1 = Math.min(...visible.map(node => node.y)) - pad;
  const x2 = Math.max(...visible.map(node => node.x + NODE_W)) + pad;
  const y2 = Math.max(...visible.map(node => node.y + NODE_H)) + pad;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
