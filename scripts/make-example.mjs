// Generates examples/vibe-architect.json — a loadable GraphSnapshot of this
// project's own structure (folders, files, and import edges), so the app has
// a ready-made graph to open via Save/Load → load.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "examples");
mkdirSync(outDir, { recursive: true });

// ── Layout ─────────────────────────────────────────────────────────────
// Each folder's children are placed in a compact grid just below the
// folder card, so the auto-drawn folder background wraps them tightly.
const CARD_W = 280;
const STEP_X = 370; // card width + horizontal gap
const STEP_Y = 190; // room for a card + vertical gap

const nodes = [];
const edges = [];
let edgeSeq = 0;

function addNode(id, name, path, desc, type, parentId, x, y, collapsed = false) {
  nodes.push({
    id, name, path, desc, type,
    parentId,
    x, y,
    visible: true,
    collapsed,
    agentOutput: null,
    agentStatus: "idle",
  });
}
function addEdge(from, to, label = "") {
  edges.push({ id: `e${++edgeSeq}`, from, to, label });
}
// Place `count` children of a folder in a grid starting below its card.
function grid(originX, originY, count, cols = 2) {
  const positions = [];
  for (let index = 0; index < count; index++) {
    positions.push({ x: originX + (index % cols) * STEP_X, y: originY + Math.floor(index / cols) * STEP_Y });
  }
  return positions;
}

// ── Root folders ───────────────────────────────────────────────────────
addNode("src", "src/", "src", "Application source: entry point, components, hooks, and the core library.", "folder", null, 0, 0);
addNode("test", "test/", "test", "Headless-Chrome gesture and layout tests that drive the real app with synthetic pointer events.", "folder", null, 3 * STEP_X, 0);

// ── src/ top-level files (row under the src/ card) ────────────────────
addNode("main", "main.tsx", "src/main.tsx", "React entry point: mounts <App/> into #root.", "file", "src", 0, STEP_Y);
addNode("app", "App.tsx", "src/App.tsx", "Top-level shell that renders the VibeArchitect canvas.", "file", "src", STEP_X, STEP_Y);
addNode("viteenv", "vite-env.d.ts", "src/vite-env.d.ts", "Vite client type references for the build.", "file", "src", 2 * STEP_X, STEP_Y);

// ── src/lib/ (12 files, 2-column grid) ─────────────────────────────────
const libOrigin = { x: 0, y: 2 * STEP_Y };
addNode("lib", "lib/", "src/lib", "Framework-free core: domain types, geometry, graph algorithms, scene graph, and I/O.", "folder", "src", libOrigin.x, libOrigin.y);
const libCells = grid(libOrigin.x, libOrigin.y + STEP_Y, 12, 2);
const libFiles = [
  ["types", "types.ts", "src/lib/types.ts", "Domain types: GraphNode, GraphEdge, GraphSnapshot, Points, Bounds, NodeSize."],
  ["constants", "constants.ts", "src/lib/constants.ts", "Shared constants: card sizes, fonts, type colors, group colors."],
  ["ids", "ids.ts", "src/lib/ids.ts", "Unique id generation for nodes and edges."],
  ["geometry", "geometry.ts", "src/lib/geometry.ts", "Canvas geometry: port positions, edge curves, coordinate conversion, bounds."],
  ["graph", "graph.ts", "src/lib/graph.ts", "Graph algorithms: topological sort and cycle detection."],
  ["scenegraph", "sceneGraph.ts", "src/lib/sceneGraph.ts", "Scene-graph ops: parent/child maps, rendered set, subtree ids, reparenting."],
  ["layout", "layout.ts", "src/lib/layout.ts", "DAG layout: assigns x/y so dependencies flow left to right."],
  ["anthropic", "anthropic.ts", "src/lib/anthropic.ts", "Thin client for the Anthropic messages API."],
  ["agent", "agent.ts", "src/lib/agent.ts", "Per-node code-generation agent: builds a prompt and calls the model."],
  ["ingest", "ingest.ts", "src/lib/ingest.ts", "Repository ingestion: reads files, describes them, parses imports into edges."],
  ["prompt", "prompt.ts", "src/lib/prompt.ts", "Serializes the graph to an architecture prompt (file layout + modules + deps)."],
  ["filestorage", "fileStorage.ts", "src/lib/fileStorage.ts", "JSON file persistence: save downloads, load parses and normalizes snapshots."],
];
libFiles.forEach((entry, index) => addNode(entry[0], entry[1], entry[2], entry[3], "file", "lib", libCells[index].x, libCells[index].y));

// ── src/hooks/ (4 files, 2-column grid) ────────────────────────────────
const hooksOrigin = { x: 2 * STEP_X, y: 2 * STEP_Y };
addNode("hooks", "hooks/", "src/hooks", "React hooks that wrap canvas interaction, sizing, zoom, and double-tap.", "folder", "src", hooksOrigin.x, hooksOrigin.y);
const hooksCells = grid(hooksOrigin.x, hooksOrigin.y + STEP_Y, 4, 2);
const hooksFiles = [
  ["usecanvassize", "useCanvasSize.ts", "src/hooks/useCanvasSize.ts", "Tracks the canvas element's width/height with a ResizeObserver."],
  ["usewheelzoom", "useWheelZoom.ts", "src/hooks/useWheelZoom.ts", "Scroll-wheel zoom centered on the cursor."],
  ["useinteraction", "useCanvasInteraction.ts", "src/hooks/useCanvasInteraction.ts", "Pointer logic for panning, node dragging, and edge drafting."],
  ["usedoubletap", "useDoubleTap.ts", "src/hooks/useDoubleTap.ts", "Detects a double-tap/click to trigger edit."],
];
hooksFiles.forEach((entry, index) => addNode(entry[0], entry[1], entry[2], entry[3], "file", "hooks", hooksCells[index].x, hooksCells[index].y));

// ── src/components/ (9 files, 2-column grid) ───────────────────────────
const componentsOrigin = { x: 0, y: 9 * STEP_Y };
addNode("components", "components/", "src/components", "Presentational React components for the canvas, cards, panels, and modals.", "folder", "src", componentsOrigin.x, componentsOrigin.y);
const componentsCells = grid(componentsOrigin.x, componentsOrigin.y + STEP_Y, 9, 2);
const componentsFiles = [
  ["vibe", "VibeArchitect.tsx", "src/components/VibeArchitect.tsx", "The canvas: owns graph state, renders nodes/edges/minimap/panels, wires interactions."],
  ["nodecard", "NodeCard.tsx", "src/components/NodeCard.tsx", "A single node card: display, edit form, eye/chevron, ports, size measurement."],
  ["minimap", "Minimap.tsx", "src/components/Minimap.tsx", "Bottom-right overview map: parent fills, edge lines, node rects, viewport."],
  ["hierarchyp", "HierarchyPanel.tsx", "src/components/HierarchyPanel.tsx", "Right-side tree browser of the scene graph with focus, fold, and visibility."],
  ["edgelabel", "EdgeLabel.tsx", "src/components/EdgeLabel.tsx", "Inline-editable label rendered on an SVG edge."],
  ["toolbar", "Toolbar.tsx", "src/components/Toolbar.tsx", "Top toolbar: add node, layout mode, zoom, fit/tidy, run, save, export."],
  ["statusbar", "StatusBar.tsx", "src/components/StatusBar.tsx", "Bottom bar with rotating usage hints and node/edge counts."],
  ["btn", "Btn.tsx", "src/components/Btn.tsx", "Styled button primitive used across the toolbar and cards."],
  ["modals", "modals/", "src/components/modals", "Overlay dialogs: prompt export, save/load, and ingestion.", "folder"],
];
componentsFiles.forEach((entry, index) => {
  const isFolder = entry[4] === "folder";
  addNode(entry[0], entry[1], entry[2], entry[3], isFolder ? "folder" : "file", "components", componentsCells[index].x, componentsCells[index].y);
});

// ── src/components/modals/ (4 files, 2-column grid) ────────────────────
const modalsNode = nodes.find(node => node.id === "modals");
const modalsCells = grid(modalsNode.x, modalsNode.y + STEP_Y, 4, 2);
const modalsFiles = [
  ["modalshell", "ModalShell.tsx", "src/components/modals/ModalShell.tsx", "Shared modal chrome: backdrop, centered panel, close handling."],
  ["promptmodal", "PromptModal.tsx", "src/components/modals/PromptModal.tsx", "Shows the exported architecture prompt with copy-to-clipboard."],
  ["saveloadmodal", "SaveLoadModal.tsx", "src/components/modals/SaveLoadModal.tsx", "Save the graph to a JSON file and load one back."],
  ["ingestmodal", "IngestModal.tsx", "src/components/modals/IngestModal.tsx", "Pick a directory to ingest as a graph of files and import edges."],
];
modalsFiles.forEach((entry, index) => addNode(entry[0], entry[1], entry[2], entry[3], "file", "modals", modalsCells[index].x, modalsCells[index].y));

// ── test/ (2 files) ────────────────────────────────────────────────────
const testCells = grid(3 * STEP_X, STEP_Y, 2, 1);
addNode("mobiletest", "mobile.test.tsx", "test/mobile.test.tsx", "Synthetic-pointer gesture suite: pan, pinch, drag, tap, edges, hierarchy.", "file", "test", testCells[0].x, testCells[0].y);
addNode("layouttest", "layout.test.tsx", "test/layout.test.tsx", "Layout metrics probe: toolbar wrap, touch targets, minimap, panel gaps.", "file", "test", testCells[1].x, testCells[1].y);

// ── Import edges (from the real source) ────────────────────────────────
// Entry chain
addEdge("main", "app", "mounts");
addEdge("app", "vibe", "renders");
// VibeArchitect is the hub
addEdge("vibe", "nodecard", "renders");
addEdge("vibe", "minimap", "renders");
addEdge("vibe", "hierarchyp", "renders");
addEdge("vibe", "edgelabel", "renders");
addEdge("vibe", "toolbar", "renders");
addEdge("vibe", "statusbar", "renders");
addEdge("vibe", "promptmodal", "opens");
addEdge("vibe", "saveloadmodal", "opens");
addEdge("vibe", "ingestmodal", "opens");
addEdge("vibe", "useinteraction", "uses");
addEdge("vibe", "usecanvassize", "uses");
addEdge("vibe", "usewheelzoom", "uses");
addEdge("vibe", "agent", "runs");
addEdge("vibe", "geometry", "layout");
addEdge("vibe", "graph", "toposort");
addEdge("vibe", "ids", "ids");
addEdge("vibe", "layout", "tidy");
addEdge("vibe", "scenegraph", "ops");
// Cards / panels
addEdge("nodecard", "btn", "uses");
addEdge("nodecard", "usedoubletap", "uses");
addEdge("nodecard", "scenegraph", "ops");
addEdge("minimap", "geometry", "bounds");
addEdge("minimap", "scenegraph", "children");
addEdge("hierarchyp", "scenegraph", "tree");
addEdge("edgelabel", "usedoubletap", "uses");
addEdge("toolbar", "btn", "uses");
addEdge("statusbar", "constants", "hints");
// Hooks
addEdge("useinteraction", "constants", "sizes");
addEdge("usewheelzoom", "constants", "zoom");
// lib internal
addEdge("constants", "types", "typed");
addEdge("geometry", "constants", "sizes");
addEdge("geometry", "types", "typed");
addEdge("graph", "types", "typed");
addEdge("scenegraph", "types", "typed");
addEdge("layout", "constants", "sizes");
addEdge("layout", "types", "typed");
addEdge("agent", "anthropic", "calls");
addEdge("agent", "types", "typed");
addEdge("ingest", "agent", "describes");
addEdge("ingest", "ids", "ids");
addEdge("ingest", "layout", "lays out");
addEdge("ingest", "types", "typed");
addEdge("prompt", "graph", "toposort");
addEdge("prompt", "scenegraph", "tree");
addEdge("prompt", "types", "typed");
addEdge("filestorage", "types", "typed");
// Modals
addEdge("promptmodal", "modalshell", "wraps");
addEdge("promptmodal", "prompt", "builds");
addEdge("saveloadmodal", "modalshell", "wraps");
addEdge("saveloadmodal", "filestorage", "io");
addEdge("ingestmodal", "modalshell", "wraps");
addEdge("ingestmodal", "ingest", "runs");
// Tests drive the app
addEdge("mobiletest", "vibe", "drives");
addEdge("layouttest", "vibe", "probes");

const snapshot = { nodes, edges, mode: "parallel" };
const outFile = join(outDir, "vibe-architect.json");
writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
console.log(`Wrote ${outFile}: ${nodes.length} nodes, ${edges.length} edges`);
