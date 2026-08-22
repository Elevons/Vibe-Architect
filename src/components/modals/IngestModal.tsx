import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FONT } from "../../lib/constants";
import { ALL_EXTS, BuildIngestGraph, GetExtension, ShouldInclude } from "../../lib/ingest";
import type { IngestFileEntry, IngestResult } from "../../lib/types";
import { ModalShell } from "./ModalShell";

/**
 * Repository ingestion: pick a folder, read its code files, then let the
 * tool describe them, parse imports, and lay the resulting graph out.
 */

type IngestStatus = "idle" | "reading" | "ready" | "analyzing" | "done";

const MAX_FILE_SIZE = 500_000;

interface IngestModalProps {
  onClose: () => void;
  onIngest: (nodes: IngestResult["nodes"], edges: IngestResult["edges"]) => void;
}

export function IngestModal({ onClose, onIngest }: IngestModalProps) {
  const [status, setStatus] = useState<IngestStatus>("idle");
  const [files, setFiles] = useState<IngestFileEntry[]>([]);
  const [progress, setProgress] = useState("");
  const [analyzed, setAnalyzed] = useState(0);
  const [total, setTotal] = useState(0);
  const [skipDescribe, setSkipDescribe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The directory-picker attributes are not in React's type definitions.
  useEffect(() => {
    const input = fileRef.current;
    if (input !== null) {
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
    }
  }, []);

  const handleSelect = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length === 0) {
      return;
    }
    setStatus("reading");
    setProgress("Reading files…");

    const entries = await ReadSelectedFiles(selected);
    setFiles(entries);
    setTotal(entries.length);
    setProgress(`Found ${entries.length} files`);
    setTimeout(() => setStatus("ready"), 500);
  };

  const handleIngest = async (): Promise<void> => {
    if (files.length === 0) {
      return;
    }
    setStatus("analyzing");
    const result = await BuildIngestGraph(files, skipDescribe, (index, name) => {
      setProgress(`Analyzing ${index}/${files.length}: ${name}`);
      setAnalyzed(index);
    });
    setStatus("done");
    const folderCount = result.nodes.filter(node => node.type === "folder").length;
    setProgress(`Done! ${result.nodes.length - folderCount} files, ${result.edges.length} edges, ${folderCount} folders (collapsed)`);
    onIngest(result.nodes, result.edges);
  };

  const busy = status === "analyzing" || status === "done";

  return (
    <ModalShell title="Ingest Repository" maxWidth={520} onClose={onClose}>
      <p style={{ margin: 0, fontSize: 11, color: "#888", fontFamily: FONT, lineHeight: 1.5 }}>
        Select a project folder. The tool reads code files, uses an LLM to describe each one,
        parses imports to build edges, and lays everything out on the canvas.
      </p>

      <input ref={fileRef} type="file" multiple onChange={event => void handleSelect(event)} style={{ display: "none" }} />
      <button
        onClick={() => fileRef.current?.click()}
        style={{
          background: "#818cf818", border: "1px solid #818cf840", borderRadius: 6, color: "#818cf8",
          padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT, textAlign: "center",
        }}
      >
        {files.length > 0 ? `${files.length} files selected — pick again?` : "Select folder…"}
      </button>

      {files.length > 0 && !busy && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#aaa", fontFamily: FONT, cursor: "pointer" }}>
          <input type="checkbox" checked={skipDescribe} onChange={event => setSkipDescribe(event.target.checked)} />
          Skip LLM descriptions (faster, uses file paths as descriptions)
        </label>
      )}

      {progress !== "" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#ccc", fontFamily: FONT }}>{progress}</span>
          {status === "analyzing" && total > 0 && (
            <div style={{ height: 4, background: "#222", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "#818cf8", borderRadius: 2, transition: "width 0.3s", width: `${(analyzed / total) * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {files.length > 0 && status !== "done" && (
        <button
          onClick={() => void handleIngest()}
          disabled={status === "analyzing"}
          style={{
            background: status === "analyzing" ? "#333" : "#4ade80",
            color: status === "analyzing" ? "#888" : "#111",
            border: "none", borderRadius: 6, padding: "10px", fontSize: 13, fontWeight: 700,
            cursor: status === "analyzing" ? "wait" : "pointer", fontFamily: FONT,
          }}
        >
          {status === "analyzing" ? `Analyzing… (${analyzed}/${total})` : `Ingest ${files.length} files`}
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
 * Read the selected files, stripping the common root folder and filtering
 * out ignored paths, non-code extensions, and oversized files.
 */
async function ReadSelectedFiles(selected: File[]): Promise<IngestFileEntry[]> {
  const paths = selected.map(file => file.webkitRelativePath || file.name);
  const rootParts = paths[0]?.split("/") ?? [];
  const commonPrefix = rootParts.length > 1 ? `${rootParts[0]}/` : "";

  const entries: IngestFileEntry[] = [];
  for (const file of selected) {
    const rawPath = file.webkitRelativePath || file.name;
    const relPath = commonPrefix !== "" ? rawPath.replace(commonPrefix, "") : rawPath;
    if (!ShouldInclude(relPath)) {
      continue;
    }
    const ext = GetExtension(file.name);
    if (!ALL_EXTS.has(ext)) {
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      continue;
    }
    try {
      const content = await file.text();
      entries.push({ path: relPath, name: file.name, content, ext });
    } catch {
      // Unreadable file — skip it.
    }
  }
  return entries;
}
