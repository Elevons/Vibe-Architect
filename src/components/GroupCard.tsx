import { FONT, GROUP_CARD_H, GROUP_COLORS, NODE_W } from "../lib/constants";
import type { GraphGroup } from "../lib/types";

/**
 * Collapsed group card: a compact box standing in for the group's members.
 * Click to focus the group; the button toggles collapse.
 */

interface GroupCardProps {
  group: GraphGroup;
  count: number;
  colorIdx: number;
  dimmed: boolean;
  onToggle: (id: string) => void;
  onFocus: (id: string) => void;
}

export function GroupCard({ group, count, colorIdx, dimmed, onToggle, onFocus }: GroupCardProps) {
  const color = GROUP_COLORS[colorIdx % GROUP_COLORS.length];
  const accent = color.replace("30", "");
  const x = group.x ?? 0;
  const y = group.y ?? 0;

  return (
    <div
      data-nodecard="true"
      onMouseDown={event => event.stopPropagation()}
      onClick={() => onFocus(group.id)}
      style={{
        position: "absolute", left: x, top: y, width: NODE_W, height: GROUP_CARD_H,
        background: "#15151c", border: `1.5px solid ${accent}88`, borderRadius: 8, padding: "8px 12px",
        display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box",
        opacity: dimmed ? 0.15 : 1, transition: "opacity 0.2s", cursor: "pointer", userSelect: "none", zIndex: 5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: accent, fontSize: 12, lineHeight: 1 }}>▣</span>
        <span style={{
          fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#e8e8f0",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{group.name}/</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: FONT, fontSize: 9, color: "#666" }}>
          {count} file{count === 1 ? "" : "s"}
        </span>
        <button
          onClick={event => { event.stopPropagation(); onToggle(group.id); }}
          style={{
            background: `${accent}18`, border: `1px solid ${accent}40`, borderRadius: 4, color: accent,
            padding: "2px 8px", fontSize: 9, cursor: "pointer", fontFamily: FONT, fontWeight: 600,
          }}
        >
          {group.collapsed ? "Expand ▾" : "Collapse ▴"}
        </button>
      </div>
    </div>
  );
}
