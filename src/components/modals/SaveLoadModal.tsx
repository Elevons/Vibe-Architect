import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FONT } from "../../lib/constants";
import {
  DeleteGraphFromServer,
  ListGraphsFromServer,
  LoadGraphFromFile,
  LoadGraphFromServer,
  SaveGraphToFile,
  SaveGraphToServer,
  type ServerGraphEntry,
} from "../../lib/fileStorage";
import type { GraphSnapshot } from "../../lib/types";
import { ModalShell } from "./ModalShell";

/**
 * Save the current graph to the server or as a browser download. Load a
 * graph from the server list (shown below) or from a local .json file.
 */

interface SaveLoadModalProps {
  onClose: () => void;
  onLoad: (snapshot: GraphSnapshot) => void;
  currentState: GraphSnapshot;
}

export function SaveLoadModal({ onClose, onLoad, currentState }: SaveLoadModalProps) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [graphs, setGraphs] = useState<ServerGraphEntry[]>([]);
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshList = useCallback(async () => {
    try {
      setGraphs(await ListGraphsFromServer());
      setServerError("");
    } catch (e) {
      setServerError(String(e));
    }
  }, []);

  useEffect(() => { void refreshList(); }, [refreshList]);

  const handleSaveToServer = async (): Promise<void> => {
    if (!name.trim()) return;
    setSaving(true);
    setStatus("");
    try {
      await SaveGraphToServer(name.trim(), currentState);
      setStatus(`Saved "${name.trim()}" to server`);
      await refreshList();
    } catch (e) {
      setStatus(`Error: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFile = (): void => {
    SaveGraphToFile(name, currentState);
    const display = name.trim() !== "" ? `"${name.trim()}"` : "graph";
    setStatus(`Downloaded ${display}.json`);
  };

  const handleLoadServer = async (graphName: string): Promise<void> => {
    setStatus("");
    try {
      const snapshot = await LoadGraphFromServer(graphName);
      if (snapshot !== null) {
        onLoad(snapshot);
        onClose();
      } else {
        setStatus(`"${graphName}" not found on server`);
      }
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  };

  const handleDeleteServer = async (graphName: string): Promise<void> => {
    setStatus("");
    try {
      await DeleteGraphFromServer(graphName);
      setStatus(`Deleted "${graphName}"`);
      await refreshList();
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  };

  const handleFilePicked = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    const snapshot = await LoadGraphFromFile(file);
    if (snapshot !== null) {
      onLoad(snapshot);
      onClose();
    } else {
      setStatus(`Could not read "${file.name}" — is it a saved graph file?`);
    }
  };

  return (
    <ModalShell title="Save / Load Graph" maxWidth={520} maxHeight="85vh" onClose={onClose}>
      {/* ── Name input + save buttons ── */}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Graph name…"
          onKeyDown={event => { if (event.key === "Enter") { void handleSaveToServer(); } }}
          style={{
            flex: 1, background: "#0d0d10", border: "1px solid #333", borderRadius: 5,
            padding: "7px 10px", color: "#ddd", fontFamily: FONT, fontSize: 12,
          }}
        />
        <button
          onClick={() => void handleSaveToServer()}
          disabled={saving || !name.trim()}
          style={{
            background: "#818cf8", color: "#111", border: "none", borderRadius: 5,
            padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
            opacity: saving || !name.trim() ? 0.5 : 1,
          }}
        >Save to Server</button>
        <button
          onClick={handleSaveFile}
          style={{
            background: "#818cf888", color: "#ddd", border: "none", borderRadius: 5,
            padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          }}
        >Download</button>
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

      {/* ── Server graph list ── */}
      <div style={{ marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#888", fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Server Graphs
          </span>
          <button
            onClick={() => void refreshList()}
            style={{
              background: "none", border: "none", color: "#555", cursor: "pointer",
              fontSize: 11, fontFamily: FONT, padding: "2px 6px",
            }}
            title="Refresh list"
          >Refresh</button>
        </div>

        {serverError !== "" && (
          <div style={{ color: "#ef4444", fontSize: 11, fontFamily: FONT, marginBottom: 6 }}>
            Server not available: {serverError}
          </div>
        )}

        <div style={{
          maxHeight: 200, overflowY: "auto", border: "1px solid #222", borderRadius: 5,
          background: "#08080b",
        }}>
          {graphs.length === 0 && serverError === "" && (
            <div style={{ padding: 10, color: "#555", fontSize: 11, fontFamily: FONT }}>No graphs saved on server yet.</div>
          )}
          {graphs.map(g => (
            <div
              key={g.name}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 10px", borderBottom: "1px solid #191921",
                fontFamily: FONT, fontSize: 12, color: "#ccc",
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {g.name}
                {g.mtime !== null && (
                  <span style={{ marginLeft: 8, fontSize: 10, color: "#555" }}>
                    {new Date(g.mtime).toLocaleDateString()}
                  </span>
                )}
              </span>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => void handleLoadServer(g.name)}
                  style={{
                    background: "#4ade8030", border: "none", borderRadius: 3, color: "#4ade80",
                    padding: "2px 8px", fontSize: 11, fontFamily: FONT, cursor: "pointer",
                  }}
                >Load</button>
                <button
                  onClick={() => void handleDeleteServer(g.name)}
                  style={{
                    background: "#ef444430", border: "none", borderRadius: 3, color: "#ef4444",
                    padding: "2px 8px", fontSize: 11, fontFamily: FONT, cursor: "pointer",
                  }}
                >Del</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {status !== "" && <span style={{ fontSize: 11, color: "#4ade80", fontFamily: FONT }}>{status}</span>}
    </ModalShell>
  );
}
