import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { FONT, GROUP_CARD_H, NODE_W, TYPE_COLORS } from "../lib/constants";
import { BuildNodeMap, DescendantCount, SubtreeIds } from "../lib/sceneGraph";
import { Btn } from "./Btn";
import type { GraphNode, NodeType } from "../lib/types";

/**
 * A single box on the canvas. Double-click enters edit mode (name, spec,
 * type, parent); when selected, an action row offers Edit / Agent / Code /
 * Delete. Ports on the edges start and end connections.
 *
 * Corner controls: an eye toggles the node's own visibility, and a chevron
 * (parents only) collapses/expands its subtree. A collapsed parent renders
 * as a compact card with its descendant count.
 */

interface NodeCardProps {
  node: GraphNode;
  selected: boolean;
  nodes: GraphNode[];
  zoom: number;
  onSelect: (id: string) => void;
  onDragStart: (event: ReactMouseEvent, id: string) => void;
  onUpdate: (id: string, patch: Partial<GraphNode>) => void;
  onDelete: (id: string) => void;
  onStartEdge: (id: string, event: ReactMouseEvent) => void;
  onEndEdge: (id: string) => void;
  onRunAgent: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onSetVisible: (id: string, visible: boolean) => void;
  onSetParent: (id: string, parentId: string | null) => void;
}

/** Tags whose mousedown must not start a card drag. */
const NON_DRAG_TAGS = ["TEXTAREA", "INPUT", "SELECT", "BUTTON"];

export function NodeCard(props: NodeCardProps) {
  const { node, selected, nodes } = props;
  const [editing, setEditing] = useState(false);
  const [localName, setLocalName] = useState(node.name);
  const [localDesc, setLocalDesc] = useState(node.desc);
  const [showOutput, setShowOutput] = useState(false);

  // Keep local edit buffers in sync when the node changes externally.
  useEffect(() => {
    setLocalName(node.name);
    setLocalDesc(node.desc);
  }, [node.name, node.desc]);

  const colors = TYPE_COLORS[node.type];
  const descendantCount = DescendantCount(nodes, node.id);
  const isParent = descendantCount > 0;

  const commitEdit = (): void => {
    props.onUpdate(node.id, { name: localName, desc: localDesc });
    setEditing(false);
  };

  const cancelEdit = (): void => {
    setEditing(false);
    setLocalName(node.name);
    setLocalDesc(node.desc);
  };

  const handleMouseDown = (event: ReactMouseEvent): void => {
    if (NON_DRAG_TAGS.includes((event.target as HTMLElement).tagName)) {
      return;
    }
    event.stopPropagation();
    props.onSelect(node.id);
    props.onDragStart(event, node.id);
  };

  if (node.collapsed) {
    return renderCollapsedCard(node, selected, colors, descendantCount, props);
  }

  return (
    <div
      data-nodecard="true"
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute", left: node.x, top: node.y, width: NODE_W, minHeight: 80,
        background: colors.bg, border: `1.5px solid ${selected ? "#fff" : colors.border}`,
        borderRadius: 8, padding: "10px 12px", cursor: "grab", userSelect: "none",
        boxShadow: selected ? `0 0 0 2px ${colors.border}44, 0 4px 24px #0008` : "0 2px 12px #0004",
        zIndex: selected ? 10 : 1,
      }}
    >
      {renderPorts(node, colors, props)}
      {renderCornerControls(node, isParent, props)}
      {editing
        ? renderEditForm(node, nodes, localName, localDesc, colors, setLocalName, setLocalDesc, commitEdit, cancelEdit, props)
        : renderDisplay(node, nodes, setEditing, isParent)}
      {selected && !editing && renderActionRow(node, showOutput, setEditing, setShowOutput, props)}
      {showOutput && node.agentOutput !== null && (
        <pre style={{
          marginTop: 8, padding: 8, background: "#0a0a0f", border: "1px solid #222", borderRadius: 4,
          fontSize: 10, color: "#8b8", fontFamily: FONT, maxHeight: 180, overflow: "auto",
          whiteSpace: "pre-wrap", lineHeight: 1.4,
        }}>{node.agentOutput}</pre>
      )}
    </div>
  );
}

/** Compact card for a collapsed parent: name, descendant count, expand. */
function renderCollapsedCard(
  node: GraphNode,
  selected: boolean,
  colors: { border: string; dot: string },
  descendantCount: number,
  props: NodeCardProps,
) {
  return (
    <div
      data-nodecard="true"
      onMouseDown={event => {
        event.stopPropagation();
        props.onSelect(node.id);
        props.onDragStart(event, node.id);
      }}
      style={{
        position: "absolute", left: node.x, top: node.y, width: NODE_W, height: GROUP_CARD_H,
        background: "#15151c", border: `1.5px solid ${selected ? "#fff" : colors.border}88`,
        borderRadius: 8, padding: "8px 12px", boxSizing: "border-box",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        cursor: "grab", userSelect: "none", zIndex: 5,
        boxShadow: selected ? `0 0 0 2px ${colors.border}44, 0 4px 24px #0008` : "0 2px 12px #0004",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 46 }}>
        <span style={{ color: colors.dot, fontSize: 12, lineHeight: 1 }}>▣</span>
        <span style={{
          fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#e8e8f0",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{node.name}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: FONT, fontSize: 9, color: "#666" }}>
          {descendantCount} item{descendantCount === 1 ? "" : "s"}
        </span>
        <button
          onClick={event => { event.stopPropagation(); props.onToggleCollapse(node.id); }}
          style={{
            background: `${colors.dot}18`, border: `1px solid ${colors.dot}40`, borderRadius: 4, color: colors.dot,
            padding: "2px 8px", fontSize: 9, cursor: "pointer", fontFamily: FONT, fontWeight: 600,
          }}
        >
          Expand ▾
        </button>
      </div>
      {renderCornerControls(node, true, props)}
    </div>
  );
}

/** Eye (visibility) and chevron (collapse) buttons in the card corner. */
function renderCornerControls(node: GraphNode, isParent: boolean, props: NodeCardProps) {
  const buttonStyle: CSSProperties = {
    position: "absolute", top: 4, width: 18, height: 18, borderRadius: 4,
    background: "#0006", border: "1px solid #ffffff22", color: "#aaa",
    fontSize: 10, lineHeight: "16px", textAlign: "center", cursor: "pointer", padding: 0, zIndex: 20,
  };
  return (
    <>
      {isParent && (
        <button
          style={{ ...buttonStyle, right: 26 }}
          title={node.collapsed ? "Expand children" : "Collapse children"}
          onMouseDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); props.onToggleCollapse(node.id); }}
        >
          {node.collapsed ? "▸" : "▾"}
        </button>
      )}
      <button
        style={{ ...buttonStyle, right: 4, opacity: node.visible ? 1 : 0.45 }}
        title={node.visible ? "Hide node" : "Show node"}
        onMouseDown={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); props.onSetVisible(node.id, !node.visible); }}
      >
        {node.visible ? "👁" : "–"}
      </button>
    </>
  );
}

/** Color of the agent status dot; transparent when idle. */
function AgentStatusColor(status: GraphNode["agentStatus"]): string {
  if (status === "running") {
    return "#facc15";
  }
  if (status === "done") {
    return "#4ade80";
  }
  if (status === "error") {
    return "#f87171";
  }
  return "transparent";
}

/** Output port (right) starts an edge; input port (left) ends one. */
function renderPorts(node: GraphNode, colors: { dot: string }, props: NodeCardProps) {
  const base: CSSProperties = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    width: 14, height: 14, borderRadius: "50%", background: colors.dot,
    border: "2px solid #111", cursor: "crosshair", zIndex: 20,
  };
  return (
    <>
      <div
        style={{ ...base, right: -7 }}
        onMouseDown={event => { event.stopPropagation(); props.onStartEdge(node.id, event); }}
        title="Drag to connect"
      />
      <div
        style={{ ...base, left: -7, opacity: 0.5 }}
        onMouseUp={event => { event.stopPropagation(); props.onEndEdge(node.id); }}
      />
    </>
  );
}

/** Double-clickable read-only view of the node. */
function renderDisplay(node: GraphNode, nodes: GraphNode[], setEditing: (editing: boolean) => void, isParent: boolean) {
  const colors = TYPE_COLORS[node.type];
  const nodeMap = BuildNodeMap(nodes);
  const parentName = node.parentId !== null ? nodeMap.get(node.parentId)?.name ?? "" : "";
  const statusColor = AgentStatusColor(node.agentStatus);
  return (
    <div onDoubleClick={() => setEditing(true)}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, paddingRight: isParent ? 46 : 26 }}>
        {node.agentStatus !== "idle" && (
          <span style={{
            width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0,
            animation: node.agentStatus === "running" ? "pulse 1s infinite" : "none",
          }} />
        )}
        <span style={{
          fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#f0f0f0",
          letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{node.name}</span>
        <span style={{
          fontSize: 9, color: colors.dot, background: `${colors.dot}18`, padding: "1px 5px",
          borderRadius: 3, marginLeft: "auto", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600,
        }}>{node.type}</span>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "#999", lineHeight: 1.45, fontFamily: FONT }}>{node.desc}</p>
      {node.path !== "" && node.path !== node.name && (
        <span style={{ fontSize: 9, color: "#555", marginTop: 2, display: "block", fontFamily: FONT, opacity: 0.7 }}>
          {node.path}
        </span>
      )}
      {node.parentId !== null && parentName !== "" && (
        <span style={{ fontSize: 9, color: "#666", marginTop: 2, display: "inline-block" }}>⤷ {parentName}</span>
      )}
    </div>
  );
}

/** Edit form: name, spec, type, parent, save/cancel. */
function renderEditForm(
  node: GraphNode,
  nodes: GraphNode[],
  localName: string,
  localDesc: string,
  colors: { border: string },
  setLocalName: (name: string) => void,
  setLocalDesc: (desc: string) => void,
  commitEdit: () => void,
  cancelEdit: () => void,
  props: NodeCardProps,
) {
  const selectStyle: CSSProperties = {
    flex: 1, background: "#111", border: "1px solid #fff3", borderRadius: 4, padding: "4px", color: "#ccc", fontSize: 10,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <input
        value={localName}
        onChange={event => setLocalName(event.target.value)}
        autoFocus
        style={{ background: "#0002", border: "1px solid #fff3", borderRadius: 4, padding: "4px 6px", color: "#fff", fontFamily: FONT, fontSize: 13 }}
      />
      <textarea
        value={localDesc}
        onChange={event => setLocalDesc(event.target.value)}
        rows={3}
        style={{ background: "#0002", border: "1px solid #fff3", borderRadius: 4, padding: "4px 6px", color: "#ccc", fontFamily: FONT, fontSize: 11, resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: 4 }}>
        <select value={node.type} onChange={event => props.onUpdate(node.id, { type: event.target.value as NodeType })} style={selectStyle}>
          {(Object.keys(TYPE_COLORS) as NodeType[]).map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <select value={node.parentId ?? ""} onChange={event => props.onSetParent(node.id, event.target.value || null)} style={selectStyle}>
          <option value="">No parent</option>
          {ParentOptions(nodes, node.id).map(option => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <Btn onClick={commitEdit} style={{ flex: 1, background: colors.border, color: "#111", fontWeight: 600 }}>Save</Btn>
        <Btn onClick={cancelEdit} style={{ flex: 1, background: "#333" }}>Cancel</Btn>
      </div>
    </div>
  );
}

/**
 * Nodes the given node may be parented under: everything except itself and
 * its own descendants (which would create a cycle).
 */
function ParentOptions(nodes: GraphNode[], nodeId: string): GraphNode[] {
  const excluded = new Set(SubtreeIds(nodes, nodeId));
  return nodes.filter(node => !excluded.has(node.id));
}

/** Action row shown while the card is selected: Edit, Agent, Code, Delete. */
function renderActionRow(
  node: GraphNode,
  showOutput: boolean,
  setEditing: (editing: boolean) => void,
  setShowOutput: (show: boolean) => void,
  props: NodeCardProps,
) {
  const running = node.agentStatus === "running";
  return (
    <div style={{ display: "flex", gap: 3, marginTop: 8, flexWrap: "wrap" }}>
      <Btn onClick={() => setEditing(true)}>Edit</Btn>
      <Btn
        onClick={() => props.onRunAgent(node.id)}
        style={{
          background: running ? "#facc1520" : "#818cf815",
          color: running ? "#facc15" : "#818cf8",
          borderColor: running ? "#facc1540" : "#818cf830",
        }}
      >
        {running ? "Running…" : "▶ Agent"}
      </Btn>
      {node.agentOutput !== null && (
        <Btn onClick={() => setShowOutput(!showOutput)}>{showOutput ? "Hide" : "Code"}</Btn>
      )}
      <Btn
        onClick={() => props.onDelete(node.id)}
        style={{ background: "#ff000018", color: "#f87171", borderColor: "#ff000030", marginLeft: "auto" }}
      >✕</Btn>
    </div>
  );
}
