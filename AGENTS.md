# Vibe Architect — Agent Handoff Summary

## What it is
A node-graph canvas app for designing software architecture: files/folders/concepts are draggable cards, dependencies are bezier "noodle" edges, and an AI agent (Anthropic Messages API) can generate code per node from upstream context. Persistence is plain JSON files (portable between machines). Fully touch/mobile compatible.

**Terminology note:** the *original* app was a single-file upload (`vibe-architect(1).jsx`, ~1190 lines). The current project is a **structured multi-file TypeScript codebase** — but it is still a *single-page web app* in the routing sense: one `index.html`, no router, one full-screen canvas. "Single page" refers to the web app structure, not the file count.

## Location & state
- Root: `/home/jordan/Projects/Vibe Architect` — git, `main`
- Dev server: `npm run dev` on port 5173, all interfaces (`server: { host: true }`), LAN URL `http://192.168.50.43:5173`
- Stack: Vite + React 18 + TypeScript (`strict`, `noUnusedLocals/Parameters`). Node v18. Only runtime deps: `react`, `react-dom`.

## File layout (single-concern modules)
```
src/
  main.tsx, App.tsx, vite-env.d.ts
  lib/        types, constants, ids, geometry, graph, layout, sceneGraph,
              fileStorage, prompt, agent, anthropic, ingest, plugins
  hooks/      useCanvasSize, useWheelZoom, useCanvasInteraction, useDoubleTap
  components/ VibeArchitect (root), NodeCard, EdgeLabel, Minimap, Toolbar,
              StatusBar, HierarchyPanel, Btn,
              modals/ (ModalShell, PromptModal, SaveLoadModal, IngestModal,
                      PluginModal)
test/         mobile.test.{html,tsx}, example.test.{html,tsx},
              layout.test.{html,tsx}, plugins.test.{html,tsx}
scripts/      make-example.mjs   (plain JS — .mjs must NOT use TS annotations)
examples/     vibe-architect.json (graph), blender2babylon-kit.json (plugin)
```

## Core data model (`src/lib/types.ts`)
- `GraphNode`: `id, x, y, name, path, desc, type, parentId: string|null, visible, collapsed, agentOutput, agentStatus`
- `NodeType` = `"file" | "folder" | "concept" | (string & {})` — the `(string & {})` term admits plugin-defined custom types while keeping autocomplete for the built-ins
- `GraphEdge`: `id, from, to, label` · `GraphSnapshot`: `{ nodes, edges, mode, plugins? }`
- Scene graph: `parentId` (no children arrays); `SetParent` is cycle-safe; `ComputeRenderedSet` — a node renders only if visible AND no strict ancestor is hidden/collapsed (**hiding a parent hides its subtree**; collapsing tucks children away)
- **Folders act as groups**: an edge touching a folder's port reparents the other node under it (folder→folder: `from` becomes child of `to`)

## Plugin system (`src/lib/plugins.ts`)
- A **plugin** is a JSON file: `{ name, version?, description?, nodes: [{ type, label, desc?, category?, color? }] }`
- `ParsePlugin(text): Plugin | null` validates and returns `null` on malformed input (same contract as `ParseGraphSnapshot`)
- `LoadPluginFromFile(file): Promise<Plugin | null>`
- Imported via **Plugins → Import plugin** (toolbar) or by loading a saved graph whose snapshot embeds `plugins`
- Toolbar **Add ▾ → Custom nodes → <package name>** lists a plugin's node definitions (grouped by `category`); picking one adds a node of that custom `type` at the view center
- Custom-type nodes render as concept-style cards with the plugin's accent color; unknown types (plugin not loaded) fall back to the concept style
- `examples/blender2babylon-kit.json` ships concept nodes for the Blender2BabylonKit project (`/home/jordan/Projects/Blender2BabylonKit`): pipeline tooling, ECS components, runtime core, scene subsystems

## AI agent (still active)
- `src/lib/anthropic.ts` — minimal client for `https://api.anthropic.com/v1/messages` (`RequestAnthropicText(prompt, maxTokens)`)
- `src/lib/agent.ts` — `RunAgent` (per-node code generation, fed upstream context via incoming edges) and `DescribeFile` (used by Ingest to auto-describe imported files)
- Wired into the UI: `VibeArchitect.tsx` runs the agent per node / for all nodes; `NodeCard.tsx` shows a status dot and the generated output. Requires an API key at runtime (browser-side call).

## Key implementation facts (the gotchas)
- **Ports are top/bottom**: input port top-center, output port bottom-center; edges flow top→bottom. Bezier control distance = `max(50, min(|dy|·0.5, 200))`
- **Edges anchor to measured card sizes**: `NodeCard` reports `offsetWidth/Height` via `onSizeChange` in `useLayoutEffect` (primary, synchronous) + `ResizeObserver` (backstop — non-deterministic under headless Chrome virtual time). `VibeArchitect` owns `nodeSizes`; geometry helpers take optional sizes. Initial-load fit uses defaults
- **Pinch/pan use live refs**: `useCanvasInteraction` mirrors `pan`/`zoom` into refs, updated synchronously in `commitPan/commitZoom` — a second finger landing in the same frame as a pan must not read a stale render closure (regression: 0.00px vs 14.5px jump). 6px `PAN_DEADZONE` so fast pinches don't nudge the view first
- **Pointer Events only** (mouse+touch unified); `touch-action: none` on canvas/cards/ports; viewport `user-scalable=no`; `100dvh`; black background everywhere (incl. `index.html` body/theme-color)
- **Card buttons never leak to canvas**: `handlePointerDown` calls `stopPropagation()` *before* the `NON_DRAG_TAGS` check
- **Persistence**: `fileStorage.ts` — `SaveGraphToFile`, `LoadGraphFromFile` (async), `ParseGraphSnapshot` (returns `null` on malformed JSON); legacy `groups` migrated to folder nodes; app boots to an **empty canvas**
- **Hierarchy panel**: right side above minimap, `folded: Set<string>`, row click focuses/centers node, eye toggles visibility, dimming reflects effective rendered state

## Style guide (user's, enforced)
PascalCase functions/methods; camelCase variables/fields; descriptive names (no `res`/`err`/`el`, no single letters); Allman braces; braces always; no `.forEach()`; no `any`; explicit null checks; `void` on no-return functions; JSDoc on intent; short functions; extract >~40-line blocks; one blank line between logical sections; related consts grouped at top of scope.

## Run & verify
```bash
npx tsc --noEmit                      # src typecheck
npm run build                         # production build
# tests (headless Chrome, dev server must be up):
google-chrome --headless --disable-gpu --window-size=390,844 \
  --virtual-time-budget=30000 --timeout=30000 --dump-dom \
  "http://localhost:5173/test/mobile.test.html" | grep -oE "<title>(ALL PASS|FAILURES)</title>"
# example.test.html + plugins.test.html similar at 1200x800
# layout.test.html prints metrics to <pre id="out"> (no pass/fail title)
```

## Known limitations
- Ingest folder-picking uses the browser directory picker — desktop-only; mobile can pick individual files
- Agent features need a valid Anthropic API key; calls go browser→API directly
- `test/` files are typechecked separately (tsconfig `include` is `["src"]` only)
- Playwright/puppeteer not installed; all browser tests go through `google-chrome --headless`
