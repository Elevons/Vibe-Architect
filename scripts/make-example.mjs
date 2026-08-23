// Generates examples/vibe-architect.json — a loadable GraphSnapshot of this
// project's own structure (folders, files, and import edges), so the app has
// a ready-made graph to open via Save/Load → load.
//
// Layout: edges flow top to bottom (output port on a card's bottom edge,
// input port on its top edge), so importers sit above the modules they
// import. Folders sit just above the cluster they group.
//
// The graph is self-referential in two places: examples/vibe-architect.json
// contains a card for itself, and scripts/make-example.mjs contains a card
// for the very script that writes it.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "examples");
mkdirSync(outDir, { recursive: true });

// ── Layout grid ────────────────────────────────────────────────────────
const STEP_X = 370; // card width (280) + horizontal gap
const STEP_Y = 190; // room for a card + vertical gap
const col = index => index * STEP_X;
const row = index => index * STEP_Y;

const nodes = [];
const edges = [];
let edgeSeq = 0;

function addNode(id, name, path, desc, type, parentId, x, y) {
  nodes.push({
    id, name, path, desc, type,
    parentId,
    x, y,
    visible: true,
    collapsed: false,
    agentOutput: null,
    agentStatus: "idle",
  });
}
function addEdge(from, to, label = "") {
  edges.push({ id: `e${++edgeSeq}`, from, to, label });
}

// Rows follow the topological order of the import graph: an importer sits
// in a row above the modules it imports, so every edge flows downward.
// Folders sit just above the cluster they group.

// ── Row 0: root folders ────────────────────────────────────────────────
addNode("src", "src/", "src", "Application source: entry point, components, hooks, and the core library.", "folder", null, col(0), row(0));
addNode("test", "test/", "test", "Headless-Chrome gesture and layout tests that drive the real app with synthetic pointer events.", "folder", null, col(4), row(0));
addNode("examples", "examples/", "examples", "Loadable data: this project's own snapshot and the b2bkit plugin package.", "folder", null, col(6), row(0));
addNode("scripts", "scripts/", "scripts", "Build helpers that regenerate the example snapshot.", "folder", null, col(8), row(0));

// ── Row 1: entry point + tests (the graph's roots) ─────────────────────
addNode("main", "main.tsx", "src/main.tsx", "React entry point: mounts <App/> into #root.", "file", "src", col(0), row(1));
addNode("viteenv", "vite-env.d.ts", "src/vite-env.d.ts", "Vite client type references for the build.", "file", "src", col(1), row(1));
addNode("mobiletest", "mobile.test.tsx", "test/mobile.test.tsx", "Synthetic-pointer gesture suite: pan, pinch, drag, tap, edges, hierarchy, pinch anchoring.", "file", "test", col(4), row(1));
addNode("layouttest", "layout.test.tsx", "test/layout.test.tsx", "Layout metrics probe: toolbar wrap, touch targets, minimap, panel gaps.", "file", "test", col(5), row(1));
addNode("examplestest", "example.test.tsx", "test/example.test.tsx", "Loads examples/vibe-architect.json through the app's pipeline and checks its well-formedness.", "file", "test", col(6), row(1));
addNode("pluginstest", "plugins.test.tsx", "test/plugins.test.tsx", "Plugin suite: parse/validate, color and name resolution, snapshot round-trip, import + Add-menu UI.", "file", "test", col(7), row(1));

// ── Row 2: app shell ───────────────────────────────────────────────────
addNode("app", "App.tsx", "src/App.tsx", "Top-level shell that renders the VibeArchitect canvas.", "file", "src", col(0), row(2));

// ── Row 3: the canvas hub ──────────────────────────────────────────────
addNode("vibe", "VibeArchitect.tsx", "src/components/VibeArchitect.tsx", "The canvas: owns graph state, renders nodes/edges/minimap/panels, wires interactions.", "file", "components", col(0), row(3));

// ── Row 4: the two big clusters ────────────────────────────────────────
addNode("components", "components/", "src/components", "Presentational React components for the canvas, cards, panels, and modals.", "folder", "src", col(0), row(4));
addNode("hooks", "hooks/", "src/hooks", "React hooks that wrap canvas interaction, sizing, zoom, and double-tap.", "folder", "src", col(2), row(4));

// ── Row 5: component cards + hooks (all import only from below) ────────
addNode("nodecard", "NodeCard.tsx", "src/components/NodeCard.tsx", "A single node card: display, edit form, eye/chevron, ports, size measurement.", "file", "components", col(0), row(5));
addNode("minimap", "Minimap.tsx", "src/components/Minimap.tsx", "Bottom-right overview map: parent fills, edge lines, node rects, viewport.", "file", "components", col(1), row(5));
addNode("hierarchyp", "HierarchyPanel.tsx", "src/components/HierarchyPanel.tsx", "Right-side tree browser of the scene graph with focus, fold, and visibility.", "file", "components", col(2), row(5));
addNode("edgelabel", "EdgeLabel.tsx", "src/components/EdgeLabel.tsx", "Inline-editable label rendered on an SVG edge.", "file", "components", col(3), row(5));
addNode("usecanvassize", "useCanvasSize.ts", "src/hooks/useCanvasSize.ts", "Tracks the canvas element's width/height with a ResizeObserver.", "file", "hooks", col(4), row(5));
addNode("usewheelzoom", "useWheelZoom.ts", "src/hooks/useWheelZoom.ts", "Scroll-wheel zoom centered on the cursor.", "file", "hooks", col(5), row(5));

// ── Row 6: remaining components + hooks ────────────────────────────────
addNode("toolbar", "Toolbar.tsx", "src/components/Toolbar.tsx", "Top toolbar: Add ▾ node menu (built-ins + plugin packages), Plugins, layout mode, zoom, fit/tidy, run, save, export.", "file", "components", col(0), row(6));
addNode("statusbar", "StatusBar.tsx", "src/components/StatusBar.tsx", "Bottom bar with rotating usage hints and node/edge counts.", "file", "components", col(1), row(6));
addNode("useinteraction", "useCanvasInteraction.ts", "src/hooks/useCanvasInteraction.ts", "Pointer logic for panning, node dragging, and edge drafting; live pan/zoom refs keep pinches anchored.", "file", "hooks", col(4), row(6));

// ── Row 7: leaf components + the modal/lib folders ─────────────────────
addNode("btn", "Btn.tsx", "src/components/Btn.tsx", "Styled button primitive used across the toolbar and cards.", "file", "components", col(0), row(7));
addNode("usedoubletap", "useDoubleTap.ts", "src/hooks/useDoubleTap.ts", "Detects a double-tap/click to trigger edit.", "file", "hooks", col(1), row(7));
addNode("modals", "modals/", "src/components/modals", "Overlay dialogs: prompt export, save/load, ingestion, and plugin import.", "folder", "components", col(2), row(7));
addNode("lib", "lib/", "src/lib", "Framework-free core: domain types, geometry, graph algorithms, scene graph, plugins, and I/O.", "folder", "src", col(4), row(7));

// ── Row 8: modal cards + top lib modules ───────────────────────────────
addNode("promptmodal", "PromptModal.tsx", "src/components/modals/PromptModal.tsx", "Shows the exported architecture prompt with copy-to-clipboard.", "file", "modals", col(2), row(8));
addNode("saveloadmodal", "SaveLoadModal.tsx", "src/components/modals/SaveLoadModal.tsx", "Save the graph to a JSON file and load one back.", "file", "modals", col(3), row(8));
addNode("ingestmodal", "IngestModal.tsx", "src/components/modals/IngestModal.tsx", "Pick a directory to ingest as a graph of files and import edges.", "file", "modals", col(4), row(8));
addNode("pluginmodal", "PluginModal.tsx", "src/components/modals/PluginModal.tsx", "Import custom node packages from JSON files and list the loaded plugins.", "file", "modals", col(5), row(8));
addNode("agent", "agent.ts", "src/lib/agent.ts", "Per-node code-generation agent: builds a prompt and calls the model.", "file", "lib", col(6), row(8));
addNode("ingest", "ingest.ts", "src/lib/ingest.ts", "Repository ingestion: reads files, describes them, parses imports into edges.", "file", "lib", col(7), row(8));

// ── Row 9: modal shell + mid lib modules ───────────────────────────────
addNode("modalshell", "ModalShell.tsx", "src/components/modals/ModalShell.tsx", "Shared modal chrome: backdrop, centered panel, close handling.", "file", "modals", col(2), row(9));
addNode("geometry", "geometry.ts", "src/lib/geometry.ts", "Canvas geometry: port positions, edge curves, coordinate conversion, bounds.", "file", "lib", col(5), row(9));
addNode("prompt", "prompt.ts", "src/lib/prompt.ts", "Serializes the graph to an architecture prompt (file layout + modules + deps).", "file", "lib", col(6), row(9));

// ── Row 10: lower lib modules ──────────────────────────────────────────
addNode("graph", "graph.ts", "src/lib/graph.ts", "Graph algorithms: topological sort and cycle detection.", "file", "lib", col(5), row(10));
addNode("scenegraph", "sceneGraph.ts", "src/lib/sceneGraph.ts", "Scene-graph ops: parent/child maps, rendered set, subtree ids, reparenting.", "file", "lib", col(6), row(10));
addNode("filestorage", "fileStorage.ts", "src/lib/fileStorage.ts", "JSON file persistence: save downloads, load parses and normalizes snapshots (embedding their plugins).", "file", "lib", col(7), row(10));

// ── Row 11: deep lib modules ───────────────────────────────────────────
addNode("layout", "layout.ts", "src/lib/layout.ts", "DAG layout: assigns x/y so dependencies flow top to bottom.", "file", "lib", col(5), row(11));
addNode("ids", "ids.ts", "src/lib/ids.ts", "Unique id generation for nodes and edges.", "file", "lib", col(6), row(11));
addNode("plugins", "plugins.ts", "src/lib/plugins.ts", "Plugin packages: parse/validate JSON node-type definitions and resolve colors and default names.", "file", "lib", col(7), row(11));

// ── Row 12: leaf lib modules ───────────────────────────────────────────
addNode("anthropic", "anthropic.ts", "src/lib/anthropic.ts", "Thin client for the Anthropic messages API.", "file", "lib", col(5), row(12));
addNode("constants", "constants.ts", "src/lib/constants.ts", "Shared constants: card sizes, fonts, built-in type colors, group colors.", "file", "lib", col(6), row(12));

// ── Row 13: the foundation ─────────────────────────────────────────────
addNode("types", "types.ts", "src/lib/types.ts", "Domain types: GraphNode, GraphEdge, GraphSnapshot, Plugin, Points, Bounds, NodeSize.", "file", "lib", col(6), row(13));

// ── Row 14: examples + scripts (leaf data, nothing imports them) ───────
addNode("examplejson", "vibe-architect.json", "examples/vibe-architect.json", "This file: a GraphSnapshot of the project's own structure.", "file", "examples", col(6), row(14));
addNode("b2bkit", "blender2babylon-kit.json", "examples/blender2babylon-kit.json", "Sample plugin: 44 b2bkit node types (pipeline, components, runtime, rendering).", "file", "examples", col(7), row(14));
addNode("makeexample", "make-example.mjs", "scripts/make-example.mjs", "This script: regenerates examples/vibe-architect.json from the layout above.", "file", "scripts", col(8), row(14));

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
addEdge("vibe", "pluginmodal", "opens");
addEdge("vibe", "useinteraction", "uses");
addEdge("vibe", "usecanvassize", "uses");
addEdge("vibe", "usewheelzoom", "uses");
addEdge("vibe", "agent", "runs");
addEdge("vibe", "geometry", "layout");
addEdge("vibe", "graph", "toposort");
addEdge("vibe", "ids", "ids");
addEdge("vibe", "layout", "tidy");
addEdge("vibe", "scenegraph", "ops");
addEdge("vibe", "plugins", "defaults");
// Cards / panels
addEdge("nodecard", "btn", "uses");
addEdge("nodecard", "usedoubletap", "uses");
addEdge("nodecard", "scenegraph", "ops");
addEdge("nodecard", "plugins", "colors");
addEdge("minimap", "geometry", "bounds");
addEdge("minimap", "scenegraph", "children");
addEdge("minimap", "plugins", "colors");
addEdge("hierarchyp", "scenegraph", "tree");
addEdge("hierarchyp", "plugins", "colors");
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
addEdge("filestorage", "plugins", "embeds");
addEdge("plugins", "constants", "palette");
// Modals
addEdge("promptmodal", "modalshell", "wraps");
addEdge("promptmodal", "prompt", "builds");
addEdge("saveloadmodal", "modalshell", "wraps");
addEdge("saveloadmodal", "filestorage", "io");
addEdge("ingestmodal", "modalshell", "wraps");
addEdge("ingestmodal", "ingest", "runs");
addEdge("pluginmodal", "modalshell", "wraps");
addEdge("pluginmodal", "plugins", "imports");
// Tests drive the app
addEdge("mobiletest", "vibe", "drives");
addEdge("layouttest", "vibe", "probes");
addEdge("examplestest", "filestorage", "loads");
addEdge("examplestest", "scenegraph", "renders");
addEdge("examplestest", "examplejson", "checks");
addEdge("pluginstest", "vibe", "drives");
addEdge("pluginstest", "filestorage", "round-trips");
addEdge("pluginstest", "plugins", "checks");
// The example is self-referential
addEdge("makeexample", "examplejson", "writes");

const snapshot = { nodes, edges, mode: "parallel" };
const outFile = join(outDir, "vibe-architect.json");
writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
console.log(`Wrote ${outFile}: ${nodes.length} nodes, ${edges.length} edges`);
