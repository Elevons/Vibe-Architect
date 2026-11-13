import { NormalizeSnapshot } from "./fileStorage";
import type { GraphSnapshot } from "./types";

/**
 * Host storage for the embedded app. A host serves the built page under a
 * ticketed path and answers `api/graph` beside it: one graph per embedded
 * board, plus the prompt generated from that graph.
 *
 * The app reads the document on start, saves it after edits (debounced by the
 * caller), and asks for it again now and then so an edit made through the
 * host's toolset appears without a reload.
 */

/** One stored board: the graph, the prompt made from it, and its save counter. */
export interface EmbeddedDocument {
  revision: number;
  graph: GraphSnapshot;
  prompt: string;
}

const GRAPH_URL = "./api/graph";

/** True when the page is framed by a host that owns storage. */
export function IsEmbedded(): boolean {
  return new URLSearchParams(window.location.search).get("embed") === "1";
}

/** Read the board from the host. Null when the host has none or is unreachable. */
export async function LoadEmbeddedDocument(): Promise<EmbeddedDocument | null> {
  try {
    const response = await fetch(GRAPH_URL, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return ParseDocument(await response.json());
  } catch {
    return null;
  }
}

/** Replace the board at the host. Null when the save did not reach it. */
export async function SaveEmbeddedDocument(graph: GraphSnapshot): Promise<EmbeddedDocument | null> {
  try {
    const response = await fetch(GRAPH_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graph }),
    });
    if (!response.ok) {
      return null;
    }
    return ParseDocument(await response.json());
  } catch {
    return null;
  }
}

/** Validate one answer from the host. */
function ParseDocument(data: unknown): EmbeddedDocument | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as { revision?: unknown; graph?: unknown; prompt?: unknown };
  const graph = NormalizeSnapshot(record.graph);
  if (graph === null) {
    return null;
  }
  return {
    revision: typeof record.revision === "number" ? record.revision : 0,
    graph,
    prompt: typeof record.prompt === "string" ? record.prompt : "",
  };
}
