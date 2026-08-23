import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { FONT, TYPE_COLORS } from "../lib/constants";
import { BuildChildrenMap, ComputeRenderedSet } from "../lib/sceneGraph";
import type { GraphNode } from "../lib/types";

/**
 * Scene hierarchy browser: a collapsible tree of the whole graph, floating
 * on the right side above the minimap. Clicking a row selects the node and
 * centers the canvas on it; the chevron expands/collapses the tree branch
 * (independent of the node's own collapsed flag); the eye toggles the
 * node's visibility. Hidden nodes are dimmed.
 */

interface HierarchyPanelProps {
  nodes: GraphNode[];
  selected: string | null;
  onSelectAndFocus: (id: string) => void;
  onSetVisible: (id: string, visible: boolean) => void;
  onClose: () => void;
}

export function HierarchyPanel({ nodes, selected, onSelectAndFocus, onSetVisible, onClose }: HierarchyPanelProps) {
  // Tree branches the user has folded away; everything else is expanded.
  const [folded, setFolded] = useState<Set<string>>(new Set());

  const childrenMap = useMemo(() => BuildChildrenMap(nodes), [nodes]);
  const rendered = useMemo(() => ComputeRenderedSet(nodes), [nodes]);
  const roots = useMemo(
    () => nodes.filter(node => node.parentId === null),
    [nodes],
  );

  const toggleFold = (id: string): void => {
    setFolded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = (): void => setFolded(new Set());
  const collapseAll = (): void => setFolded(new Set(nodes.filter(node => (childrenMap.get(node.id) ?? []).length > 0).map(node => node.id)));

  return (
    <div
      className="va-hierarchy"
      data-nodecard="true"
      onPointerDown={event => event.stopPropagation()}
      style={{
        position: "absolute", right: 12, bottom: 164, width: 220,
        background: "#0d0d10e8", border: "1px solid #2a2a2f", borderRadius: 8,
        display: "flex", flexDirection: "column", overflow: "hidden",
        zIndex: 60, backdropFilter: "blur(8px)",
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 4, padding: "6px 8px",
        borderBottom: "1px solid #222", flexShrink: 0,
      }}>
        <span style={{
          fontSize: 9, color: "#888", letterSpacing: "0.08em", textTransform: "uppercase",
          fontWeight: 700, flex: 1,
        }}>hierarchy</span>
        <button onClick={expandAll} title="Expand all branches" style={headerButtonStyle}>⊞</button>
        <button onClick={collapseAll} title="Collapse all branches" style={headerButtonStyle}>⊟</button>
        <button onClick={onClose} title="Hide panel" style={headerButtonStyle}>✕</button>
      </div>

      <div className="va-hierarchy-scroll" style={{ overflowY: "auto", maxHeight: "40vh", padding: "4px 0", flex: 1 }}>
        {roots.length === 0 && (
          <span style={{ display: "block", padding: "8px 10px", fontSize: 10, color: "#555", fontFamily: FONT }}>
            No nodes yet
          </span>
        )}
        {roots.map(node => (
          <TreeRow
            key={node.id}
            node={node}
            depth={0}
            nodes={nodes}
            childrenMap={childrenMap}
            rendered={rendered}
            folded={folded}
            selected={selected}
            onToggleFold={toggleFold}
            onSelectAndFocus={onSelectAndFocus}
            onSetVisible={onSetVisible}
          />
        ))}
      </div>
    </div>
  );
}

const headerButtonStyle = {
  background: "none", border: "none", color: "#777", fontSize: 11,
  cursor: "pointer", padding: "2px 4px", lineHeight: 1, fontFamily: FONT,
} as const;

interface TreeRowProps {
  node: GraphNode;
  depth: number;
  nodes: GraphNode[];
  childrenMap: Map<string, string[]>;
  rendered: Set<string>;
  folded: Set<string>;
  selected: string | null;
  onToggleFold: (id: string) => void;
  onSelectAndFocus: (id: string) => void;
  onSetVisible: (id: string, visible: boolean) => void;
}

function TreeRow(props: TreeRowProps): ReactElement {
  const { node, depth, childrenMap, rendered, folded, selected } = props;
  const childIds = childrenMap.get(node.id) ?? [];
  const hasChildren = childIds.length > 0;
  const isFolded = folded.has(node.id);
  const isSelected = selected === node.id;
  const colors = TYPE_COLORS[node.type];

  return (
    <>
      <div
        onClick={() => props.onSelectAndFocus(node.id)}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: `3px 8px 3px ${8 + depth * 12}px`,
          cursor: "pointer", minHeight: 24, boxSizing: "border-box",
          background: isSelected ? "#818cf822" : "transparent",
          // Dimmed whenever the node is not on the canvas: its own eye is
          // off, an ancestor is hidden, or an ancestor is collapsed.
          opacity: rendered.has(node.id) ? 1 : 0.4,
        }}
      >
        {hasChildren ? (
          <button
            onClick={event => { event.stopPropagation(); props.onToggleFold(node.id); }}
            title={isFolded ? "Expand branch" : "Fold branch"}
            style={{
              background: "none", border: "none", color: "#777", cursor: "pointer",
              fontSize: 9, width: 14, padding: 0, lineHeight: 1, flexShrink: 0,
            }}
          >
            {isFolded ? "▸" : "▾"}
          </button>
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}
        <span style={{ color: colors.dot, fontSize: 8, lineHeight: 1, flexShrink: 0 }}>●</span>
        <span style={{
          flex: 1, fontSize: 10.5, color: isSelected ? "#e8e8f0" : "#bbb", fontFamily: FONT,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{node.name}</span>
        {node.collapsed && (
          <span title="Subtree collapsed on canvas" style={{ fontSize: 8, color: "#666", flexShrink: 0 }}>▣</span>
        )}
        <button
          onClick={event => { event.stopPropagation(); props.onSetVisible(node.id, !node.visible); }}
          title={node.visible ? "Hide node" : "Show node"}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 10, color: "#999", padding: "0 2px", lineHeight: 1, flexShrink: 0,
          }}
        >
          {node.visible ? "👁" : "–"}
        </button>
      </div>
      {hasChildren && !isFolded && childIds.map(childId => {
        const child = props.nodes.find(entry => entry.id === childId);
        if (child === undefined) {
          return null;
        }
        return <TreeRow key={childId} {...props} node={child} depth={depth + 1} />;
      })}
    </>
  );
}
