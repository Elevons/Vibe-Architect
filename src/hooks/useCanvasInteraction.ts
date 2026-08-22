import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { GraphEdge, GraphNode, Point } from "../lib/types";

/**
 * Canvas pointer interaction: node dragging, canvas panning, and the
 * in-progress edge draft.
 *
 * The drag/pan offsets live in refs so the window-level mousemove handler
 * stays cheap; React state holds only what the UI renders (dragging id,
 * panning flag, edge draft, cursor position).
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
  setSelected: (id: string | null) => void;
  setFocusGroup: (id: string | null) => void;
  updateNode: (id: string, patch: Partial<GraphNode>) => void;
  addEdge: (from: string, to: string) => void;
}

export interface CanvasInteraction {
  panning: boolean;
  draggingId: string | null;
  mousePos: Point;
  edgeDraft: EdgeDraft | null;
  canvasMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleDragStart: (event: ReactMouseEvent, id: string) => void;
  handleStartEdge: (fromId: string, event: ReactMouseEvent) => void;
  handleEndEdge: (toId: string) => void;
}

export function useCanvasInteraction(options: CanvasInteractionOptions): CanvasInteraction {
  const { canvasRef, nodes, edges, pan, zoom, setPan, setSelected, setFocusGroup, updateNode, addEdge } = options;

  const [panning, setPanning] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [edgeDraft, setEdgeDraft] = useState<EdgeDraft | null>(null);

  const panStart = useRef<Point | null>(null);
  // Screen-space grab offset: cursor minus (node origin in screen space).
  const dragOffset = useRef<Point>({ x: 0, y: 0 });

  useEffect(() => {
    const onMouseMove = (event: MouseEvent): void => {
      setMousePos({ x: event.clientX, y: event.clientY });
      const canvas = canvasRef.current;
      if (canvas === null) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;

      if (draggingId !== null) {
        const worldX = (screenX - dragOffset.current.x - pan.x) / zoom;
        const worldY = (screenY - dragOffset.current.y - pan.y) / zoom;
        updateNode(draggingId, { x: worldX, y: worldY });
      }
      if (panning && panStart.current !== null) {
        setPan({ x: event.clientX - panStart.current.x, y: event.clientY - panStart.current.y });
      }
    };

    const onMouseUp = (): void => {
      setDraggingId(null);
      setEdgeDraft(null);
      setPanning(false);
      panStart.current = null;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [canvasRef, draggingId, panning, pan, zoom, setPan, updateNode]);

  const canvasMouseDown = (event: ReactMouseEvent<HTMLDivElement>): void => {
    // Walk up from the target: a pan hit-area starts panning, a node card
    // swallows the event, anything else is empty canvas.
    let element = event.target as HTMLElement | null;
    while (element !== null && element !== canvasRef.current) {
      if (element.dataset !== undefined && element.dataset.pan) {
        break;
      }
      if (element.dataset !== undefined && element.dataset.nodecard) {
        return;
      }
      element = element.parentElement;
    }
    setSelected(null);
    setFocusGroup(null);
    setPanning(true);
    panStart.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
  };

  const handleDragStart = (event: ReactMouseEvent, id: string): void => {
    const node = nodes.find(entry => entry.id === id);
    const canvas = canvasRef.current;
    if (node === undefined || canvas === null) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    dragOffset.current = { x: screenX - node.x * zoom - pan.x, y: screenY - node.y * zoom - pan.y };
    setDraggingId(id);
  };

  const handleStartEdge = (fromId: string, event: ReactMouseEvent): void => {
    setEdgeDraft({ from: fromId, to: null });
    setMousePos({ x: event.clientX, y: event.clientY });
  };

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
    mousePos,
    edgeDraft,
    canvasMouseDown,
    handleDragStart,
    handleStartEdge,
    handleEndEdge,
  };
}
