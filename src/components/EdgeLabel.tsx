import { useEffect, useState } from "react";
import { FONT } from "../lib/constants";
import type { GraphEdge, Point } from "../lib/types";

/**
 * Floating label on an edge, rendered inside the world SVG. A wide
 * invisible hit rect carries all pointer events so edge notes are always
 * clickable regardless of SVG pointer-event inheritance. Single click/tap
 * or double-click opens the inline editor; Enter or blur commits, Escape cancels.
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

  useEffect(() => {
    setValue(edge.label ?? "");
  }, [edge.label]);

  const beginEdit = (): void => {
    if (!editing) {
      setEditing(true);
    }
  };

  const commit = (): void => {
    onUpdate(edge.id, value);
    setEditing(false);
  };

  if (editing) {
    return (
      <foreignObject x={pos.x - 90} y={pos.y - 16} width={180} height={32} style={{ overflow: "visible" }}>
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

  const hasLabel = edge.label !== "" && edge.label !== null;
  const size = Math.max(16, 16 / Math.max(zoom, 0.5));
  const labelColor = hasLabel ? "#818cf8" : "#3a3a46";

  return (
    <g
      onClick={beginEdit}
      onDoubleClick={beginEdit}
      onPointerDown={event => event.stopPropagation()}
      style={{ cursor: "pointer", touchAction: "none" }}
    >
      <rect
        x={pos.x - size / 2}
        y={pos.y - size / 2}
        width={size}
        height={size}
        fill="transparent"
        style={{ pointerEvents: "all" }}
        onPointerDown={event => event.stopPropagation()}
      />
      <rect
        x={pos.x - size / 2 + 2}
        y={pos.y - size / 2 + 2}
        width={size - 4}
        height={size - 4}
        rx={Math.max(2, (size - 4) * 0.25)}
        fill={labelColor}
        stroke="#0b0b12"
        strokeWidth={1 / Math.max(zoom, 0.5)}
        style={{ pointerEvents: "none" }}
      />
      {hasLabel && (
        <text
          x={pos.x + size / 2 + 4}
          y={pos.y}
          dominantBaseline="middle"
          textAnchor="start"
          fill="#99a"
          fontSize={Math.max(8, 9 / Math.max(zoom, 0.5))}
          fontFamily={FONT}
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}
