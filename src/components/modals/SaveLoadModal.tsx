import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FONT } from "../../lib/constants";
import { LoadGraphFromFile, SaveGraphToFile } from "../../lib/fileStorage";
import type { GraphSnapshot } from "../../lib/types";
import { ModalShell } from "./ModalShell";

/**
 * Save the current graph as a JSON file (browser download), or load a
 * graph from a previously saved .json file.
 */

interface SaveLoadModalProps {
  onClose: () => void;
  onLoad: (snapshot: GraphSnapshot) => void;
  currentState: GraphSnapshot;
}

export function SaveLoadModal({ onClose, onLoad, currentState }: SaveLoadModalProps) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = (): void => {
    SaveGraphToFile(name, currentState);
    setStatus(`Saved ${name.trim() !== "" ? `"${name.trim()}"` : "graph"} as a .json file`);
  };

  const handleFilePicked = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) {
      return;
    }
    const snapshot = await LoadGraphFromFile(file);
    if (snapshot !== null) {
      onLoad(snapshot);
      onClose();
    } else {
      setStatus(`Could not read "${file.name}" — is it a saved graph file?`);
    }
  };

  return (
    <ModalShell title="Save / Load Graph" maxWidth={440} onClose={onClose}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Graph name…"
          onKeyDown={event => { if (event.key === "Enter") { handleSave(); } }}
          style={{
            flex: 1, background: "#0d0d10", border: "1px solid #333", borderRadius: 5,
            padding: "7px 10px", color: "#ddd", fontFamily: FONT, fontSize: 12,
          }}
        />
        <button
          onClick={handleSave}
          style={{
            background: "#818cf8", color: "#111", border: "none", borderRadius: 5,
            padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          }}
        >Save</button>
      </div>

      <button
        onClick={() => fileRef.current?.click()}
        style={{
          background: "#4ade8018", border: "1px solid #4ade8040", borderRadius: 5, color: "#4ade80",
          padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
        }}
      >
        Load from file…
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        onChange={event => void handleFilePicked(event)}
        style={{ display: "none" }}
      />

      {status !== "" && <span style={{ fontSize: 11, color: "#4ade80", fontFamily: FONT }}>{status}</span>}

      <p style={{ margin: 0, fontSize: 10, color: "#555", fontFamily: FONT, lineHeight: 1.5 }}>
        Saving downloads a .json file you can keep, share, or copy to another machine.
        Loading reads one of those files back.
      </p>
    </ModalShell>
  );
}
