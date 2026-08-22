import { GROUP_CARD_H, NODE_H, NODE_W } from "./constants";
import type { Bounds, GraphGroup, GraphNode, Point } from "./types";

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
 * Bounds of the nodes in one group, padded. Returns null when the group has
 * no members.
 */
export function GroupBounds(nodes: GraphNode[], groupId: string, pad = 20): Bounds | null {
  const members = nodes.filter(node => node.group === groupId);
  if (members.length === 0) {
    return null;
  }
  const x1 = Math.min(...members.map(node => node.x)) - pad;
  const y1 = Math.min(...members.map(node => node.y)) - pad - 22;
  const x2 = Math.max(...members.map(node => node.x + NODE_W)) + pad;
  const y2 = Math.max(...members.map(node => node.y + NODE_H)) + pad;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
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
 * Bounds of everything currently visible: unhidden nodes plus group cards.
 * Used for "fit to view".
 */
export function VisibleBounds(nodes: GraphNode[], groups: GraphGroup[]): Bounds {
  const groupMap = new Map(groups.map(group => [group.id, group]));
  const visible = nodes.filter(node => {
    if (node.group === null) {
      return true;
    }
    const group = groupMap.get(node.group);
    return group === undefined || group.collapsed !== true;
  });

  const points = [
    ...visible.map(node => ({ x: node.x, y: node.y, height: NODE_H })),
    ...groups
      .filter(group => group.x !== null && group.x !== undefined)
      .map(group => ({ x: group.x as number, y: (group.y as number) || 0, height: GROUP_CARD_H })),
  ];
  if (points.length === 0) {
    return { x: 0, y: 0, w: 800, h: 600 };
  }

  const pad = 80;
  const x1 = Math.min(...points.map(point => point.x)) - pad;
  const y1 = Math.min(...points.map(point => point.y)) - pad;
  const x2 = Math.max(...points.map(point => point.x)) + NODE_W + pad;
  const y2 = Math.max(...points.map(point => point.y + point.height)) + pad;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
