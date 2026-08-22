import type { GraphEdge, GraphNode, NodeType, RunMode, TypeColors } from "./types";

/** Canvas node dimensions in world units. */
export const NODE_W = 280;
export const NODE_H = 110;
/** Height of a collapsed node card (a parent tucked away). */
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
 * Demo scene graph: a small folder tree (web/ with two sub-folders, a
 * collapsed docs/ folder, and a standalone concept) plus the dependency
 * edges between the files.
 */
export const DEMO_NODES: GraphNode[] = [
  {
    id: "web", x: 60, y: 80, name: "web/", path: "web", desc: "The web application: frontend and backend.",
    type: "folder", parentId: null, visible: true, collapsed: false,
    agentOutput: null, agentStatus: "idle",
  },
  {
    id: "frontend", x: 420, y: 40, name: "web/frontend/", path: "web/frontend",
    desc: "Client-side UI and data access.",
    type: "folder", parentId: "web", visible: true, collapsed: false,
    agentOutput: null, agentStatus: "idle",
  },
  {
    id: "backend", x: 420, y: 260, name: "web/backend/", path: "web/backend",
    desc: "Server, API, and persistence.",
    type: "folder", parentId: "web", visible: true, collapsed: false,
    agentOutput: null, agentStatus: "idle",
  },
  {
    id: "app", x: 780, y: 0, name: "App.tsx", path: "web/frontend/App.tsx",
    desc: "Root React component; renders the page and fetches data.",
    type: "file", parentId: "frontend", visible: true, collapsed: false,
    agentOutput: null, agentStatus: "idle",
  },
  {
    id: "api", x: 780, y: 140, name: "api.ts", path: "web/frontend/api.ts",
    desc: "Typed fetch wrappers for the backend API.",
    type: "file", parentId: "frontend", visible: true, collapsed: false,
    agentOutput: null, agentStatus: "idle",
  },
  {
    id: "server", x: 780, y: 260, name: "server.ts", path: "web/backend/server.ts",
    desc: "HTTP server; routes requests to the data layer.",
    type: "file", parentId: "backend", visible: true, collapsed: false,
    agentOutput: null, agentStatus: "idle",
  },
  {
    id: "db", x: 1140, y: 260, name: "db.ts", path: "web/backend/db.ts",
    desc: "Database connection and query helpers.",
    type: "file", parentId: "backend", visible: true, collapsed: false,
    agentOutput: null, agentStatus: "idle",
  },
  {
    id: "docs", x: 60, y: 420, name: "docs/", path: "docs",
    desc: "Project documentation (collapsed).",
    type: "folder", parentId: null, visible: true, collapsed: true,
    agentOutput: null, agentStatus: "idle",
  },
  {
    id: "readme", x: 420, y: 420, name: "README.md", path: "docs/README.md",
    desc: "Project overview and setup instructions.",
    type: "file", parentId: "docs", visible: true, collapsed: false,
    agentOutput: null, agentStatus: "idle",
  },
  {
    id: "ci", x: 1140, y: 60, name: "CI Pipeline", path: "",
    desc: "Build, test, and deploy on every push.",
    type: "concept", parentId: null, visible: true, collapsed: false,
    agentOutput: null, agentStatus: "idle",
  },
];

export const DEMO_EDGES: GraphEdge[] = [
  { id: "e1", from: "app", to: "api", label: "imports" },
  { id: "e2", from: "api", to: "server", label: "HTTP" },
  { id: "e3", from: "server", to: "db", label: "queries" },
  { id: "e4", from: "readme", to: "web", label: "documents" },
];
