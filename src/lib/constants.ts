import type { NodeType, RunMode, TypeColors } from "./types";

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
