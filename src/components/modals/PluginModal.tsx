import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FONT } from "../../lib/constants";
import { LoadPluginFromFile } from "../../lib/plugins";
import type { Plugin } from "../../lib/types";
import { ModalShell } from "./ModalShell";

/**
 * Import node packages (plugins) from JSON files and list the ones
 * currently loaded. Imported nodes appear in the toolbar under
 * Add ▾ → Custom nodes → <package name>.
 */

interface PluginModalProps {
  onClose: () => void;
  onImport: (plugin: Plugin) => void;
  loadedPlugins: Plugin[];
}

export function PluginModal({ onClose, onImport, loadedPlugins }: PluginModalProps) {
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFilePicked = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) {
      return;
    }
    const plugin = await LoadPluginFromFile(file);
    if (plugin !== null) {
      onImport(plugin);
      setStatus(`Imported "${plugin.name}" (${plugin.nodes.length} node type${plugin.nodes.length === 1 ? "" : "s"})`);
    } else {
      setStatus(`Could not read "${file.name}" — is it a plugin JSON file?`);
    }
  };

  return (
    <ModalShell title="Plugins (node packages)" maxWidth={460} onClose={onClose}>
      <button
        onClick={() => fileRef.current?.click()}
        style={{
          background: "#22d3ee18", border: "1px solid #22d3ee40", borderRadius: 5, color: "#22d3ee",
          padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
        }}
      >
        Import plugin file…
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        onChange={event => void handleFilePicked(event)}
        style={{ display: "none" }}
      />

      {status !== "" && <span style={{ fontSize: 11, color: "#4ade80", fontFamily: FONT }}>{status}</span>}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {loadedPlugins.length === 0 && (
          <span style={{ fontSize: 11, color: "#555", fontFamily: FONT }}>No plugins loaded yet.</span>
        )}
        {loadedPlugins.map(plugin => (
          <div key={plugin.name} style={{ border: "1px solid #2a2a2a", borderRadius: 6, padding: "8px 10px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#22d3ee", fontFamily: FONT, fontWeight: 700 }}>📦 {plugin.name}</span>
              {plugin.version !== undefined && (
                <span style={{ fontSize: 10, color: "#555", fontFamily: FONT }}>v{plugin.version}</span>
              )}
              <span style={{ fontSize: 10, color: "#555", fontFamily: FONT, marginLeft: "auto" }}>
                {plugin.nodes.length} node type{plugin.nodes.length === 1 ? "" : "s"}
              </span>
            </div>
            {plugin.description !== undefined && (
              <p style={{ margin: "4px 0 0", fontSize: 10, color: "#888", fontFamily: FONT, lineHeight: 1.4 }}>{plugin.description}</p>
            )}
          </div>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 10, color: "#555", fontFamily: FONT, lineHeight: 1.5 }}>
        A plugin is a JSON file with a name and a list of node definitions
        ({`{ name, nodes: [{ type, label, desc, category?, color? }] }`}).
        Its nodes show up under Add ▾ → Custom nodes. Saved graphs embed the
        plugins they use, so a graph stays self-contained.
      </p>
    </ModalShell>
  );
}
