/**
 * Core domain types for the architecture graph.
 *
 * The graph is a *scene graph*: every node is an object in a tree (via
 * `parentId`) that can be shown/hidden (`visible`) and, when it has
 * children, collapsed into a compact card (`collapsed`). A *folder* node
 * is a group — there is no separate group type.
 */

/**
 * Kinds of boxes that can appear on the canvas. The `(string & {})` term
 * admits plugin-defined custom types while keeping autocomplete for the
 * built-ins.
 */
export type NodeType = "file" | "folder" | "concept" | (string & {});

/** One node definition shipped inside a plugin package. */
export interface PluginNodeDef {
  /** Custom node type id, unique within the plugin (e.g. "b2b:export"). */
  type: string;
  /** Display name in the toolbar dropdown and on the card. */
  label: string;
  /** Default description for nodes created from this definition. */
  desc?: string;
  /** Optional dropdown section (e.g. "Pipeline", "Components"). */
  category?: string;
  /** Optional accent color (hex) for cards and ports. */
  color?: string;
}

/** A node package: a named bundle of custom node definitions. */
export interface Plugin {
  /** Package name, shown under Custom nodes in the toolbar. */
  name: string;
  version?: string;
  description?: string;
  nodes: PluginNodeDef[];
}

/** Lifecycle of the per-node code-generation agent. */
export type AgentStatus = "idle" | "running" | "done" | "error";

/** How "Run All" executes the agent across the graph. */
export type RunMode = "parallel" | "serial";

/** A box on the canvas. */
export interface GraphNode {
  id: string;
  x: number;
  y: number;
  name: string;
  path: string;
  desc: string;
  type: NodeType;
  /** Parent node id in the scene graph, or null for a root. */
  parentId: string | null;
  /** Shown on the canvas when true (independent of children). */
  visible: boolean;
  /** When true, renders as a compact card and tucks its subtree away. */
  collapsed: boolean;
  /** Code produced by the agent, if any. */
  agentOutput: string | null;
  agentStatus: AgentStatus;
}

/** A dependency arrow from one node to another. */
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

/** Axis-aligned rectangle in world coordinates. */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A point in world coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** Everything persisted with a saved graph. */
export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  mode: RunMode;
  /** Plugins whose custom node types the graph uses (optional). */
  plugins?: Plugin[];
}

/** A code file read from disk during repository ingestion. */
export interface IngestFileEntry {
  path: string;
  name: string;
  content: string;
  ext: string;
}

/** The graph produced by ingesting a repository. */
export interface IngestResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Per-node-type colors used by cards, ports, and the minimap. */
export interface TypeColors {
  bg: string;
  border: string;
  dot: string;
}

/** Positioning of a laid-out graph. */
export interface LayoutResult {
  nodes: GraphNode[];
}

/**
 * Measured on-canvas size of a node card (border box, world units).
 * Card heights vary with content, so edges use these instead of the
 * default dimensions whenever a measurement is available.
 */
export interface NodeSize {
  width: number;
  height: number;
}
