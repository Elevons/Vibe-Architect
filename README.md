# Vibe Architect

A node-graph canvas for designing software architecture. Model files, folders,
and concepts as nodes; draw dependency edges between them; let an LLM generate
code per node (with upstream context); ingest a real repository to build the
graph automatically; and export the whole design as a prompt for another agent.

## Getting started

```bash
npm install
npm run dev        # start the dev server
npm run build      # typecheck + production build
npm run typecheck  # tsc --noEmit only
```

## Features

- **Node graph canvas** — pan, zoom (wheel, toward cursor), grid, minimap
- **Three node types** — file, folder, concept; double-click to edit name, spec, type, and group
- **Dependency edges** — drag from a node's right port to another node; click an edge to delete; double-click a label to rename
- **Groups** — collapse/expand subgraphs into folder cards; click a card to focus (dims the rest)
- **LLM agent** — per-node code generation with upstream context; parallel or serial "Run All" (serial follows topological order)
- **Repository ingestion** — select a folder, the tool reads code files, describes them with an LLM, parses imports into edges, auto-groups by directory, and lays the graph out
- **Tidy** — Sugiyama-style layered DAG layout with barycenter crossing reduction
- **Save/Load** — export the graph as a `.json` file (browser download) and load it back via a file picker
- **Export Prompt** — serialize the graph to markdown and copy it to the clipboard

## Project structure

```
src/
├── main.tsx                  Entry point
├── App.tsx                   Root component
├── vite-env.d.ts             window.storage type declarations
├── components/
│   ├── VibeArchitect.tsx     Main canvas: state, orchestration, world rendering
│   ├── Toolbar.tsx           Top toolbar
│   ├── StatusBar.tsx         Bottom hint bar
│   ├── NodeCard.tsx          A node: display, edit form, agent output, ports
│   ├── GroupCard.tsx         Collapsed group card
│   ├── EdgeLabel.tsx         Inline-editable edge label (SVG)
│   ├── Minimap.tsx           Overview map with viewport + click-to-pan
│   ├── Btn.tsx               Base button style
│   └── modals/
│       ├── ModalShell.tsx    Shared modal chrome
│       ├── PromptModal.tsx   Exported architecture prompt
│       ├── SaveLoadModal.tsx Save/load/delete graphs
│       ├── GroupModal.tsx    Manage groups
│       └── IngestModal.tsx   Repository ingestion
├── hooks/
│   ├── useCanvasSize.ts      ResizeObserver-based size tracking
│   ├── useWheelZoom.ts       Non-passive wheel zoom toward cursor
│   └── useCanvasInteraction.ts  Drag / pan / edge-draft pointer logic
└── lib/
    ├── types.ts              Domain types (node, edge, group, …)
    ├── constants.ts          Dimensions, zoom limits, colors, demo data
    ├── ids.ts                Unique id generation
    ├── geometry.ts           Ports, edge curves, coordinate conversion, bounds
    ├── graph.ts              Topological sort
    ├── layout.ts             DAG layout, auto-grouping, grid fallback
    ├── fileStorage.ts        JSON file save/load (download + file picker)
    ├── anthropic.ts          Minimal Anthropic Messages API client
    ├── agent.ts              Per-node code generation + file description
    ├── ingest.ts             Import parsing, import resolution, graph build
    └── prompt.ts             Architecture prompt builder
```

## Notes

- Saved graphs are plain `.json` files — keep, share, or copy them to
  another machine and load them there.
- LLM features call the Anthropic API directly from the browser, so they
  require an environment where that request is allowed.
