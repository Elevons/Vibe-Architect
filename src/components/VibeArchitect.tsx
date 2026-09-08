import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, PointerEvent as ReactPointerEvent, ReactElement, SetStateAction } from "react";
import { useCanvasSize } from "../hooks/useCanvasSize";
import { useCanvasInteraction } from "../hooks/useCanvasInteraction";
import { useWheelZoom } from "../hooks/useWheelZoom";
import { RunAgent } from "../lib/agent";
import { FONT, GROUP_COLORS, MAX_ZOOM, MIN_ZOOM, NODE_H, NODE_W } from "../lib/constants";
import { DescendantBounds, AttachmentEdgePath, EdgePathFromPoints, EdgeSourcePoint, EdgeTargetPoint, PortForSide, PortIn, VisibleBounds } from "../lib/geometry";
import { TopoSort } from "../lib/graph";
import { CreateUniqueId } from "../lib/ids";
import { DagLayout } from "../lib/layout";
import { NodeDefaultsFor } from "../lib/plugins";
import { BuildChildrenMap, BuildNodeMap, ComputeRenderedSet, DescendantCount, SetParent, SubtreeIds } from "../lib/sceneGraph";
import type { Bounds, GraphEdge, GraphNode, GraphSnapshot, NodeSize, NodeType, Point, Plugin, PortSide, RunMode } from "../lib/types";
import { EdgeLabel } from "./EdgeLabel";
import { HierarchyPanel } from "./HierarchyPanel";
import { Minimap } from "./Minimap";
import { NodeCard } from "./NodeCard";
import { IngestModal } from "./modals/IngestModal";
import { PluginModal } from "./modals/PluginModal";
import { PromptModal } from "./modals/PromptModal";
import { SaveLoadModal } from "./modals/SaveLoadModal";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";

/**
 * The main canvas: a pannable, zoomable scene graph of software
 * architecture. Every node is a tree object that can be shown/hidden and,
 * when it has children, collapsed into a compact card.
 */

export function VibeArchitect() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<RunMode>("parallel");
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [showIngest, setShowIngest] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  const [showHierarchy, setShowHierarchy] = useState(true);
  // Imported node packages. Custom node types resolve their colors and
  // default names from these definitions.
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  // Measured card sizes, keyed by node id. Edges anchor to the real port
  // position, so noodles follow their ports when a card grows or shrinks.
  const [nodeSizes, setNodeSizes] = useState<Record<string, NodeSize>>({});

  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasSize = useCanvasSize(canvasRef);

  const reportNodeSize = useCallback((id: string, width: number, height: number): void => {
    setNodeSizes(prev => {
      const current = prev[id];
      if (current !== undefined && current.width === width && current.height === height) {
        return prev;
      }
      return { ...prev, [id]: { width, height } };
    });
  }, []);

  // ── CRUD (updateNode/addEdge live here so the interaction hook can use them) ──
  const updateNode = (id: string, patch: Partial<GraphNode>): void => {
    setNodes(prev => prev.map(node => (node.id === id ? { ...node, ...patch } : node)));
  };

  // Edges fall into two kinds. A folder-sourced edge is a grouping noodle:
  // the target becomes the folder's child in the scene hierarchy (cycle-safe).
  // File/concept/custom-sourced edges are free-form note lines that never
  // reparent — just a labelled connection between two cards.

  const addEdge = (from: string,to: string,fromSide: PortSide,toSide: PortSide): void => {
    const fromNode = nodes.find(node => node.id === from);
    const toNode = nodes.find(node => node.id === to);
    if (fromNode === undefined || toNode === undefined) {
      return;
    }
    if (fromNode.type === "folder") {
      // Objects are aggregates, not grouping children: a folder's grouping
      // noodle landing on an object is a no-op. Attach to an object via the
      // object's own port instead (see addAttachment..
      if (toNode.type === "object") {
        return;
      }
      setEdges(prev => [...prev, { id: CreateUniqueId("e"), from, to, label: "", fromSide, toSide }]);
      setNodes(prev => SetParent(prev, to, from));
      return;
    }
    if (fromNode.type === "object") {
      return;
    }
    setEdges(prev => [...prev, { id: CreateUniqueId("e"), from, to, label: "", fromSide, toSide }]);
  };

  /** Attach `to` as a component of the object `from` (an object→component noodle). */
  const addAttachment = (from: string, to: string): void => {
    const objectNode = nodes.find(node => node.id === from);
    if (objectNode === undefined || objectNode.type !== "object") {
      return;
    }
    if (from === to) {
      return;
    }
    setEdges(prev => [...prev, { id: CreateUniqueId("e"), from, to, label: "" }]);
    setNodes(prev => prev.map(node => node.id === from
      ? { ...node, componentIds: [...new Set([...(node.componentIds ?? []), to])] }
      : node));
  };

  /**
   * Move a folder and its entire subtree together: the root is placed at
   * (x, y) and every descendant is shifted by the same delta, so the group
   * keeps its internal layout. Driven by the folder's group-drag handle.
   */
  const moveSubtree = (rootId: string, x: number, y: number): void => {
    const root = nodes.find(node => node.id === rootId);
    if (root === undefined) {
      return;
    }
    const deltaX = x - root.x;
    const deltaY = y - root.y;
    if (deltaX === 0 && deltaY === 0) {
      return;
    }
    const subtree = new Set(SubtreeIds(nodes, rootId));
    setNodes(prev => prev.map(node => subtree.has(node.id)
      ? { ...node, x: node.x + deltaX, y: node.y + deltaY }
      : node));
  };

  const { panning, pointerPos, edgeDraft, attachDraft, canvasPointerDown, handleDragStart, handleStartEdge, handleEndEdge, handleStartAttachment, handleEndAttachment } =
    useCanvasInteraction({ canvasRef, nodes, edges, pan, zoom, setPan, setZoom, setSelected, updateNode, moveSubtree, addEdge, addAttachment });

  /**
   * Release over a node's input port: an in-progress object attachment wins;
   * otherwise a folder grouping edge commits. One entry point for every card's
   * top port, so objects (which receive attachments) and folders (which
   * receive grouping) share the same drop target.
   */
  const onPortEnd = (toId: string,toSide: PortSide): void => {
    if (attachDraft !== null) {
      handleEndAttachment(toId);
    } else {
      handleEndEdge(toId,toSide);
    }
  };
  useWheelZoom(canvasRef, pan, zoom, setPan, setZoom);

  const nodeMap = useMemo(() => BuildNodeMap(nodes), [nodes]);
  const rendered = useMemo(() => ComputeRenderedSet(nodes), [nodes]);
  const groups = useMemo(() => computeGroups(nodes, rendered, nodeSizes), [nodes, rendered, nodeSizes]);

  const addNode = (type: NodeType = "file"): void => {
    const id = CreateUniqueId("n");
    const jitterX = Math.random() * 60 - 30;
    const jitterY = Math.random() * 60 - 30;
    const worldX = (canvasSize.width / 2 - pan.x) / zoom - NODE_W / 2 + jitterX;
    const worldY = (canvasSize.height / 2 - pan.y) / zoom - NODE_H / 2 + jitterY;
    const defaults = NodeDefaultsFor(type, plugins);
    setNodes(prev => [...prev, {
      id, x: worldX, y: worldY, name: defaults.name, desc: defaults.desc,
      path: "", type, parentId: null, visible: true, collapsed: false,
      agentOutput: null, agentStatus: "idle",
    }]);
    setSelected(id);
  };

  /** Add a node of a plugin-defined type (Add ▾ → Custom nodes). */
  const addPluginNode = (pluginName: string, type: string): void => {
    const plugin = plugins.find(entry => entry.name === pluginName);
    if (plugin === undefined) {
      return;
    }
    if (plugin.nodes.some(node => node.type === type)) {
      addNode(type);
    }
  };

  /** Import a plugin; re-importing the same package name replaces it. */
  const handleImportPlugin = (plugin: Plugin): void => {
    setPlugins(prev => [...prev.filter(entry => entry.name !== plugin.name), plugin]);
  };

  /** Delete a node, its whole subtree, and every edge touching them. */
  const deleteNode = (id: string): void => {
    const removed = new Set(SubtreeIds(nodes, id));
    setNodes(prev => prev.filter(node => !removed.has(node.id)));
    setEdges(prev => prev.filter(edge => !removed.has(edge.from) && !removed.has(edge.to)));
    if (selected !== null && removed.has(selected)) {
      setSelected(null);
    }
  };

  const updateEdgeLabel = (edgeId: string, label: string): void => {
    setEdges(prev => prev.map(edge => (edge.id === edgeId ? { ...edge, label } : edge)));
  };

  const deleteEdge = (edgeId: string): void => {
    const edge = edges.find(e => e.id === edgeId);
    setEdges(prev => prev.filter(e => e.id !== edgeId));
    if (edge === undefined) return;

    const fromNode = nodes.find(n => n.id === edge.from);
    const toNode = nodes.find(n => n.id === edge.to);
    if (fromNode === undefined || toNode === undefined) return;

    if (fromNode.type === "folder") {
      // Undo grouping: unparent the target if it points to this folder.
      setNodes(prev => prev.map(n =>
        n.id === edge.to && n.parentId === edge.from ? { ...n, parentId: null } : n));
    }
    if (fromNode.type === "object") {
      // Undo attachment: remove target from object's componentIds.
      setNodes(prev => prev.map(n =>
        n.id === edge.from && n.type === "object"
          ? { ...n, componentIds: (n.componentIds ?? []).filter(id => id !== edge.to) }
          : n));
    }
  };

  // ── Scene-graph operations ──
  const toggleCollapse = (id: string): void => {
    setNodes(prev => prev.map(node => (node.id === id ? { ...node, collapsed: !node.collapsed } : node)));
  };

  const setVisible = (id: string, visible: boolean): void => {
    setNodes(prev => prev.map(node => (node.id === id ? { ...node, visible } : node)));
  };

  const setParent = (id: string, parentId: string | null): void => {
    setNodes(prev => SetParent(prev, id, parentId));
  };

  /** Collapse/expand every node that has children. */
  const setAllCollapsed = (collapsed: boolean): void => {
    const parentIds = new Set(nodes.filter(node => DescendantCount(nodes, node.id) > 0).map(node => node.id));
    setNodes(prev => prev.map(node => (parentIds.has(node.id) ? { ...node, collapsed } : node)));
  };

  // ── Selection ──
  const handleSelect = (id: string): void => {
    setSelected(id);
  };

  /** Select a node and center the canvas on it (hierarchy browser). */
  const focusNode = (id: string): void => {
    const node = nodeMap.get(id);
    if (node === undefined) {
      return;
    }
    setPan({
      x: canvasSize.width / 2 - (node.x + NODE_W / 2) * zoom,
      y: canvasSize.height / 2 - (node.y + NODE_H / 2) * zoom,
    });
    setSelected(id);
  };

  // ── Agent ──
  const handleRunAgent = async (nodeId: string): Promise<void> => {
    updateNode(nodeId, { agentStatus: "running", agentOutput: null });
    const node = nodes.find(entry => entry.id === nodeId);
    if (node === undefined) {
      return;
    }
    try {
      const output = await RunAgent(node, nodes, edges);
      setNodes(prev => prev.map(entry => (entry.id === nodeId ? { ...entry, agentOutput: output, agentStatus: "done" } : entry)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNodes(prev => prev.map(entry => (entry.id === nodeId ? { ...entry, agentOutput: `Error: ${message}`, agentStatus: "error" } : entry)));
    }
  };

  const handleRunAll = async (): Promise<void> => {
    const ordered = mode === "serial" ? TopoSort(nodes, edges) : nodes;
    if (mode === "serial") {
      for (const node of ordered) {
        updateNode(node.id, { agentStatus: "running", agentOutput: null });
        const freshNodes = await ReadLatestNodes(setNodes);
        try {
          const output = await RunAgent(node, freshNodes, edges);
          setNodes(prev => prev.map(entry => (entry.id === node.id ? { ...entry, agentOutput: output, agentStatus: "done" } : entry)));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setNodes(prev => prev.map(entry => (entry.id === node.id ? { ...entry, agentOutput: `Error: ${message}`, agentStatus: "error" } : entry)));
        }
      }
    } else {
      ordered.forEach(node => void handleRunAgent(node.id));
    }
  };

  // ── Zoom controls (zoom about the canvas center) ──
  const zoomAboutCenter = (factor: number): void => {
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const worldX = (centerX - pan.x) / zoom;
    const worldY = (centerY - pan.y) / zoom;
    setPan({ x: centerX - worldX * newZoom, y: centerY - worldY * newZoom });
    setZoom(newZoom);
  };

  const zoomReset = (): void => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // ── Fit / tidy ──
  const fitBounds = (bounds: Bounds): void => {
    const newZoom = Math.min(canvasSize.width / bounds.w, canvasSize.height / bounds.h, 2) * 0.85;
    setPan({
      x: canvasSize.width / 2 - (bounds.x + bounds.w / 2) * newZoom,
      y: canvasSize.height / 2 - (bounds.y + bounds.h / 2) * newZoom,
    });
    setZoom(newZoom);
  };

  const fitToView = (): void => {
    if (nodes.length > 0) {
      fitBounds(VisibleBounds(nodes, rendered, nodeSizes));
    }
  };

  const handleTidy = (): void => {
    const { nodes: laidNodes } = DagLayout(nodes, edges);
    setNodes(laidNodes);
    setTimeout(() => fitBounds(VisibleBounds(laidNodes, ComputeRenderedSet(laidNodes))), 50);
  };

  // ── Save / load / ingest ──
  const getCurrentState = (): GraphSnapshot => ({
    nodes: nodes.map(({ agentOutput, agentStatus, ...rest }) => ({ ...rest, agentOutput, agentStatus: "idle" as const })),
    edges, mode,
    ...(plugins.length > 0 ? { plugins } : {}),
  });

  const handleLoad = (data: GraphSnapshot): void => {
    if (data.nodes !== undefined) {
      setNodes(data.nodes.map(node => ({ ...node, agentOutput: node.agentOutput || null, agentStatus: "idle" as const })));
    }
    if (data.edges !== undefined) {
      setEdges(data.edges);
    }
    if (data.mode !== undefined) {
      setMode(data.mode);
    }
    // A saved graph carries the plugins its custom nodes need.
    if (data.plugins !== undefined) {
      setPlugins(data.plugins);
    }
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setSelected(null);
  };

  const handleIngest = (newNodes: GraphNode[], newEdges: GraphEdge[]): void => {
    setNodes(newNodes);
    setEdges(newEdges);
    setSelected(null);
    setTimeout(() => fitBounds(VisibleBounds(newNodes, ComputeRenderedSet(newNodes))), 100);
  };

  // ── Render ──
  const rect = canvasRef.current?.getBoundingClientRect();
  const gridSize = 24 * zoom;

  return (
    <div className="va-root" style={{
      width: "100%", height: "100vh", background: "#000", display: "flex",
      flexDirection: "column", fontFamily: FONT, overflow: "hidden",
    }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}${ResponsiveCss}`}</style>

      <Toolbar
        mode={mode}
        zoom={zoom}
        nodeCount={nodes.length}
        edgeCount={edges.length}
        plugins={plugins}
        onAddNode={addNode}
        onAddPluginNode={addPluginNode}
        onSetMode={setMode}
        onZoomIn={() => zoomAboutCenter(1.25)}
        onZoomOut={() => zoomAboutCenter(1 / 1.25)}
        onZoomReset={zoomReset}
        onFitToView={fitToView}
        onTidy={handleTidy}
        onSetAllCollapsed={setAllCollapsed}
        hierarchyOpen={showHierarchy}
        onToggleHierarchy={() => setShowHierarchy(open => !open)}
        onRunAll={() => void handleRunAll()}
        onShowSaveLoad={() => setShowSaveLoad(true)}
        onShowIngest={() => setShowIngest(true)}
        onShowPlugins={() => setShowPlugins(true)}
        onExportPrompt={() => setShowPrompt(true)}
      />

      <div
        ref={canvasRef}
        onPointerDown={canvasPointerDown}
        style={{ flex: 1, position: "relative", overflow: "hidden", cursor: panning ? "grabbing" : "default", touchAction: "none" }}
      >
        {/* Pan hit-area — catches all clicks on empty canvas */}
        <div data-pan="true" style={{ position: "absolute", inset: 0, zIndex: 0 }} />
        {/* Grid */}
        <div style={{
          position: "absolute", inset: 0, opacity: Math.min(0.15, 0.15 * zoom),
          backgroundImage: "radial-gradient(circle, #444 1px, transparent 1px)",
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${pan.x % gridSize}px ${pan.y % gridSize}px`,
          pointerEvents: "none",
        }} />

        {/* Scaled world layer: parent backgrounds */}
        <div style={{
          position: "absolute", inset: 0, transformOrigin: "0 0",
          transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, pointerEvents: "none",
        }}>
          {renderGroupBoxes(groups)}
        </div>

        {/* SVG edges (scaled) */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          <defs>
            <marker id="ah" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#555" />
            </marker>
            <marker id="at" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#22d3ee" />
            </marker>
          </defs>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {renderEdges(edges, nodeMap, rendered, zoom, nodeSizes, deleteEdge)}
            {renderEdgeDraft(edgeDraft, rect, nodeMap, pointerPos, pan, zoom, nodeSizes)}
            {renderAttachmentDraft(attachDraft, rect, nodeMap, pointerPos, pan, zoom, nodeSizes)}
          </g>
        </svg>

        {/* Nodes (scaled). The wrapper itself is transparent to pointer events so
            presses on empty space fall through to the edge hit-paths (and the
            pan area) beneath; each card re-enables pointer events on itself. */}
        <div style={{
          position: "absolute", inset: 0, transformOrigin: "0 0",
          transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
          pointerEvents: "none",
        }}>
          {renderNodes(nodes, rendered, selected, handleSelect, handleDragStart, updateNode, deleteNode, handleStartEdge, handleEndEdge, handleStartAttachment, onPortEnd, handleRunAgent, zoom, toggleCollapse, setVisible, setParent, reportNodeSize, plugins)}
          {/* Group drag handles — rendered after the cards in the same layer so a
              handle is always painted above the cards (never occluded) and is
              grabbable. */}
          {renderGroupHandles(groups, handleDragStart)}
        </div>

        {/* Edge note squares (scaled) — above the cards so they are always clickable */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 25 }}>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {renderEdgeNotes(edges, nodeMap, rendered, zoom, nodeSizes, updateEdgeLabel)}
          </g>
        </svg>

        {nodes.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <p style={{ color: "#444", fontSize: 14, fontFamily: FONT }}>Add a file, folder, concept, or object to start designing</p>
          </div>
        )}

        <Minimap
          nodes={nodes}
          edges={edges}
          nodeMap={nodeMap}
          nodeSizes={nodeSizes}
          rendered={rendered}
          plugins={plugins}
          pan={pan}
          zoom={zoom}
          canvasW={canvasSize.width}
          canvasH={canvasSize.height}
          onPanTo={(x, y) => setPan({ x, y })}
        />

        {showHierarchy && (
          <HierarchyPanel
            nodes={nodes}
            selected={selected}
            plugins={plugins}
            onSelectAndFocus={focusNode}
            onSetVisible={setVisible}
            onClose={() => setShowHierarchy(false)}
          />
        )}
      </div>

      <StatusBar />

      {showPrompt && <PromptModal nodes={nodes} edges={edges} mode={mode} onClose={() => setShowPrompt(false)} />}
      {showSaveLoad && <SaveLoadModal onClose={() => setShowSaveLoad(false)} onLoad={handleLoad} currentState={getCurrentState()} />}
      {showIngest && <IngestModal onClose={() => setShowIngest(false)} onIngest={handleIngest} />}
      {showPlugins && <PluginModal onClose={() => setShowPlugins(false)} onImport={handleImportPlugin} loadedPlugins={plugins} />}
    </div>
  );
}

/**
 * Responsive rules for phones and small tablets: scrollable toolbar with
 * bigger touch targets, scrollable status hints, a scaled-down minimap,
 * compact modals, dynamic viewport height, and safe-area insets.
 */
const ResponsiveCss = `
button { -webkit-tap-highlight-color: transparent; }
svg text { user-select: none; -webkit-user-select: none; }
@supports (height: 100dvh) {
  .va-root { height: 100dvh !important; }
}
@media (max-width: 900px) {
  .va-toolbar {
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    gap: 6px !important;
    padding: 6px 10px !important;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .va-toolbar::-webkit-scrollbar { display: none; }
  .va-toolbar button { min-height: 34px; }
  .va-brand { white-space: nowrap; }
  .va-spacer { display: none; }
  .va-counts { white-space: nowrap; }
}
@media (max-width: 700px) {
  .va-status {
    overflow-x: auto !important;
    white-space: nowrap !important;
    scrollbar-width: none;
  }
  .va-status::-webkit-scrollbar { display: none; }
  .va-status span { white-space: nowrap; }
  .va-minimap { transform: scale(0.7); transform-origin: bottom right; }
  .va-hierarchy { width: 180px !important; bottom: 122px !important; }
  .va-modal-backdrop { padding: 10px !important; }
  .va-modal-panel { padding: 14px !important; }
  .va-toolbar { padding-top: calc(6px + env(safe-area-inset-top)) !important; }
  .va-status { padding-bottom: calc(4px + env(safe-area-inset-bottom)) !important; }
}
`;

/** Read the latest nodes from state (used between serial agent steps). */
function ReadLatestNodes(setNodes: Dispatch<SetStateAction<GraphNode[]>>): Promise<GraphNode[]> {
  return new Promise(resolve => setNodes(prev => {
    resolve(prev);
    return prev;
  }));
}

/** A folder's grouping box: its id, the bounds wrapping its rendered children, and its color. */
type GroupBox = { id: string; bounds: { x: number; y: number; w: number; h: number }; color: string };

/** Compute the grouping boxes for every rendered folder that has rendered children. */
function computeGroups(nodes: GraphNode[], rendered: Set<string>, nodeSizes: Record<string, NodeSize>): GroupBox[] {
  const childrenMap = BuildChildrenMap(nodes);
  const groups: GroupBox[] = [];
  let colorIndex = 0;
  for (const node of nodes) {
    if (!rendered.has(node.id)) {
      continue;
    }
    if (!HasRenderedChild(childrenMap, node.id, rendered)) {
      continue;
    }
    const bounds = DescendantBounds(nodes, node.id, rendered, 14, nodeSizes);
    if (bounds === null) {
      continue;
    }
    const color = GROUP_COLORS[colorIndex % GROUP_COLORS.length];
    colorIndex += 1;
    groups.push({ id: node.id, bounds, color });
  }
  return groups;
}

/** Dashed fill behind each rendered parent, sized to its rendered children. */
function renderGroupBoxes(groups: GroupBox[]): ReactElement[] {
  return groups.map(group => (
    <div
      key={`bg-${group.id}`}
      style={{
        position: "absolute", left: group.bounds.x, top: group.bounds.y, width: group.bounds.w, height: group.bounds.h,
        background: group.color, border: `1px dashed ${group.color.replace("30", "70")}`,
        borderRadius: 10, pointerEvents: "none",
      }}
    />
  ));
}

/** Grip handles pinned to each group box's top-left corner. Rendered in a layer
 *  above the cards so they are never occluded and always grabbable. Grabbing one
 *  starts a group drag (moves the folder and its whole subtree), like the header bar. */
function renderGroupHandles(
  groups: GroupBox[],
  handleDragStart: (event: ReactPointerEvent, id: string, group?: boolean) => void,
): ReactElement[] {
  return groups.map(group => (
    <div
      key={`handle-${group.id}`}
      title="Drag to move the whole group"
      onPointerDown={event => { event.stopPropagation(); handleDragStart(event, group.id, true); }}
      style={{
        position: "absolute", left: group.bounds.x + 6, top: group.bounds.y + 6,
        width: 24, height: 24, borderRadius: 6, cursor: "grab", touchAction: "none",
        userSelect: "none", pointerEvents: "auto", zIndex: 30,
        background: "#16161c", border: `1.5px solid ${group.color.slice(0, 7)}`,
        boxShadow: "0 2px 8px #000a",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: FONT, fontSize: 12, color: "#e8e8f0", fontWeight: 700,
      }}>
      ⠿
    </div>
  ));
}

/** True when the node has at least one rendered direct child. */
function HasRenderedChild(
  childrenMap: Map<string, string[]>,
  nodeId: string,
  rendered: Set<string>,
): boolean {
  return (childrenMap.get(nodeId) ?? []).some(id => rendered.has(id));
}

/** Where an edge's noodle starts and ends, and whether it is an object attachment. */
interface EdgeAnchors {
  from: GraphNode;
  to: GraphNode;
  pointA: Point;
  pointB: Point;
  isAttachment: boolean;
}

/**
 * Resolve an edge's endpoints. Returns null when either node is missing or
 * not rendered. Object→component attachments anchor at both nodes' top ports.
 */
function EdgeAnchorsFor(
  edge: GraphEdge,
  nodeMap: Map<string, GraphNode>,
  rendered: Set<string>,
  nodeSizes: Record<string, NodeSize>,
): EdgeAnchors | null {
  const from = nodeMap.get(edge.from);
  const to = nodeMap.get(edge.to);
  if (from === undefined || to === undefined) {
    return null;
  }
  if (!rendered.has(edge.from) || !rendered.has(edge.to)) {
    return null;
  }
  const isAttachment = from.type === "object";
  const pointA = isAttachment ? PortIn(from, nodeSizes[edge.from]) : EdgeSourcePoint(edge, from, nodeSizes[edge.from]);
  const pointB = isAttachment ? PortIn(to, nodeSizes[edge.to]) : EdgeTargetPoint(edge, to, nodeSizes[edge.to]);
  return { from, to, pointA, pointB, isAttachment };
}

/** World position of an edge's note square: just above the noodle's midpoint. */
function EdgeNotePosition(anchors: EdgeAnchors): Point {
  return { x: (anchors.pointA.x + anchors.pointB.x) / 2, y: (anchors.pointA.y + anchors.pointB.y) / 2 - 8 };
}

/** Edge noodles (lines only) whose endpoints are both rendered. */
function renderEdges(
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
  rendered: Set<string>,
  zoom: number,
  nodeSizes: Record<string, NodeSize>,
  deleteEdge: (edgeId: string) => void,
) {
  return edges.map(edge => {
    const anchors = EdgeAnchorsFor(edge, nodeMap, rendered, nodeSizes);
    if (anchors === null) {
      return null;
    }
    const { from, to, pointA, pointB, isAttachment } = anchors;
    const path = isAttachment ? AttachmentEdgePath(from, to, nodeSizes[edge.from], nodeSizes[edge.to]) : EdgePathFromPoints(pointA, pointB);
    const color = isAttachment ? "#22d3ee" : "#333";
    return (
      <g key={edge.id}>
        <path d={path} stroke={color} strokeWidth={2 / zoom} fill="none" markerEnd={isAttachment ? "url(#at)" : "url(#ah)"} />
        <path
          d={path}
          stroke="transparent"
          strokeWidth={Math.max(12, 16 / zoom)}
          fill="none"
          style={{ pointerEvents: "stroke", cursor: "pointer", touchAction: "none" }}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); deleteEdge(edge.id); }}
        >
          <title>Click to remove</title>
        </path>
      </g>
    );
  });
}

/**
 * Edge note squares. Rendered in a separate SVG layer stacked above the node
 * cards, so a note that happens to sit under a card is still clickable
 * (the card layer would otherwise swallow the press and start a drag).
 */
function renderEdgeNotes(
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
  rendered: Set<string>,
  zoom: number,
  nodeSizes: Record<string, NodeSize>,
  updateEdgeLabel: (edgeId: string, label: string) => void,
) {
  return edges.map(edge => {
    const anchors = EdgeAnchorsFor(edge, nodeMap, rendered, nodeSizes);
    if (anchors === null) {
      return null;
    }
    return <EdgeLabel key={edge.id} edge={edge} pos={EdgeNotePosition(anchors)} onUpdate={updateEdgeLabel} zoom={zoom} />;
  });
}

/** The in-progress dashed edge from a port to the cursor. */
function renderEdgeDraft(
  edgeDraft: { from: string, fromSide: PortSide, to: string | null } | null,
  rect: DOMRect | undefined,
  nodeMap: Map<string, GraphNode>,
  mousePos: Point,
  pan: Point,
  zoom: number,
  nodeSizes: Record<string, NodeSize>,
) {
  if (edgeDraft === null || rect === undefined) {
    return null;
  }
  const fromNode = nodeMap.get(edgeDraft.from);
  if (fromNode === undefined) {
    return null;
  }
  const from = PortForSide(fromNode, edgeDraft.fromSide, nodeSizes[edgeDraft.from]);
  const toX = (mousePos.x - rect.left - pan.x) / zoom;
  const toY = (mousePos.y - rect.top - pan.y) / zoom;
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={toX}
      y2={toY}
      stroke="#818cf8"
      strokeWidth={2 / zoom}
      strokeDasharray={`${6 / zoom} ${4 / zoom}`}
    />
  );
}

/** The in-progress dashed attachment from an object's port to the cursor. */
function renderAttachmentDraft(
  attachDraft: { from: string; to: string | null } | null,
  rect: DOMRect | undefined,
  nodeMap: Map<string, GraphNode>,
  mousePos: Point,
  pan: Point,
  zoom: number,
  nodeSizes: Record<string, NodeSize>,
) {
  if (attachDraft === null || rect === undefined) {
    return null;
  }
  const fromNode = nodeMap.get(attachDraft.from);
  if (fromNode === undefined) {
    return null;
  }
  const from = PortIn(fromNode, nodeSizes[attachDraft.from]);
  const toX = (mousePos.x - rect.left - pan.x) / zoom;
  const toY = (mousePos.y - rect.top - pan.y) / zoom;
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={toX}
      y2={toY}
      stroke="#22d3ee"
      strokeWidth={2 / zoom}
      strokeDasharray={`${6 / zoom} ${4 / zoom}`}
    />
  );
}

/** All rendered nodes as cards. */
function renderNodes(
  nodes: GraphNode[],
  rendered: Set<string>,
  selected: string | null,
  handleSelect: (id: string) => void,
  handleDragStart: (event: ReactPointerEvent, id: string, group?: boolean) => void,
  updateNode: (id: string, patch: Partial<GraphNode>) => void,
  deleteNode: (id: string) => void,
  handleStartEdge: (id: string, side: PortSide, event: ReactPointerEvent) => void,
  handleEndEdge: (id: string, side: PortSide) => void,
  handleStartAttachment: (id: string, event: ReactPointerEvent) => void,
  onPortEnd: (id: string, side: PortSide) => void,
  handleRunAgent: (id: string) => void,
  zoom: number,
  toggleCollapse: (id: string) => void,
  setVisible: (id: string, visible: boolean) => void,
  setParent: (id: string, parentId: string | null) => void,
  reportNodeSize: (id: string, width: number, height: number) => void,
  plugins: Plugin[],
) {
  return nodes.filter(node => rendered.has(node.id)).map(node => (
    <NodeCard
      key={node.id}
      node={node}
      selected={selected === node.id}
      nodes={nodes}
      plugins={plugins}
      zoom={zoom}
      onSelect={handleSelect}
      onDragStart={handleDragStart}
      onGroupDragStart={(event, id) => handleDragStart(event, id, true)}
      onUpdate={updateNode}
      onDelete={deleteNode}
      onStartEdge={handleStartEdge}
      onEndEdge={handleEndEdge}
      onStartAttachment={handleStartAttachment}
      onPortEnd={onPortEnd}
      onRunAgent={id => void handleRunAgent(id)}
      onToggleCollapse={toggleCollapse}
      onSetVisible={setVisible}
      onSetParent={setParent}
      onSizeChange={reportNodeSize}
    />
  ));
}
