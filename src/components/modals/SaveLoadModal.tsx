import { useEffect, useState } from "react";
import { FONT } from "../../lib/constants";
import { DeleteGraph, ListGraphs, LoadGraph, SaveGraph } from "../../lib/storage";
import type { GraphSnapshot } from "../../lib/types";
import { Btn } from "../Btn";
import { ModalShell } from "./ModalShell";

/**
 * Save the current graph under a name, and list/load/delete saved graphs.
 */

interface SaveLoadModalProps {
  onClose: () => void;
  onLoad: (snapshot: GraphSnapshot) => void;
  currentState: GraphSnapshot;
}

export function SaveLoadModal({ onClose, onLoad, currentState }: SaveLoadModalProps) {
  const [saves, setSaves] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ListGraphs().then(names => {
      setSaves(names);
      setLoading(false);
    });
  }, []);

  const doSave = async (): Promise<void> => {
    if (name.trim() === "") {
      return;
    }
    setStatus("Saving…");
    const ok = await SaveGraph(name.trim(), currentState);
    setStatus(ok ? "Saved!" : "Error");
    if (ok) {
      setSaves(await ListGraphs());
    }
    setTimeout(() => setStatus(""), 2000);
  };

  const doLoad = async (saveName: string): Promise<void> => {
    setStatus("Loading…");
    const data = await LoadGraph(saveName);
    if (data !== null) {
      onLoad(data);
      onClose();
    } else {
      setStatus("Error");
    }
  };

  const doDelete = async (saveName: string): Promise<void> => {
    await DeleteGraph(saveName);
    setSaves(await ListGraphs());
  };

  return (
    <ModalShell title="Save / Load Graph" maxWidth={440} onClose={onClose}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Graph name…"
          onKeyDown={event => { if (event.key === "Enter") { void doSave(); } }}
          style={{
            flex: 1, background: "#0d0d10", border: "1px solid #333", borderRadius: 5,
            padding: "7px 10px", color: "#ddd", fontFamily: FONT, fontSize: 12,
          }}
        />
        <button
          onClick={() => void doSave()}
          style={{
            background: "#818cf8", color: "#111", border: "none", borderRadius: 5,
            padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          }}
        >Save</button>
      </div>
      {status !== "" && <span style={{ fontSize: 11, color: "#4ade80", fontFamily: FONT }}>{status}</span>}
      <div style={{ borderTop: "1px solid #222", paddingTop: 12 }}>
        <span style={{ fontSize: 11, color: "#666", fontFamily: FONT, marginBottom: 8, display: "block" }}>
          Saved graphs{loading ? " (loading…)" : ""}
        </span>
        {saves.length === 0 && !loading && (
          <span style={{ fontSize: 11, color: "#444", fontFamily: FONT }}>No saved graphs yet</span>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflow: "auto" }}>
          {saves.map(saveName => (
            <div
              key={saveName}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
                background: "#ffffff06", borderRadius: 5, border: "1px solid #222",
              }}
            >
              <span style={{ flex: 1, fontSize: 12, color: "#ccc", fontFamily: FONT }}>{saveName}</span>
              <Btn onClick={() => void doLoad(saveName)} style={{ background: "#818cf815", color: "#818cf8", borderColor: "#818cf830" }}>Load</Btn>
              <Btn onClick={() => void doDelete(saveName)} style={{ background: "#ff000012", color: "#f87171", borderColor: "#ff000025" }}>✕</Btn>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
