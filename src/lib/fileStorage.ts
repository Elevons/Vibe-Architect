import type { GraphSnapshot } from "./types";

/**
 * File-based persistence: saving downloads a pretty-printed JSON file,
 * loading reads one from a file picker.
 *
 * The browser cannot list or delete files on disk, so there is no
 * list/delete API here — saved graphs are ordinary .json files the user
 * manages like any other file.
 */

/** Characters that are illegal in file names on common OSes. */
const INVALID_NAME_CHARS = /[\\/:*?"<>|]/g;

/** Trigger a browser download of the snapshot as `<name>.json`. */
export function SaveGraphToFile(name: string, data: GraphSnapshot): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = FileNameFor(name);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Read and validate a snapshot from a picked file. Null when unreadable or malformed. */
export async function LoadGraphFromFile(file: File): Promise<GraphSnapshot | null> {
  try {
    return ParseGraphSnapshot(await file.text());
  } catch {
    return null;
  }
}

/**
 * Parse snapshot JSON with a light shape check: an object whose nodes,
 * edges, and groups are arrays (mode defaults to parallel).
 */
export function ParseGraphSnapshot(text: string): GraphSnapshot | null {
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const candidate = data as Partial<GraphSnapshot>;
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges) || !Array.isArray(candidate.groups)) {
    return null;
  }
  return {
    nodes: candidate.nodes,
    edges: candidate.edges,
    groups: candidate.groups,
    mode: candidate.mode === "serial" ? "serial" : "parallel",
  };
}

/** A safe .json file name for the given graph name. */
export function FileNameFor(name: string): string {
  const trimmed = name.trim().replace(INVALID_NAME_CHARS, "_");
  return `${trimmed === "" ? "graph" : trimmed}.json`;
}
