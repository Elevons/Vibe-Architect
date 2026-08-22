import { useMemo, useRef, useState } from "react";
import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from "react";
import { useCanvasSize } from "../hooks/useCanvasSize";
import { useCanvasInteraction } from "../hooks/useCanvasInteraction";
import { useWheelZoom } from "../hooks/useWheelZoom";
import { RunAgent } from "../lib/agent";
import { FONT, GROUP_CARD_H, GROUP_COLORS, MAX_ZOOM, MIN_ZOOM, NODE_H, NODE_W } from "../lib/constants";
import { EdgePathFromPoints, PortIn, PortOut, VisibleBounds } from "../lib/geometry";
import { TopoSort } from "../lib/graph";
import { CreateUniqueId } from "../lib/ids";
import { AutoGroupFromNodes, DagLayout } from "../lib/layout";
import type { Bounds, GraphEdge, GraphGroup, GraphNode, GraphSnapshot, NodeType, Point, RunMode } from "../lib/types";
import { EdgeLabel } from "./EdgeLabel";
import { GroupCard } from "./GroupCard";
import { Minimap } from "./Minimap";
import { NodeCard } from "./NodeCard";
import { GroupModal } from "./modals/GroupModal";
import { IngestModal } from "./modals/IngestModal";
import { PromptModal } from "./modals/PromptModal";
import { SaveLoadModal } from "./modals/SaveLoadModal";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";

/**
 * The main canvas: a pannable, zoomable node graph of software
 * architecture, with per-node code generation, groups, ingestion, and
 * save/load.
 */

export function VibeArchitect() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [groups, setGroups] = useState<GraphGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<RunMode>("parallel");
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [focusGroup, setFocusGroup] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [showIngest, setShowIngest] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasSize = useCanvasSize(canvasRef);

  // ── CRUD (updateNode/addEdge live here so the interaction hook can use them) ──
  const updateNode = (id: string, patch: Partial<GraphNode>): void => {
    setNodes(prev => prev.map(node => (node.id === id ? { ...node, ...patch } : node)));
  };

  const addEdge = (from: string, to: string): void => {
    setEdges(prev => [...prev, { id: CreateUniqueId("e"), from, to, label: "" }]);
  };

  const { panning, mousePos, edgeDraft, canvasMouseDown, handleDragStart, handleStartEdge, handleEndEdge } =
    useCanvasInteraction({ canvasRef, nodes, edges, pan, zoom, setPan, setSelected, setFocusGroup, updateNode, addEdge });
  useWheelZoom(canvasRef, pan, zoom, setPan, setZoom);

  const nodeMap = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);
  const groupsById = useMemo(() => new Map(groups.map(group => [group.id, group])), [groups]);

  const addNode = (type: NodeType = "file"): void => {
    const id = CreateUniqueId("n");
    const jitterX = Math.random() * 60 - 30;
    const jitterY = Math.random() * 60 - 30;
    const worldX = (canvasSize.width / 2 - pan.x) / zoom - NODE_W / 2 + jitterX;
    const worldY = (canvasSize.height / 2 - pan.y) / zoom - NODE_H / 2 + jitterY;
    const defaults = NodeDefaults(type);
    setNodes(prev => [...prev, {
      id, x: worldX, y: worldY, name: defaults.name, desc: defaults.desc,
      path: "", type, group: null, agentOutput: null, agentStatus: "idle",
    }]);
    setSelected(id);
  };

  const deleteNode = (id: string): void => {
    setNodes(prev => prev.filter(node => node.id !== id));
    setEdges(prev => prev.filter(edge => edge.from !== id && edge.to !== id));
    if (selected === id) {
      setSelected(null);
    }
  };

  const updateEdgeLabel = (edgeId: string, label: string): void => {
    setEdges(prev => prev.map(edge => (edge.id === edgeId ? { ...edge, label } : edge)));
  };

  const deleteEdge = (edgeId: string): void => {
    setEdges(prev => prev.filter(edge => edge.id !== edgeId));
  };

  const addGroup = (name: string): void => {
    setGroups(prev => [...prev, { id: CreateUniqueId("g"), name }]);
  };

  const deleteGroup = (groupId: string): void => {
    setGroups(prev => prev.filter(group => group.id !== groupId));
    setNodes(prev => prev.map(node => (node.group === groupId ? { ...node, group: null } : node)));
  };

  // ── Selection / focus ──
  const handleSelect = (id: string): void => {
    setSelected(id);
    const node = nodes.find(entry => entry.id === id);
    if (node === undefined) {
      return;
    }
    // Selecting a folder focuses the group it belongs to (or matches by name).
    if (node.type === "folder" && node.group !== null) {
      setFocusGroup(node.group);
    } else if (node.type === "folder") {
      const folderName = node.name.replace(/\/$/, "");
      const match = groups.find(group => group.name === folderName);
      setFocusGroup(match !== undefined ? match.id : null);
    } else if (focusGroup !== null && node.group !== focusGroup) {
      setFocusGroup(null);
    }
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

  // ── Group collapse ──
  const isHidden = (node: GraphNode): boolean => {
    if (node.group === null) {
      return false;
    }
    return groupsById.get(node.group)?.collapsed === true;
  };

  const toggleGroup = (groupId: string): void => {
    setGroups(prev => prev.map(group => (group.id === groupId ? { ...group, collapsed: !group.collapsed } : group)));
  };

  const setAllCollapsed = (collapsed: boolean): void => {
    setGroups(prev => prev.map(group => ({ ...group, collapsed })));
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
    if (nodes.length > 0 || groups.length > 0) {
      fitBounds(VisibleBounds(nodes, groups));
    }
  };

  const handleTidy = (): void => {
    const { groups: withGroups, nodes: groupedNodes } = AutoGroupFromNodes(nodes, groups);
    // Default new groups to collapsed; keep existing collapse state.
    const normalized = withGroups.map(group => ({ collapsed: true, ...group }));
    const { nodes: laidNodes, groups: laidGroups } = DagLayout(groupedNodes, edges, normalized);
    setNodes(laidNodes);
    setGroups(laidGroups);
    setTimeout(() => fitBounds(VisibleBounds(laidNodes, laidGroups)), 50);
  };

  // ── Save / load / ingest ──
  const getCurrentState = (): GraphSnapshot => ({
    nodes: nodes.map(({ agentOutput, agentStatus, ...rest }) => ({ ...rest, agentOutput, agentStatus: "idle" as const })),
    edges, groups, mode,
  });

  const handleLoad = (data: GraphSnapshot): void => {
    if (data.nodes !== undefined) {
      setNodes(data.nodes.map(node => ({ ...node, agentOutput: node.agentOutput || null, agentStatus: "idle" as const })));
    }
    if (data.edges !== undefined) {
      setEdges(data.edges);
    }
    if (data.groups !== undefined) {
      setGroups(data.groups);
    }
    if (data.mode !== undefined) {
      setMode(data.mode);
    }
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setSelected(null);
  };

  const handleIngest = (newNodes: GraphNode[], newEdges: GraphEdge[], newGroups: GraphGroup[]): void => {
    setNodes(newNodes);
    setEdges(newEdges);
    setGroups(newGroups);
    setSelected(null);
    setFocusGroup(null);
    setTimeout(() => fitBounds(VisibleBounds(newNodes, newGroups)), 100);
  };

  // ── Render ──
  const rect = canvasRef.current?.getBoundingClientRect();
  const gridSize = 24 * zoom;

  return (
    <div style={{
      width: "100%", height: "100vh", background: "#0c0c0f", display: "flex",
      flexDirection: "column", fontFamily: FONT, overflow: "hidden",
    }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>

      <Toolbar
        mode={mode}
        zoom={zoom}
        nodeCount={nodes.length}
        edgeCount={edges.length}
        onAddNode={addNode}
        onShowGroups={() => setShowGroups(true)}
        onSetMode={setMode}
        onZoomIn={() => zoomAboutCenter(1.25)}
        onZoomOut={() => zoomAboutCenter(1 / 1.25)}
        onZoomReset={zoomReset}
        onFitToView={fitToView}
        onTidy={handleTidy}
        onSetAllCollapsed={setAllCollapsed}
        onRunAll={() => void handleRunAll()}
        onShowSaveLoad={() => setShowSaveLoad(true)}
        onShowIngest={() => setShowIngest(true)}
        onExportPrompt={() => setShowPrompt(true)}
      />

      <div
        ref={canvasRef}
        onMouseDown={canvasMouseDown}
        style={{ flex: 1, position: "relative", overflow: "hidden", cursor: panning ? "grabbing" : "default" }}
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

        {/* Scaled world layer: group backgrounds */}
        <div style={{
          position: "absolute", inset: 0, transformOrigin: "0 0",
          transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, pointerEvents: "none",
        }}>
          {renderGroupBackgrounds(groups, nodes, focusGroup)}
        </div>

        {/* SVG edges (scaled) */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          <defs>
            <marker id="ah" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#555" />
            </marker>
          </defs>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {renderEdges(edges, nodeMap, groupsById, focusGroup, isHidden, zoom, updateEdgeLabel, deleteEdge)}
            {renderEdgeDraft(edgeDraft, rect, nodeMap, mousePos, pan, zoom)}
          </g>
        </svg>

        {/* Nodes + group cards (scaled) */}
        <div style={{
          position: "absolute", inset: 0, transformOrigin: "0 0",
          transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
        }}>
          {renderGroupCards(groups, nodes, focusGroup, toggleGroup, gid => setFocusGroup(gid === focusGroup ? null : gid))}
          {renderNodes(nodes, isHidden, focusGroup, groups, selected, handleSelect, handleDragStart, updateNode, deleteNode, handleStartEdge, handleEndEdge, handleRunAgent, zoom)}
        </div>

        {nodes.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <p style={{ color: "#444", fontSize: 14, fontFamily: FONT }}>Add a file, folder, or concept to start designing</p>
          </div>
        )}

        {renderMinimap(nodes, edges, groups, isHidden, pan, zoom, canvasSize, setPan)}
      </div>

      <StatusBar />

      {showPrompt && <PromptModal nodes={nodes} edges={edges} groups={groups} mode={mode} onClose={() => setShowPrompt(false)} />}
      {showSaveLoad && <SaveLoadModal onClose={() => setShowSaveLoad(false)} onLoad={handleLoad} currentState={getCurrentState()} />}
      {showGroups && <GroupModal groups={groups} onClose={() => setShowGroups(false)} onAdd={addGroup} onDelete={deleteGroup} />}
      {showIngest && <IngestModal onClose={() => setShowIngest(false)} onIngest={handleIngest} />}
    </div>
  );
}

/** Default name/desc for a freshly created node. */
function NodeDefaults(type: NodeType): { name: string; desc: string } {
  const defaults: Record<NodeType, { name: string; desc: string }> = {
    file: { name: "new_file.js", desc: "Describe what this file does…" },
    folder: { name: "new_folder/", desc: "Describe what this folder contains…" },
    concept: { name: "Untitled concept", desc: "Describe this architectural concept…" },
  };
  return defaults[type];
}

/** Read the latest nodes from state (used between serial agent steps). */
function ReadLatestNodes(setNodes: Dispatch<SetStateAction<GraphNode[]>>): Promise<GraphNode[]> {
  return new Promise(resolve => setNodes(prev => {
    resolve(prev);
    return prev;
  }));
}

/** Dashed fill behind each expanded group, sized to its members. */
function renderGroupBackgrounds(groups: GraphGroup[], nodes: GraphNode[], focusGroup: string | null) {
  return groups.map((group, groupIndex) => {
    if (group.collapsed) {
      return null;
    }
    const members = nodes.filter(node => node.group === group.id);
    const points = [
      { x: group.x ?? 60, y: group.y ?? 60, height: GROUP_CARD_H },
      ...members.map(node => ({ x: node.x, y: node.y, height: NODE_H })),
    ];
    const x1 = Math.min(...points.map(point => point.x)) - 14;
    const y1 = Math.min(...points.map(point => point.y)) - 14;
    const x2 = Math.max(...points.map(point => point.x)) + NODE_W + 14;
    const y2 = Math.max(...points.map(point => point.y + point.height)) + 14;
    const color = GROUP_COLORS[groupIndex % GROUP_COLORS.length];
    const dimmed = focusGroup !== null && group.id !== focusGroup;
    return (
      <div
        key={group.id}
        style={{
          position: "absolute", left: x1, top: y1, width: x2 - x1, height: y2 - y1,
          background: color, border: `1px dashed ${color.replace("30", "70")}`,
          borderRadius: 10, pointerEvents: "none", opacity: dimmed ? 0.15 : 1, transition: "opacity 0.2s",
        }}
      />
    );
  });
}

/** All visible edges: deduped, rerouted around collapsed groups. */
function renderEdges(
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
  groupsById: Map<string, GraphGroup>,
  focusGroup: string | null,
  isHidden: (node: GraphNode) => boolean,
  zoom: number,
  updateEdgeLabel: (edgeId: string, label: string) => void,
  deleteEdge: (edgeId: string) => void,
) {
  const seen = new Set<string>();
  return edges.map(edge => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (from === undefined || to === undefined) {
      return null;
    }
    const fromHidden = isHidden(from);
    const toHidden = isHidden(to);
    // Edge entirely inside one collapsed group: skip.
    if (fromHidden && toHidden && from.group === to.group) {
      return null;
    }
    // Dedupe collapsed-endpoint edges.
    const fromKey = fromHidden ? `g:${from.group}` : `n:${from.id}`;
    const toKey = toHidden ? `g:${to.group}` : `n:${to.id}`;
    const dedupeKey = `${fromKey}→${toKey}`;
    if (seen.has(dedupeKey)) {
      return null;
    }
    seen.add(dedupeKey);

    const fromGroup = fromHidden ? groupsById.get(from.group ?? "") ?? null : null;
    const toGroup = toHidden ? groupsById.get(to.group ?? "") ?? null : null;
    const pointA = fromGroup !== null
      ? { x: (fromGroup.x ?? 0) + NODE_W, y: (fromGroup.y ?? 0) + GROUP_CARD_H / 2 }
      : PortOut(from);
    const pointB = toGroup !== null
      ? { x: toGroup.x ?? 0, y: (toGroup.y ?? 0) + GROUP_CARD_H / 2 }
      : PortIn(to);
    const path = EdgePathFromPoints(pointA, pointB);
    const mid = { x: (pointA.x + pointB.x) / 2, y: (pointA.y + pointB.y) / 2 };
    const dimmed = focusGroup !== null && from.group !== focusGroup && to.group !== focusGroup;

    return (
      <g key={edge.id} opacity={dimmed ? 0.08 : 1} style={{ transition: "opacity 0.2s" }}>
        <path d={path} stroke="#333" strokeWidth={2 / zoom} fill="none" markerEnd="url(#ah)" />
        <path
          d={path}
          stroke="transparent"
          strokeWidth={Math.max(12, 16 / zoom)}
          fill="none"
          style={{ pointerEvents: dimmed ? "none" : "stroke", cursor: "pointer" }}
          onMouseDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); deleteEdge(edge.id); }}
        >
          <title>Click to remove</title>
        </path>
        {!fromHidden && !toHidden && (
          <EdgeLabel edge={edge} pos={{ x: mid.x, y: mid.y - 8 }} onUpdate={updateEdgeLabel} zoom={zoom} />
        )}
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
) {
  if (edgeDraft === null || rect === undefined) {
    return null;
  }
  const fromNode = nodeMap.get(edgeDraft.from);
  if (fromNode === undefined) {
    return null;
  }
  const from = PortOut(fromNode);
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

/** Collapsed group cards, positioned by layout. */
function renderGroupCards(
  groups: GraphGroup[],
  nodes: GraphNode[],
  focusGroup: string | null,
  toggleGroup: (id: string) => void,
  onFocusGroup: (id: string) => void,
) {
  return groups.map((group, groupIndex) => {
    if (group.x === null || group.x === undefined) {
      return null;
    }
    const dimmed = focusGroup !== null && group.id !== focusGroup;
    const count = nodes.filter(node => node.group === group.id).length;
    return (
      <GroupCard
        key={group.id}
        group={group}
        count={count}
        colorIdx={groupIndex}
        dimmed={dimmed}
        onToggle={toggleGroup}
        onFocus={onFocusGroup}
      />
    );
  });
}

/** All visible nodes, dimmed when another group is focused. */
function renderNodes(
  nodes: GraphNode[],
  isHidden: (node: GraphNode) => boolean,
  focusGroup: string | null,
  groups: GraphGroup[],
  selected: string | null,
  handleSelect: (id: string) => void,
  handleDragStart: (event: ReactMouseEvent, id: string) => void,
  updateNode: (id: string, patch: Partial<GraphNode>) => void,
  deleteNode: (id: string) => void,
  handleStartEdge: (id: string, event: ReactMouseEvent) => void,
  handleEndEdge: (id: string) => void,
  handleRunAgent: (id: string) => void,
  zoom: number,
) {
  return nodes.map(node => {
    if (isHidden(node)) {
      return null;
    }
    const dimmed = focusGroup !== null
      && node.group !== focusGroup
      && !(node.type === "folder" && groups.find(group => group.id === focusGroup)?.name === (node.name ?? "").replace(/\/$/, ""));
    return (
      <div key={node.id} style={{ opacity: dimmed ? 0.12 : 1, transition: "opacity 0.2s", pointerEvents: dimmed ? "none" : "auto" }}>
        <NodeCard
          node={node}
          selected={selected === node.id}
          groups={groups}
          zoom={zoom}
          onSelect={handleSelect}
          onDragStart={handleDragStart}
          onUpdate={updateNode}
          onDelete={deleteNode}
          onStartEdge={handleStartEdge}
          onEndEdge={handleEndEdge}
          onRunAgent={id => void handleRunAgent(id)}
        />
      </div>
    );
  });
}

/** Minimap fed with visible nodes plus collapsed group cards. */
function renderMinimap(
  nodes: GraphNode[],
  edges: GraphEdge[],
  groups: GraphGroup[],
  isHidden: (node: GraphNode) => boolean,
  pan: Point,
  zoom: number,
  canvasSize: { width: number; height: number },
  setPan: (pan: Point) => void,
) {
  const miniNodes: GraphNode[] = [
    ...nodes.filter(node => !isHidden(node)),
    ...groups
      .filter(group => group.x !== null && group.x !== undefined && group.collapsed)
      .map(group => ({ id: `gc_${group.id}`, x: group.x as number, y: (group.y as number) || 0, name: "", path: "", desc: "", type: "folder" as const, group: null, agentOutput: null, agentStatus: "idle" as const })),
  ];
  const miniMap = new Map(miniNodes.map(node => [node.id, node]));
  return (
    <Minimap
      nodes={miniNodes}
      edges={edges}
      nodeMap={miniMap}
      groups={groups.filter(group => !group.collapsed)}
      pan={pan}
      zoom={zoom}
      canvasW={canvasSize.width}
      canvasH={canvasSize.height}
      onPanTo={(x, y) => setPan({ x, y })}
    />
  );
}
