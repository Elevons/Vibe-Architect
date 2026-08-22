import type { MouseEvent as ReactMouseEvent } from "react";
import { FONT, GROUP_COLORS, MINIMAP_H, MINIMAP_W, NODE_H, NODE_W, TYPE_COLORS } from "../lib/constants";
import { GroupBounds, WorldBounds } from "../lib/geometry";
import type { GraphEdge, GraphGroup, GraphNode, Point } from "../lib/types";

/**
 * Bottom-right overview map: group fills, edge lines, node rectangles, and
 * the current viewport. Clicking pans the main canvas to that point.
 */

interface MinimapProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
  groups: GraphGroup[];
  pan: Point;
  zoom: number;
  canvasW: number;
  canvasH: number;
  onPanTo: (x: number, y: number) => void;
}

const MINIMAP_PAD = 40;
const DEFAULT_CANVAS_W = 800;
const DEFAULT_CANVAS_H = 600;

export function Minimap({ nodes, edges, nodeMap, groups, pan, zoom, canvasW, canvasH, onPanTo }: MinimapProps) {
  const world = WorldBounds(nodes);
  const width = Math.max(world.w, (canvasW || DEFAULT_CANVAS_W) / zoom) + MINIMAP_PAD * 2;
  const height = Math.max(world.h, (canvasH || DEFAULT_CANVAS_H) / zoom) + MINIMAP_PAD * 2;
  const originX = Math.min(world.x, -pan.x / zoom) - MINIMAP_PAD;
  const originY = Math.min(world.y, -pan.y / zoom) - MINIMAP_PAD;
  const scale = Math.min(MINIMAP_W / width, MINIMAP_H / height);

  const toMini = (worldX: number, worldY: number): Point => ({
    x: (worldX - originX) * scale,
    y: (worldY - originY) * scale,
  });

  // Viewport rectangle in world coordinates.
  const viewportX = -pan.x / zoom;
  const viewportY = -pan.y / zoom;
  const viewportW = (canvasW || DEFAULT_CANVAS_W) / zoom;
  const viewportH = (canvasH || DEFAULT_CANVAS_H) / zoom;
  const viewportMini = toMini(viewportX, viewportY);

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const miniX = event.clientX - rect.left;
    const miniY = event.clientY - rect.top;
    const worldX = miniX / scale + originX;
    const worldY = miniY / scale + originY;
    onPanTo(-worldX * zoom + (canvasW || DEFAULT_CANVAS_W) / 2, -worldY * zoom + (canvasH || DEFAULT_CANVAS_H) / 2);
  };

  return (
    <div
      data-nodecard="true"
      onClick={handleClick}
      onMouseDown={event => event.stopPropagation()}
      style={{
        position: "absolute", bottom: 12, right: 12, width: MINIMAP_W, height: MINIMAP_H,
        background: "#0d0d10e8", border: "1px solid #2a2a2f", borderRadius: 8,
        overflow: "hidden", cursor: "crosshair", zIndex: 50, backdropFilter: "blur(8px)",
      }}
    >
      <svg width={MINIMAP_W} height={MINIMAP_H}>
        {renderGroupRects(nodes, groups, toMini, scale)}
        {renderEdgeLines(edges, nodeMap, toMini)}
        {renderNodeRects(nodes, toMini, scale)}
        <rect
          x={viewportMini.x}
          y={viewportMini.y}
          width={Math.max(viewportW * scale, 8)}
          height={Math.max(viewportH * scale, 6)}
          fill="none"
          stroke="#818cf8"
          strokeWidth={1.5}
          rx={2}
          opacity={0.7}
        />
      </svg>
      <span style={{
        position: "absolute", top: 4, left: 6, fontSize: 8, color: "#555", fontFamily: FONT,
        letterSpacing: "0.05em", textTransform: "uppercase", pointerEvents: "none",
      }}>minimap</span>
    </div>
  );
}

/** Semi-transparent fill behind each group's members. */
function renderGroupRects(
  nodes: GraphNode[],
  groups: GraphGroup[],
  toMini: (x: number, y: number) => Point,
  scale: number,
) {
  return groups.map((group, index) => {
    const bounds = GroupBounds(nodes, group.id);
    if (bounds === null) {
      return null;
    }
    const origin = toMini(bounds.x, bounds.y);
    const color = GROUP_COLORS[index % GROUP_COLORS.length];
    return (
      <rect
        key={group.id}
        x={origin.x}
        y={origin.y}
        width={bounds.w * scale}
        height={bounds.h * scale}
        fill={color}
        rx={2}
      />
    );
  });
}

/** One thin line per edge, between the connected nodes' ports. */
function renderEdgeLines(edges: GraphEdge[], nodeMap: Map<string, GraphNode>, toMini: (x: number, y: number) => Point) {
  return edges.map(edge => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (from === undefined || to === undefined) {
      return null;
    }
    const start = toMini(from.x + NODE_W, from.y + NODE_H / 2);
    const end = toMini(to.x, to.y + NODE_H / 2);
    return (
      <line
        key={edge.id}
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="#444"
        strokeWidth={1}
      />
    );
  });
}

/** One colored rectangle per node. */
function renderNodeRects(nodes: GraphNode[], toMini: (x: number, y: number) => Point, scale: number) {
  return nodes.map(node => {
    const origin = toMini(node.x, node.y);
    const colors = TYPE_COLORS[node.type];
    return (
      <rect
        key={node.id}
        x={origin.x}
        y={origin.y}
        width={Math.max(NODE_W * scale, 4)}
        height={Math.max(NODE_H * scale, 3)}
        fill={colors.dot}
        rx={1}
        opacity={0.8}
      />
    );
  });
}
