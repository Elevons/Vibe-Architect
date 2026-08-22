/**
 * Core domain types for the architecture graph.
 *
 * Terminology: a *node* is a box on the canvas (file, folder, or concept),
 * an *edge* is a dependency arrow between nodes, and a *group* is a named
 * subgraph that can be collapsed into a folder card.
 */

/** Kinds of boxes that can appear on the canvas. */
export type NodeType = "file" | "folder" | "concept";

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
  /** Owning group id, or null for ungrouped nodes. */
  group: string | null;
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

/** A named subgraph. `x`/`y` are set by layout when it renders as a card. */
export interface GraphGroup {
  id: string;
  name: string;
  collapsed?: boolean;
  x?: number | null;
  y?: number | null;
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
  groups: GraphGroup[];
  mode: RunMode;
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
  groups: GraphGroup[];
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
  groups: GraphGroup[];
}
