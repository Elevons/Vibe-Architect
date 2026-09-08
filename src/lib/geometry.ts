import { NODE_H, NODE_W } from "./constants";
import type { Bounds, GraphEdge, GraphNode, NodeSize, Point, PortSide } from "./types";

/**
 * Canvas geometry: port positions, edge curves, coordinate conversion,
 * and bounding boxes.
 *
 * Card heights are variable (descriptions, action rows, edit forms grow
 * the box), so port math takes an optional measured size and falls back to
 * the default card dimensions when one is not available yet.
 */

/** Width of a card, measured or default. */
function widthOf(size?: NodeSize): number {
  return size?.width ?? NODE_W;
}

/** Height of a card, measured or default. */
function heightOf(size?: NodeSize): number {
  return size?.height ?? NODE_H;
}

/** Center of a node. */
export function CenterOf(node: GraphNode, size?: NodeSize): Point {
  return { x: node.x + widthOf(size) / 2, y: node.y + heightOf(size) / 2 };
}

/** Output port: bottom edge, horizontally centered. */
export function PortOut(node: GraphNode, size?: NodeSize): Point {
  return { x: node.x + widthOf(size) / 2, y: node.y + heightOf(size) };
}

/** Input port: top edge, horizontally centered. */
export function PortIn(node: GraphNode, size?: NodeSize): Point {
  return { x: node.x + widthOf(size) / 2, y: node.y };
}

/** Left port: left edge, vertically centered. */
export function PortLeft(node: GraphNode, size?: NodeSize): Point {
  return { x: node.x, y: node.y + heightOf(size) / 2 };
}

/** Right port: right edge, vertically centered. */
export function PortRight(node: GraphNode, size?: NodeSize): Point {
  return { x: node.x + widthOf(size), y: node.y + heightOf(size) / 2 };
}

/** Port position for a given side; absent side falls back to the top port. */
export function PortForSide(node: GraphNode, side: PortSide | undefined, size?: NodeSize): Point {
  if (side === "bottom") {
    return PortOut(node, size);
  }
  if (side === "left") {
    return PortLeft(node, size);
  }
  if (side === "right") {
    return PortRight(node, size);
  }
  return PortIn(node, size);
}

/**
 * Cubic bezier path between two port positions. Control points extend along
 * the dominant axis of travel, so horizontal connections bow sideways and
 * vertical ones flow top to bottom (the legacy grouping look).
 */
export function EdgePathFromPoints(from: Point,to: Point): string {
  const dX = to.x - from.x;
  const dY = to.y - from.y;
  const horizontal = Math.abs(dX) >= Math.abs(dY);
  const span = horizontal ? Math.abs(dX) : Math.abs(dY);
  const controlDistance = Math.max(50, Math.min(span * 0.5, 200));
  const sign = horizontal ? Math.sign(dX) : Math.sign(dY);
  if (horizontal) {
    return `M${from.x},${from.y} C${from.x + controlDistance * sign},${from.y} ${to.x - controlDistance * sign},${to.y} ${to.x},${to.y}`;
  }
  return `M${from.x},${from.y} C${from.x},${from.y + controlDistance * sign} ${to.x},${to.y - controlDistance * sign} ${to.x},${to.y}`;
}

/** Port from which an edge leaves:the chosen side,falling back to bottom. */
export function EdgeSourcePoint(edge: GraphEdge, node: GraphNode, size?: NodeSize): Point {
  if (edge.fromSide !== undefined) {
    return PortForSide(node, edge.fromSide, size);
  }
  return PortOut(node, size);
}

/** Port at which an edge arrives:the chosen side,falling back to top. */
export function EdgeTargetPoint(edge: GraphEdge, node: GraphNode, size?: NodeSize): Point {
  return PortForSide(node, edge.toSide, size);
}

/** SVG path for an edge between two nodes, using their ports. */
export function EdgePath(from: GraphNode, to: GraphNode, fromSize?: NodeSize, toSize?: NodeSize): string {
  return EdgePathFromPoints(PortOut(from, fromSize), PortIn(to, toSize));
}

/**
 * Path for an object→component attachment noodle. Both endpoints anchor at
 * the node's top (input) edge, so the curve bows sideways between them rather
 * than flowing top-to-bottom like a grouping edge.
 */
export function AttachmentEdgePath(from: GraphNode, to: GraphNode, fromSize?: NodeSize, toSize?: NodeSize): string {
  const a = PortIn(from, fromSize);
  const b = PortIn(to, toSize);
  const run = Math.max(20, Math.abs(b.x - a.x) * 0.5);
  return `M${a.x},${a.y} C${a.x + run},${a.y} ${b.x - run},${b.y} ${b.x},${b.y}`;
}

/** Midpoint of an edge between two nodes. */
export function EdgeMidpoint(from: GraphNode, to: GraphNode, fromSize?: NodeSize, toSize?: NodeSize): Point {
  const out = PortOut(from, fromSize);
  const input = PortIn(to, toSize);
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
  sizes?: Record<string, NodeSize>,
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
  const x2 = Math.max(...members.map(node => node.x + widthOf(sizes?.[node.id]))) + pad;
  const y2 = Math.max(...members.map(node => node.y + heightOf(sizes?.[node.id]))) + pad;
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
export function WorldBounds(nodes: GraphNode[], sizes?: Record<string, NodeSize>): Bounds {
  if (nodes.length === 0) {
    return { x: 0, y: 0, w: 800, h: 600 };
  }
  const pad = 80;
  const x1 = Math.min(...nodes.map(node => node.x)) - pad;
  const y1 = Math.min(...nodes.map(node => node.y)) - pad;
  const x2 = Math.max(...nodes.map(node => node.x + widthOf(sizes?.[node.id]))) + pad;
  const y2 = Math.max(...nodes.map(node => node.y + heightOf(sizes?.[node.id]))) + pad;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Bounds of the nodes currently rendered on the canvas.
 * Used for "fit to view".
 */
export function VisibleBounds(nodes: GraphNode[], rendered: Set<string>, sizes?: Record<string, NodeSize>): Bounds {
  const visible = nodes.filter(node => rendered.has(node.id));
  if (visible.length === 0) {
    return { x: 0, y: 0, w: 800, h: 600 };
  }

  const pad = 80;
  const x1 = Math.min(...visible.map(node => node.x)) - pad;
  const y1 = Math.min(...visible.map(node => node.y)) - pad;
  const x2 = Math.max(...visible.map(node => node.x + widthOf(sizes?.[node.id]))) + pad;
  const y2 = Math.max(...visible.map(node => node.y + heightOf(sizes?.[node.id]))) + pad;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
