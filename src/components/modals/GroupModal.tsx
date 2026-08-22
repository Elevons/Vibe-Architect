import { useState } from "react";
import { FONT, GROUP_COLORS } from "../../lib/constants";
import type { GraphGroup } from "../../lib/types";
import { Btn } from "../Btn";
import { ModalShell } from "./ModalShell";

/**
 * Manage subgraph groups: create new groups and delete existing ones.
 * Nodes are assigned to groups from the node editor.
 */

interface GroupModalProps {
  groups: GraphGroup[];
  onClose: () => void;
  onAdd: (name: string) => void;
  onDelete: (id: string) => void;
}

export function GroupModal({ groups, onClose, onAdd, onDelete }: GroupModalProps) {
  const [name, setName] = useState("");

  const addGroup = (): void => {
    if (name.trim() !== "") {
      onAdd(name.trim());
      setName("");
    }
  };

  return (
    <ModalShell title="Subgraph Groups" maxWidth={380} gap={14} onClose={onClose}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="New group name…"
          onKeyDown={event => { if (event.key === "Enter") { addGroup(); } }}
          style={{
            flex: 1, background: "#0d0d10", border: "1px solid #333", borderRadius: 5,
            padding: "7px 10px", color: "#ddd", fontFamily: FONT, fontSize: 12,
          }}
        />
        <button
          onClick={addGroup}
          style={{
            background: "#4ade80", color: "#111", border: "none", borderRadius: 5,
            padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          }}
        >Add</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {groups.length === 0 && (
          <span style={{ fontSize: 11, color: "#444", fontFamily: FONT }}>
            No groups yet. Create one and assign nodes via the node editor.
          </span>
        )}
        {groups.map((group, index) => {
          const color = GROUP_COLORS[index % GROUP_COLORS.length];
          return (
            <div
              key={group.id}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
                background: "#ffffff06", borderRadius: 5, border: `1px solid ${color.replace("30", "60")}`,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: "#ccc", fontFamily: FONT }}>{group.name}</span>
              <Btn onClick={() => onDelete(group.id)} style={{ background: "#ff000012", color: "#f87171", borderColor: "#ff000025" }}>✕</Btn>
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
