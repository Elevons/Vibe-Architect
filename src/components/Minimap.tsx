import type { MouseEvent as ReactMouseEvent, ReactElement } from "react";
import { FONT, GROUP_COLORS, MINIMAP_H, MINIMAP_W, NODE_H, NODE_W, TYPE_COLORS } from "../lib/constants";
import { DescendantBounds, PortIn, PortOut, WorldBounds } from "../lib/geometry";
import { BuildChildrenMap } from "../lib/sceneGraph";
import type { GraphEdge, GraphNode, NodeSize, Point } from "../lib/types";

/**
 * Bottom-right overview map: parent fills, edge lines, node rectangles, and
 * the current viewport. Clicking pans the main canvas to that point.
 */

interface MinimapProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
  nodeSizes: Record<string, NodeSize>;
  rendered: Set<string>;
  pan: Point;
  zoom: number;
  canvasW: number;
  canvasH: number;
  onPanTo: (x: number, y: number) => void;
}

const MINIMAP_PAD = 40;
const DEFAULT_CANVAS_W = 800;
const DEFAULT_CANVAS_H = 600;

export function Minimap({ nodes, edges, nodeMap, nodeSizes, rendered, pan, zoom, canvasW, canvasH, onPanTo }: MinimapProps) {
  const world = WorldBounds(nodes, nodeSizes);
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
      className="va-minimap"
      data-nodecard="true"
      onClick={handleClick}
      onPointerDown={event => event.stopPropagation()}
      style={{
        position: "absolute", bottom: 12, right: 12, width: MINIMAP_W, height: MINIMAP_H,
        background: "#0d0d10e8", border: "1px solid #2a2a2f", borderRadius: 8,
        overflow: "hidden", cursor: "crosshair", zIndex: 50, backdropFilter: "blur(8px)",
      }}
    >
      <svg width={MINIMAP_W} height={MINIMAP_H}>
        {renderParentRects(nodes, rendered, nodeSizes, toMini, scale)}
        {renderEdgeLines(edges, nodeMap, nodeSizes, toMini)}
        {renderNodeRects(nodes, rendered, nodeSizes, toMini, scale)}
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

/** Semi-transparent fill behind each rendered parent's rendered children. */
function renderParentRects(
  nodes: GraphNode[],
  rendered: Set<string>,
  nodeSizes: Record<string, NodeSize>,
  toMini: (x: number, y: number) => Point,
  scale: number,
) {
  const childrenMap = BuildChildrenMap(nodes);
  const rects: ReactElement[] = [];
  let colorIndex = 0;
  for (const node of nodes) {
    if (!rendered.has(node.id)) {
      continue;
    }
    if (!HasRenderedChild(childrenMap, node.id, rendered)) {
      continue;
    }
    const bounds = DescendantBounds(nodes, node.id, rendered, 16, nodeSizes);
    if (bounds === null) {
      continue;
    }
    const origin = toMini(bounds.x, bounds.y);
    const color = GROUP_COLORS[colorIndex % GROUP_COLORS.length];
    colorIndex += 1;
    rects.push(
      <rect
        key={node.id}
        x={origin.x}
        y={origin.y}
        width={bounds.w * scale}
        height={bounds.h * scale}
        fill={color}
        rx={2}
      />,
    );
  }
  return rects;
}

/** True when the node has at least one rendered direct child. */
function HasRenderedChild(
  childrenMap: Map<string, string[]>,
  nodeId: string,
  rendered: Set<string>,
): boolean {
  return (childrenMap.get(nodeId) ?? []).some(id => rendered.has(id));
}

/** One thin line per edge, between the connected nodes' ports. */
function renderEdgeLines(
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
  nodeSizes: Record<string, NodeSize>,
  toMini: (x: number, y: number) => Point,
) {
  return edges.map(edge => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (from === undefined || to === undefined) {
      return null;
    }
    const start = PortOut(from, nodeSizes[edge.from]);
    const end = PortIn(to, nodeSizes[edge.to]);
    const startMini = toMini(start.x, start.y);
    const endMini = toMini(end.x, end.y);
    return (
      <line
        key={edge.id}
        x1={startMini.x}
        y1={startMini.y}
        x2={endMini.x}
        y2={endMini.y}
        stroke="#444"
        strokeWidth={1}
      />
    );
  });
}

/** One colored rectangle per rendered node. */
function renderNodeRects(
  nodes: GraphNode[],
  rendered: Set<string>,
  nodeSizes: Record<string, NodeSize>,
  toMini: (x: number, y: number) => Point,
  scale: number,
) {
  return nodes.filter(node => rendered.has(node.id)).map(node => {
    const origin = toMini(node.x, node.y);
    const colors = TYPE_COLORS[node.type];
    const size = nodeSizes[node.id];
    return (
      <rect
        key={node.id}
        x={origin.x}
        y={origin.y}
        width={Math.max((size?.width ?? NODE_W) * scale, 4)}
        height={Math.max((size?.height ?? NODE_H) * scale, 3)}
        fill={colors.dot}
        rx={1}
        opacity={0.8}
      />
    );
  });
}
