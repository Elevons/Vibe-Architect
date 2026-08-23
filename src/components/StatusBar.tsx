import { FONT } from "../lib/constants";

/**
 * Bottom hint bar with the canvas shortcuts.
 */

const HINTS = [
  "Pinch or scroll to zoom",
  "Drag to pan",
  "Double-tap node to edit",
  "👁 eye hides a node and its subtree",
  "▾ chevron collapses a parent",
  "Drag ● → ● to connect",
  "Edge into a folder groups the node under it",
  "Double-tap edge label to rename",
  "🧩 Plugins imports custom node types from JSON",
];

export function StatusBar() {
  return (
    <div className="va-status" style={{
      padding: "4px 14px", background: "#111114", borderTop: "1px solid #222",
      display: "flex", gap: 14, fontSize: 10, color: "#555", flexShrink: 0, fontFamily: FONT,
    }}>
      {HINTS.map(hint => (
        <span key={hint}>{hint}</span>
      ))}
    </div>
  );
}
