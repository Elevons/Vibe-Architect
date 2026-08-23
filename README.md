# Vibe Architect

A node-graph canvas for designing software architecture. The graph is a
*hierarchical scene graph*: every node is an object in a tree (via `parentId`)
that can be shown/hidden and, when it has children, collapsed into a compact
card. Model files, folders, and concepts as nodes; draw dependency edges
between them; let an LLM generate code per node (with upstream context);
ingest a real repository to build the graph automatically; and export the
whole design as a prompt for another agent.

## Getting started

```bash
npm install
npm run dev        # start the dev server
npm run build      # typecheck + production build
npm run typecheck  # tsc --noEmit only
```

## Features

- **Node graph canvas** — pan, zoom (wheel, toward cursor), grid, minimap
- **Three node types** — file, folder, concept; double-click to edit name, spec, type, and parent
- **Hierarchical scene graph** — any node can be a parent (folders are the natural parents); re-parent from the node editor, cycle-safe
- **Show/hide** — the eye on each card toggles that node's visibility; hiding a parent hides its whole subtree (each child's own eye flag still applies on top, and re-showing the parent restores the subtree)
- **Collapse/expand** — the chevron on a parent tucks its whole subtree into a compact card showing the item count; “Collapse All” / “Expand All” act on every parent
- **Hierarchy browser** — a collapsible tree panel on the right (above the minimap) lists the whole scene graph; click a row to select and center the node, fold/unfold branches, or toggle a node's visibility; hidden nodes are dimmed; the “☰ Hierarchy” toolbar button shows/hides the panel
- **Dependency edges** — drag from a node's right port to another node; click an edge to delete; double-click a label to rename; edges to hidden nodes are hidden too
- **LLM agent** — per-node code generation with upstream context; parallel or serial "Run All" (serial follows topological order)
- **Repository ingestion** — select a folder, the tool reads code files, describes them with an LLM, parses imports into edges, parents each file under an auto-created (collapsed) folder node, and lays the graph out
- **Tidy** — Sugiyama-style layered DAG layout with barycenter crossing reduction
- **Save/Load** — export the graph as a `.json` file (browser download) and load it back via a file picker; files saved with the old group model load and migrate automatically
- **Export Prompt** — serialize the graph to markdown (structure tree, file layout, modules, dependencies) and copy it to the clipboard; the prompt tells the agent exactly where each file goes and to create any folders or files that don't exist yet (edges into folders are treated as grouping, not dependencies)
- **Mobile** — touch panning, pinch-to-zoom, node dragging, drag-to-connect edges, and double-tap to edit; the toolbar, status bar, and modals adapt to small screens (scrollable rows, larger touch targets, safe-area insets, dynamic viewport height)

## Project structure

```
src/
├── main.tsx                  Entry point
├── App.tsx                   Root component
├── vite-env.d.ts             Vite client types
├── components/
│   ├── VibeArchitect.tsx     Main canvas: state, orchestration, world rendering
│   ├── Toolbar.tsx           Top toolbar
│   ├── StatusBar.tsx         Bottom hint bar
│   ├── NodeCard.tsx          A node: display, edit form, eye/chevron, agent output, ports
│   ├── EdgeLabel.tsx         Inline-editable edge label (SVG)
│   ├── HierarchyPanel.tsx    Scene hierarchy tree (right side, above minimap)
│   ├── Minimap.tsx           Overview map with viewport + click-to-pan
│   ├── Btn.tsx               Base button style
│   └── modals/
│       ├── ModalShell.tsx    Shared modal chrome
│       ├── PromptModal.tsx   Exported architecture prompt
│       ├── SaveLoadModal.tsx Save/load graphs as .json files
│       └── IngestModal.tsx   Repository ingestion
├── hooks/
│   ├── useCanvasSize.ts      ResizeObserver-based size tracking
│   ├── useWheelZoom.ts       Non-passive wheel zoom toward cursor
│   └── useCanvasInteraction.ts  Drag / pan / edge-draft pointer logic
└── lib/
    ├── types.ts              Domain types (node, edge, snapshot, …)
    ├── constants.ts          Dimensions, zoom limits, colors
    ├── ids.ts                Unique id generation
    ├── geometry.ts           Ports, edge curves, coordinate conversion, bounds
    ├── graph.ts              Topological sort
    ├── layout.ts             DAG layout, grid fallback
    ├── sceneGraph.ts         Tree ops: rendered set, subtree ids, cycle-safe re-parent
    ├── fileStorage.ts        JSON file save/load (download + file picker) + legacy migration
    ├── anthropic.ts          Minimal Anthropic Messages API client
    ├── agent.ts              Per-node code generation + file description
    ├── ingest.ts             Import parsing, import resolution, folder parenting, graph build
    └── prompt.ts             Architecture prompt builder

test/
├── mobile.test.html          Headless touch-gesture test harness
├── mobile.test.tsx           Drives the app with synthetic touch PointerEvents
├── layout.test.html          Layout metrics probe (mobile + desktop)
└── layout.test.tsx           Reports toolbar/targets/minimap/root metrics
```

## Mobile gesture tests

The gesture layer (pan, pinch, drag, double-tap, edge drag, collapse, and
the hierarchy panel: row focus, eye hide, branch fold) is tested end-to-end
against the real app with headless Chrome:

```bash
npm run dev -- --port 4175 &
google-chrome --headless --disable-gpu --window-size=390,844 \
  --virtual-time-budget=20000 --dump-dom \
  http://localhost:4175/test/mobile.test.html | grep -E "PASS|FAIL"
```

All gestures are reported as PASS/FAIL lines; the page title is `ALL PASS`
when everything works.

## Notes

- Saved graphs are plain `.json` files — keep, share, or copy them to
  another machine and load them there.
- LLM features call the Anthropic API directly from the browser, so they
  require an environment where that request is allowed.
