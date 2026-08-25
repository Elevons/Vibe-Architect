import { ParsePluginArray } from "./plugins";
import type { GraphEdge, GraphNode, GraphSnapshot } from "./types";

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
 * Parse snapshot JSON with a light shape check: an object whose nodes and
 * edges are arrays (mode defaults to parallel). Node fields are normalized
 * so files saved before the scene-graph fields existed still load.
 */
export function ParseGraphSnapshot(text: string): GraphSnapshot | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const candidate = data as Partial<GraphSnapshot> & { groups?: unknown };
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) {
    return null;
  }
  const plugins = ParsePluginArray(candidate.plugins);
  const pluginTypes = new Set<string>();
  for (const plugin of plugins) {
    for (const node of plugin.nodes) {
      pluginTypes.add(node.type);
    }
  }
  const nodes = [...candidate.nodes.map(raw => NormalizeNode(raw, pluginTypes)), ...LegacyGroupFolders(candidate.groups)];
  const snapshot: GraphSnapshot = {
    nodes,
    edges: FilterGroupingEdges(nodes, candidate.edges),
    mode: candidate.mode === "serial" ? "serial" : "parallel",
  };
  if (plugins.length > 0) {
    snapshot.plugins = plugins;
  }
  return snapshot;
}

/**
 * Fill in missing scene-graph fields with safe defaults. A legacy `group`
 * membership becomes a parent link, so old files keep their grouping.
 */
function NormalizeNode(raw: unknown, pluginTypes: Set<string>): GraphNode {
  const node = raw as Partial<GraphNode> & { group?: unknown };
  const legacyGroup = typeof node.group === "string" ? node.group : null;
  return {
    id: typeof node.id === "string" ? node.id : "",
    x: Number(node.x ?? 0),
    y: Number(node.y ?? 0),
    name: typeof node.name === "string" ? node.name : "",
    path: typeof node.path === "string" ? node.path : "",
    desc: typeof node.desc === "string" ? node.desc : "",
    type: NormalizeType(node.type, pluginTypes),
    parentId: typeof node.parentId === "string" ? node.parentId : legacyGroup,
    visible: node.visible !== false,
    collapsed: node.collapsed === true,
    agentOutput: typeof node.agentOutput === "string" ? node.agentOutput : null,
    agentStatus: IsAgentStatus(node.agentStatus) ? node.agentStatus : "idle",
    // Object→component attachments persist as componentIds; restore only the
    // ids that still exist as nodes (checked after every node is normalized).
    componentIds: Array.isArray(node.componentIds)
      ? (node.componentIds as unknown[]).filter((id): id is string => typeof id === "string")
      : undefined,
  };
}

/**
 * Keep only grouping edges: both endpoints resolve and at least one
 * endpoint is a folder. File-to-file dependency edges from older files are
 * documentation, not architecture, and are dropped on load.
 */
function FilterGroupingEdges(nodes: GraphNode[], rawEdges: unknown[]): GraphEdge[] {
  const typeById = new Map(nodes.map(node => [node.id, node.type]));
  const edges: GraphEdge[] = [];
  for (const raw of rawEdges) {
    const edge = raw as Partial<GraphEdge>;
    if (typeof edge.id !== "string" || edge.id === "") {
      continue;
    }
    if (typeof edge.from !== "string" || typeof edge.to !== "string") {
      continue;
    }
    const fromType = typeById.get(edge.from);
    const toType = typeById.get(edge.to);
    if (fromType === undefined || toType === undefined) {
      continue;
    }
    // Keep grouping edges (a folder endpoint) and object attachments (an
    // object endpoint). Everything else is dropped on load.
    if (fromType !== "folder" && toType !== "folder" && fromType !== "object" && toType !== "object") {
      continue;
    }
    edges.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: typeof edge.label === "string" ? edge.label : "",
    });
  }
  return edges;
}

/**
 * Keep built-in types, keep plugin types declared by this snapshot's own
 * plugins, and fall back: missing → file, unknown custom → concept (so a
 * graph whose plugin is missing still renders sensibly).
 */
function NormalizeType(raw: unknown, pluginTypes: Set<string>): GraphNode["type"] {
  if (typeof raw !== "string" || raw === "") {
    return "file";
  }
  if (raw === "file" || raw === "folder" || raw === "concept" || raw === "object") {
    return raw;
  }
  if (pluginTypes.has(raw)) {
    return raw;
  }
  return "concept";
}

/** Legacy group entries become folder nodes, keeping their id as the parent id. */
function LegacyGroupFolders(rawGroups: unknown): GraphNode[] {
  if (!Array.isArray(rawGroups)) {
    return [];
  }
  const folders: GraphNode[] = [];
  for (const raw of rawGroups) {
    const group = raw as { id?: unknown; name?: unknown; collapsed?: unknown; x?: unknown; y?: unknown } | null;
    if (group === null || typeof group.id !== "string") {
      continue;
    }
    folders.push({
      id: group.id,
      x: Number(group.x ?? 0),
      y: Number(group.y ?? 0),
      name: typeof group.name === "string" ? `${group.name}/` : "folder/",
      path: "",
      desc: "Directory",
      type: "folder",
      parentId: null,
      visible: true,
      collapsed: group.collapsed === true,
      agentOutput: null,
      agentStatus: "idle",
    });
  }
  return folders;
}

/** Narrow an unknown value to AgentStatus. */
function IsAgentStatus(value: unknown): value is GraphNode["agentStatus"] {
  return value === "idle" || value === "running" || value === "done" || value === "error";
}

/** A safe .json file name for the given graph name. */
export function FileNameFor(name: string): string {
  const trimmed = name.trim().replace(INVALID_NAME_CHARS, "_");
  return `${trimmed === "" ? "graph" : trimmed}.json`;
}
