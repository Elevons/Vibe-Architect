import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, PointerEvent as ReactPointerEvent, ReactElement, SetStateAction } from "react";
import { useCanvasSize } from "../hooks/useCanvasSize";
import { useCanvasInteraction } from "../hooks/useCanvasInteraction";
import { useWheelZoom } from "../hooks/useWheelZoom";
import { RunAgent } from "../lib/agent";
import { FONT, GROUP_COLORS, MAX_ZOOM, MIN_ZOOM, NODE_H, NODE_W } from "../lib/constants";
import { DescendantBounds, EdgePathFromPoints, PortIn, PortOut, VisibleBounds } from "../lib/geometry";
import { TopoSort } from "../lib/graph";
import { CreateUniqueId } from "../lib/ids";
import { DagLayout } from "../lib/layout";
import { NodeDefaultsFor } from "../lib/plugins";
import { BuildChildrenMap, BuildNodeMap, ComputeRenderedSet, DescendantCount, SetParent, SubtreeIds } from "../lib/sceneGraph";
import type { Bounds, GraphEdge, GraphNode, GraphSnapshot, NodeSize, NodeType, Point, Plugin, RunMode } from "../lib/types";
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

  const addEdge = (from: string, to: string): void => {
    setEdges(prev => [...prev, { id: CreateUniqueId("e"), from, to, label: "" }]);

    // Folders act as groups: an edge touching a folder pulls the other
    // endpoint in as its child in the hierarchy (cycle-safe). File-to-file
    // edges are plain dependencies and leave the hierarchy untouched.
    const fromNode = nodes.find(node => node.id === from);
    const toNode = nodes.find(node => node.id === to);
    if (fromNode === undefined || toNode === undefined) {
      return;
    }
    let childId: string | null = null;
    let folderId: string | null = null;
    if (fromNode.type === "folder" && toNode.type !== "folder") {
      folderId = fromNode.id;
      childId = toNode.id;
    } else if (toNode.type === "folder" && fromNode.type !== "folder") {
      folderId = toNode.id;
      childId = fromNode.id;
    } else if (fromNode.type === "folder" && toNode.type === "folder") {
      // Folder-to-folder: the target folder nests inside the source folder.
      folderId = fromNode.id;
      childId = toNode.id;
    }
    if (childId !== null && folderId !== null) {
      setNodes(prev => SetParent(prev, childId, folderId));
    }
  };

  const { panning, pointerPos, edgeDraft, canvasPointerDown, handleDragStart, handleStartEdge, handleEndEdge } =
    useCanvasInteraction({ canvasRef, nodes, edges, pan, zoom, setPan, setZoom, setSelected, updateNode, addEdge });
  useWheelZoom(canvasRef, pan, zoom, setPan, setZoom);

  const nodeMap = useMemo(() => BuildNodeMap(nodes), [nodes]);
  const rendered = useMemo(() => ComputeRenderedSet(nodes), [nodes]);

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
    setEdges(prev => prev.filter(edge => edge.id !== edgeId));
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
          {renderParentBackgrounds(nodes, rendered, nodeSizes)}
        </div>

        {/* SVG edges (scaled) */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          <defs>
            <marker id="ah" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#555" />
            </marker>
          </defs>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {renderEdges(edges, nodeMap, rendered, zoom, nodeSizes, updateEdgeLabel, deleteEdge)}
            {renderEdgeDraft(edgeDraft, rect, nodeMap, pointerPos, pan, zoom, nodeSizes)}
          </g>
        </svg>

        {/* Nodes (scaled) */}
        <div style={{
          position: "absolute", inset: 0, transformOrigin: "0 0",
          transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
        }}>
          {renderNodes(nodes, rendered, selected, handleSelect, handleDragStart, updateNode, deleteNode, handleStartEdge, handleEndEdge, handleRunAgent, zoom, toggleCollapse, setVisible, setParent, reportNodeSize, plugins)}
        </div>

        {nodes.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <p style={{ color: "#444", fontSize: 14, fontFamily: FONT }}>Add a file, folder, or concept to start designing</p>
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

/** Dashed fill behind each rendered parent, sized to its rendered children. */
function renderParentBackgrounds(nodes: GraphNode[], rendered: Set<string>, nodeSizes: Record<string, NodeSize>): ReactElement[] {
  const childrenMap = BuildChildrenMap(nodes);
  const backgrounds: ReactElement[] = [];
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
    backgrounds.push(
      <div
        key={node.id}
        style={{
          position: "absolute", left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h,
          background: color, border: `1px dashed ${color.replace("30", "70")}`,
          borderRadius: 10, pointerEvents: "none",
        }}
      />,
    );
  }
  return backgrounds;
}

/** True when the node has at least one rendered direct child. */
function HasRenderedChild(
  childrenMap: Map<string, string[]>,
  nodeId: string,
  rendered: Set<string>,
): boolean {
  return (childrenMap.get(nodeId) ?? []).some(id => rendered.has(id));
}

/** Edges whose endpoints are both rendered. */
function renderEdges(
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
  rendered: Set<string>,
  zoom: number,
  nodeSizes: Record<string, NodeSize>,
  updateEdgeLabel: (edgeId: string, label: string) => void,
  deleteEdge: (edgeId: string) => void,
) {
  return edges.map(edge => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (from === undefined || to === undefined) {
      return null;
    }
    if (!rendered.has(edge.from) || !rendered.has(edge.to)) {
      return null;
    }
    const pointA = PortOut(from, nodeSizes[edge.from]);
    const pointB = PortIn(to, nodeSizes[edge.to]);
    const path = EdgePathFromPoints(pointA, pointB);
    const mid = { x: (pointA.x + pointB.x) / 2, y: (pointA.y + pointB.y) / 2 };
    return (
      <g key={edge.id}>
        <path d={path} stroke="#333" strokeWidth={2 / zoom} fill="none" markerEnd="url(#ah)" />
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
        <EdgeLabel edge={edge} pos={{ x: mid.x, y: mid.y - 8 }} onUpdate={updateEdgeLabel} zoom={zoom} />
      </g>
    );
  });
}

/** The in-progress dashed edge from a port to the cursor. */
function renderEdgeDraft(
  edgeDraft: { from: string; to: string | null } | null,
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
  const from = PortOut(fromNode, nodeSizes[edgeDraft.from]);
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

/** All rendered nodes as cards. */
function renderNodes(
  nodes: GraphNode[],
  rendered: Set<string>,
  selected: string | null,
  handleSelect: (id: string) => void,
  handleDragStart: (event: ReactPointerEvent, id: string) => void,
  updateNode: (id: string, patch: Partial<GraphNode>) => void,
  deleteNode: (id: string) => void,
  handleStartEdge: (id: string, event: ReactPointerEvent) => void,
  handleEndEdge: (id: string) => void,
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
      onUpdate={updateNode}
      onDelete={deleteNode}
      onStartEdge={handleStartEdge}
      onEndEdge={handleEndEdge}
      onRunAgent={id => void handleRunAgent(id)}
      onToggleCollapse={toggleCollapse}
      onSetVisible={setVisible}
      onSetParent={setParent}
      onSizeChange={reportNodeSize}
    />
  ));
}
