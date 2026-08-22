import type { GraphEdge, GraphNode, NodeType, RunMode, TypeColors } from "./types";

/** Canvas node dimensions in world units. */
export const NODE_W = 280;
export const NODE_H = 110;
/** Height of a collapsed group card. */
export const GROUP_CARD_H = 64;

/** Zoom limits and wheel step. */
export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.08;

/** Colors per node type. */
export const TYPE_COLORS: Record<NodeType, TypeColors> = {
  file: { bg: "#1a1a2f", border: "#818cf8", dot: "#818cf8" },
  folder: { bg: "#1a2f1a", border: "#4ade80", dot: "#4ade80" },
  concept: { bg: "#2f2a1a", border: "#facc15", dot: "#facc15" },
};

/** Semi-transparent fill colors cycled across groups. */
export const GROUP_COLORS = [
  "#818cf830",
  "#4ade8030",
  "#fb923c30",
  "#facc1530",
  "#22d3ee30",
  "#f472b630",
];

/** The monospace face used across the UI. */
export const FONT = "'IBM Plex Mono', ui-monospace, monospace";

/** Minimap viewport size in screen pixels. */
export const MINIMAP_W = 200;
export const MINIMAP_H = 140;

/** Execution modes offered in the toolbar. */
export const RUN_MODES: RunMode[] = ["parallel", "serial"];

/**
 * Demo graph shown on first load: a small Express API with two middleware
 * modules feeding a route module.
 */
export const DEMO_NODES: GraphNode[] = [
  {
    id: "n1", x: 100, y: 100, name: "server.js", path: "src/server.js",
    desc: "Express entry point. Mounts routes, middleware, starts listening on PORT.",
    type: "file", group: null, agentOutput: null, agentStatus: "idle",
  },
  {
    id: "n2", x: 480, y: 60, name: "auth.js", path: "src/middleware/auth.js",
    desc: "JWT authentication middleware. Validates bearer tokens, attaches user to req.",
    type: "file", group: null, agentOutput: null, agentStatus: "idle",
  },
  {
    id: "n3", x: 480, y: 300, name: "database.js", path: "src/middleware/database.js",
    desc: "PostgreSQL pool wrapper. Exports query() helper and transaction support.",
    type: "file", group: null, agentOutput: null, agentStatus: "idle",
  },
  {
    id: "n4", x: 860, y: 180, name: "users.js", path: "src/routes/users.js",
    desc: "User CRUD routes: GET/POST/PUT/DELETE. Requires auth + database.",
    type: "file", group: null, agentOutput: null, agentStatus: "idle",
  },
];

export const DEMO_EDGES: GraphEdge[] = [
  { id: "e1", from: "n1", to: "n2", label: "mounts middleware" },
  { id: "e2", from: "n1", to: "n3", label: "initializes pool" },
  { id: "e3", from: "n2", to: "n4", label: "protects routes" },
  { id: "e4", from: "n3", to: "n4", label: "provides query()" },
];
