import { useEffect, useState } from "react";
import { FONT } from "../lib/constants";
import { useDoubleTap } from "../hooks/useDoubleTap";
import type { GraphEdge, Point } from "../lib/types";

/**
 * Floating label on an edge, rendered inside the world SVG. Double-click
 * (or double-tap) renames it inline; Enter or blur commits, Escape cancels.
 */

interface EdgeLabelProps {
  edge: GraphEdge;
  pos: Point;
  onUpdate: (edgeId: string, label: string) => void;
  zoom: number;
}

export function EdgeLabel({ edge, pos, onUpdate, zoom }: EdgeLabelProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(edge.label ?? "");

  // Keep the edit buffer in sync when the label changes externally.
  useEffect(() => {
    setValue(edge.label ?? "");
  }, [edge.label]);

  const fontSize = Math.max(8, 10 / Math.max(zoom, 0.5));

  const beginEdit = () => setEditing(true);
  const doubleTap = useDoubleTap(beginEdit);

  const commit = (): void => {
    onUpdate(edge.id, value);
    setEditing(false);
  };

  if (editing) {
    return (
      <foreignObject x={pos.x - 90} y={pos.y - 14} width={180} height={28} style={{ overflow: "visible" }}>
        <input
          autoFocus
          value={value}
          onChange={event => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={event => {
            if (event.key === "Enter") {
              commit();
            }
            if (event.key === "Escape") {
              setEditing(false);
            }
          }}
          style={{
            width: "100%", background: "#1a1a2f", border: "1px solid #818cf8", borderRadius: 3,
            color: "#ddd", fontSize: 10, padding: "3px 6px", fontFamily: FONT, textAlign: "center",
            boxSizing: "border-box",
          }}
        />
      </foreignObject>
    );
  }

  return (
    <text
      x={pos.x}
      y={pos.y}
      textAnchor="middle"
      fill="#667"
      fontSize={fontSize}
      fontFamily={FONT}
      style={{ cursor: "pointer", pointerEvents: "auto", touchAction: "none" }}
      onPointerDown={event => { event.stopPropagation(); doubleTap.handlePointerDown(event); }}
      onPointerUp={doubleTap.handlePointerUp}
      onDoubleClick={beginEdit}
    >
      {edge.label || "···"}
    </text>
  );
}
