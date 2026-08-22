import { FONT } from "../lib/constants";

/**
 * Bottom hint bar with the canvas shortcuts.
 */

const HINTS = [
  "Scroll to zoom",
  "Drag canvas to pan",
  "Double-click node to edit",
  "Expand folder cards to see files",
  "Click folder card to focus",
  "Drag ● → ● to connect",
  "Double-click edge label to rename",
];

export function StatusBar() {
  return (
    <div style={{
      padding: "4px 14px", background: "#111114", borderTop: "1px solid #222",
      display: "flex", gap: 14, fontSize: 10, color: "#555", flexShrink: 0, fontFamily: FONT,
    }}>
      {HINTS.map(hint => (
        <span key={hint}>{hint}</span>
      ))}
    </div>
  );
}
