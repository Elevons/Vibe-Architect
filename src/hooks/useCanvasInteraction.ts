import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { MAX_ZOOM, MIN_ZOOM } from "../lib/constants";
import type { GraphEdge, GraphNode, Point } from "../lib/types";

/**
 * Canvas pointer interaction: node dragging, canvas panning, pinch-to-zoom,
 * and the in-progress edge draft.
 *
 * Everything runs on Pointer Events so mouse and touch share one code path.
 * A single pointer pans or drags; two pointers pinch-zoom (scale about the
 * midpoint while panning with it).
 *
 * The drag/pan/pinch state lives in refs so the window-level pointermove
 * handler stays cheap; React state holds only what the UI renders.
 */

interface EdgeDraft {
  from: string;
  to: string | null;
}

interface CanvasInteractionOptions {
  canvasRef: { current: HTMLDivElement | null };
  nodes: GraphNode[];
  edges: GraphEdge[];
  pan: Point;
  zoom: number;
  setPan: (pan: Point) => void;
  setZoom: (zoom: number) => void;
  setSelected: (id: string | null) => void;
  updateNode: (id: string, patch: Partial<GraphNode>) => void;
  addEdge: (from: string, to: string) => void;
}

export interface CanvasInteraction {
  panning: boolean;
  draggingId: string | null;
  pointerPos: Point;
  edgeDraft: EdgeDraft | null;
  canvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleDragStart: (event: ReactPointerEvent, id: string) => void;
  handleStartEdge: (fromId: string, event: ReactPointerEvent) => void;
  handleEndEdge: (toId: string) => void;
}

/** A pointer currently pressed, in client (screen) coordinates. */
interface ActivePointer {
  id: number;
  x: number;
  y: number;
}

export function useCanvasInteraction(options: CanvasInteractionOptions): CanvasInteraction {
  const { canvasRef, nodes, edges, pan, zoom, setPan, setZoom, setSelected, updateNode, addEdge } = options;

  const [panning, setPanning] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pointerPos, setPointerPos] = useState<Point>({ x: 0, y: 0 });
  const [edgeDraft, setEdgeDraft] = useState<EdgeDraft | null>(null);

  // Pointers currently pressed anywhere on the canvas (max 2 used).
  const pointers = useRef<ActivePointer[]>([]);
  // Screen-space grab offset for a node drag: pointer minus node origin.
  const dragOffset = useRef<Point>({ x: 0, y: 0 });
  const dragPointerId = useRef<number | null>(null);
  // Pan bookkeeping: pointer position minus pan at the moment panning began.
  const panStart = useRef<Point | null>(null);
  // Pinch bookkeeping: the gesture's starting distance/zoom and the world
  // point under the midpoint that must stay pinned as the fingers move.
  const pinchStart = useRef<{ distance: number; zoom: number; worldMid: Point } | null>(null);

  // ── Window-level pointer tracking ──
  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      const pressed = pointers.current.find(entry => entry.id === event.pointerId);
      if (pressed !== undefined) {
        pressed.x = event.clientX;
        pressed.y = event.clientY;
      }
      setPointerPos({ x: event.clientX, y: event.clientY });

      const canvas = canvasRef.current;
      if (canvas === null) {
        return;
      }
      const rect = canvas.getBoundingClientRect();

      if (pinchStart.current !== null && pointers.current.length >= 2) {
        applyPinch(rect, pinchStart.current, pointers.current, setPan, setZoom);
        return;
      }
      if (draggingId !== null && dragPointerId.current === event.pointerId) {
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const worldX = (screenX - dragOffset.current.x - pan.x) / zoom;
        const worldY = (screenY - dragOffset.current.y - pan.y) / zoom;
        updateNode(draggingId, { x: worldX, y: worldY });
      }
      if (panning && panStart.current !== null) {
        setPan({ x: event.clientX - panStart.current.x, y: event.clientY - panStart.current.y });
      }
    };

    const onPointerUp = (event: PointerEvent): void => {
      pointers.current = pointers.current.filter(entry => entry.id !== event.pointerId);
      if (pinchStart.current !== null && pointers.current.length < 2) {
        pinchStart.current = null;
      }
      if (dragPointerId.current === event.pointerId) {
        dragPointerId.current = null;
        setDraggingId(null);
        setEdgeDraft(null);
      }
      if (panning && pointers.current.length === 0) {
        setPanning(false);
        panStart.current = null;
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [canvasRef, draggingId, panning, pan, zoom, setPan, setZoom, updateNode]);

  // ── Press on the canvas itself (pan area or empty space) ──
  const canvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    // Node cards and ports stopPropagation, so anything reaching here is
    // background: start a single-finger pan (or a pinch if a second finger
    // lands while one is already down).
    pointers.current = [...pointers.current, { id: event.pointerId, x: event.clientX, y: event.clientY }];
    setPointerPos({ x: event.clientX, y: event.clientY });

    if (pointers.current.length === 1) {
      setSelected(null);
      setPanning(true);
      panStart.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    } else if (pointers.current.length === 2) {
      // Second finger: abandon the pan and begin a pinch.
      setPanning(false);
      panStart.current = null;
      const canvas = canvasRef.current;
      if (canvas !== null) {
        const rect = canvas.getBoundingClientRect();
        const [first, second] = pointers.current;
        const midX = (first.x + second.x) / 2 - rect.left;
        const midY = (first.y + second.y) / 2 - rect.top;
        pinchStart.current = {
          distance: Math.max(10, Math.hypot(first.x - second.x, first.y - second.y)),
          zoom,
          worldMid: { x: (midX - pan.x) / zoom, y: (midY - pan.y) / zoom },
        };
      }
    }
  };

  // ── Press on a node card body: select + begin dragging it ──
  const handleDragStart = (event: ReactPointerEvent, id: string): void => {
    if (draggingId !== null) {
      return;
    }
    const node = nodes.find(entry => entry.id === id);
    const canvas = canvasRef.current;
    if (node === undefined || canvas === null) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    dragOffset.current = { x: screenX - node.x * zoom - pan.x, y: screenY - node.y * zoom - pan.y };
    dragPointerId.current = event.pointerId;
    setDraggingId(id);
    // Register the drag pointer so a second finger landing on the canvas
    // starts a pinch instead of a pan.
    pointers.current = [...pointers.current, { id: event.pointerId, x: event.clientX, y: event.clientY }];
  };

  // ── Press on an output port: begin an edge draft ──
  const handleStartEdge = (fromId: string, event: ReactPointerEvent): void => {
    setEdgeDraft({ from: fromId, to: null });
    setPointerPos({ x: event.clientX, y: event.clientY });
  };

  // ── Release over an input port: commit the edge draft ──
  const handleEndEdge = (toId: string): void => {
    if (
      edgeDraft !== null
      && edgeDraft.from !== toId
      && !edges.some(edge => edge.from === edgeDraft.from && edge.to === toId)
    ) {
      addEdge(edgeDraft.from, toId);
    }
    setEdgeDraft(null);
  };

  return {
    panning,
    draggingId,
    pointerPos,
    edgeDraft,
    canvasPointerDown,
    handleDragStart,
    handleStartEdge,
    handleEndEdge,
  };
}

/**
 * Apply a two-finger pinch: scale about the midpoint so the world point that
 * started under it stays under the (moving) midpoint.
 */
export function applyPinch(
  rect: DOMRect,
  start: { distance: number; zoom: number; worldMid: Point },
  active: ActivePointer[],
  setPan: (pan: Point) => void,
  setZoom: (zoom: number) => void,
): void {
  const [first, second] = active;
  const distance = Math.max(10, Math.hypot(first.x - second.x, first.y - second.y));
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.zoom * (distance / start.distance)));
  const midX = (first.x + second.x) / 2 - rect.left;
  const midY = (first.y + second.y) / 2 - rect.top;
  setPan({ x: midX - start.worldMid.x * newZoom, y: midY - start.worldMid.y * newZoom });
  setZoom(newZoom);
}
