import type { GraphSnapshot } from "./types";

/**
 * Persistence for saved graphs.
 *
 * Uses the host-provided `window.storage` (e.g. Tauri's storage plugin)
 * under the "graph:" key prefix. Every operation degrades gracefully when
 * storage is unavailable.
 */

const KEY_PREFIX = "graph:";

function KeyFor(name: string): string {
  return `${KEY_PREFIX}${name}`;
}

/** Save a graph snapshot. Returns false when storage is unavailable. */
export async function SaveGraph(name: string, data: GraphSnapshot): Promise<boolean> {
  try {
    await window.storage?.set(KeyFor(name), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Load a graph snapshot by name, or null when missing/unavailable. */
export async function LoadGraph(name: string): Promise<GraphSnapshot | null> {
  try {
    const item = await window.storage?.get(KeyFor(name));
    return item ? (JSON.parse(item.value) as GraphSnapshot) : null;
  } catch {
    return null;
  }
}

/** List the names of all saved graphs. */
export async function ListGraphs(): Promise<string[]> {
  try {
    const result = await window.storage?.list(KEY_PREFIX);
    return result ? result.keys.map(key => key.replace(KEY_PREFIX, "")) : [];
  } catch {
    return [];
  }
}

/** Delete a saved graph. Returns false when storage is unavailable. */
export async function DeleteGraph(name: string): Promise<boolean> {
  const storage = window.storage;
  if (storage === undefined) {
    return false;
  }
  try {
    await storage.delete(KeyFor(name));
    return true;
  } catch {
    return false;
  }
}
