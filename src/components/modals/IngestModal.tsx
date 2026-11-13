import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FONT } from "../../lib/constants";
import { ALL_EXTS, BuildIngestGraph, GetExtension, ShouldInclude } from "../../lib/ingest";
import type { IngestFileEntry, IngestResult } from "../../lib/types";
import { ModalShell } from "./ModalShell";

/**
 * Repository ingestion: pick a folder, keep its code file paths, then group
 * them under folder nodes and lay the resulting graph out. File contents
 * are never read — the graph is a design, not a copy of the code.
 */

type IngestStatus = "idle" | "ready" | "done";

interface IngestModalProps {
  onClose: () => void;
  onIngest: (nodes: IngestResult["nodes"], edges: IngestResult["edges"]) => void;
}

export function IngestModal({ onClose, onIngest }: IngestModalProps) {
  const [status, setStatus] = useState<IngestStatus>("idle");
  const [files, setFiles] = useState<IngestFileEntry[]>([]);
  const [progress, setProgress] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // The directory-picker attributes are not in React's type definitions.
  useEffect(() => {
    const input = fileRef.current;
    if (input !== null) {
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
    }
  }, []);

  const handleSelect = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length === 0) {
      return;
    }
    const entries = SelectedEntries(selected);
    setFiles(entries);
    setProgress(`Found ${entries.length} files`);
    setStatus("ready");
  };

  const handleIngest = (): void => {
    if (files.length === 0) {
      return;
    }
    const result = BuildIngestGraph(files);
    setStatus("done");
    const folderCount = result.nodes.filter(node => node.type === "folder").length;
    setProgress(`Done! ${result.nodes.length - folderCount} files, ${result.edges.length} edges, ${folderCount} folders (collapsed)`);
    onIngest(result.nodes, result.edges);
  };

  return (
    <ModalShell title="Ingest Repository" maxWidth={520} onClose={onClose}>
      <p style={{ margin: 0, fontSize: 11, color: "#888", fontFamily: FONT, lineHeight: 1.5 }}>
        Select a project folder. The tool lists its code files (contents are not read),
        groups them under folder nodes with a noodle from each folder to its children,
        and lays everything out on the canvas.
      </p>

      <input ref={fileRef} type="file" multiple onChange={handleSelect} style={{ display: "none" }} />
      <button
        onClick={() => fileRef.current?.click()}
        style={{
          background: "#818cf818", border: "1px solid #818cf840", borderRadius: 6, color: "#818cf8",
          padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT, textAlign: "center",
        }}
      >
        {files.length > 0 ? `${files.length} files selected — pick again?` : "Select folder…"}
      </button>

      {progress !== "" && (
        <span style={{ fontSize: 11, color: "#ccc", fontFamily: FONT }}>{progress}</span>
      )}

      {files.length > 0 && status !== "done" && (
        <button
          onClick={handleIngest}
          style={{
            background: "#4ade80", color: "#111", border: "none", borderRadius: 6, padding: "10px",
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          }}
        >
          {`Ingest ${files.length} files`}
        </button>
      )}

      {status === "done" && (
        <button
          onClick={onClose}
          style={{
            background: "#818cf8", color: "#111", border: "none", borderRadius: 6,
            padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          }}
        >
          Close & view graph
        </button>
      )}
    </ModalShell>
  );
}

/**
 * The selected files' paths, stripping the common root folder and
 * filtering out ignored paths and non-code extensions.
 */
function SelectedEntries(selected: File[]): IngestFileEntry[] {
  const paths = selected.map(file => file.webkitRelativePath || file.name);
  const rootParts = paths[0]?.split("/") ?? [];
  const commonPrefix = rootParts.length > 1 ? `${rootParts[0]}/` : "";

  const entries: IngestFileEntry[] = [];
  for (const file of selected) {
    const rawPath = file.webkitRelativePath || file.name;
    const relPath = commonPrefix !== "" ? rawPath.replace(commonPrefix, "") : rawPath;
    if (!ShouldInclude(relPath) || !ALL_EXTS.has(GetExtension(file.name))) {
      continue;
    }
    entries.push({ path: relPath, name: file.name });
  }
  return entries;
}
