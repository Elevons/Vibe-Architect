import { useEffect, useRef, useState } from "react";
import { FONT, RUN_MODES, TYPE_COLORS } from "../lib/constants";
import type { Plugin, RunMode } from "../lib/types";
import { Btn } from "./Btn";

/**
 * Top toolbar: node creation (with a dropdown for plugin node packages),
 * run mode, zoom controls, layout actions, and the run/save/ingest/prompt
 * entry points.
 */

interface ToolbarProps {
  mode: RunMode;
  zoom: number;
  nodeCount: number;
  edgeCount: number;
  plugins: Plugin[];
  onAddNode: (type: "file" | "folder" | "concept") => void;
  onAddPluginNode: (pluginName: string, type: string) => void;
  onSetMode: (mode: RunMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFitToView: () => void;
  onTidy: () => void;
  onSetAllCollapsed: (collapsed: boolean) => void;
  hierarchyOpen: boolean;
  onToggleHierarchy: () => void;
  onRunAll: () => void;
  onShowSaveLoad: () => void;
  onShowIngest: () => void;
  onShowPlugins: () => void;
  onExportPrompt: () => void;
}

/** Fixed width of the Add dropdown, used to clamp it on screen. */
const ADD_MENU_W = 240;

export function Toolbar(props: ToolbarProps) {
  return (
    <div className="va-toolbar" style={{
      display: "flex", alignItems: "center", gap: 8, padding: "7px 14px",
      background: "#111114", borderBottom: "1px solid #222", flexShrink: 0, flexWrap: "wrap",
    }}>
      <span className="va-brand" style={{ color: "#818cf8", fontWeight: 700, fontSize: 14, letterSpacing: "-0.03em", marginRight: 6 }}>
        ⬡ vibe-architect
      </span>
      <div style={{ width: 1, height: 18, background: "#333" }} />
      <AddNodeMenu plugins={props.plugins} onAddNode={props.onAddNode} onAddPluginNode={props.onAddPluginNode} />
      {renderModeSwitch(props.mode, props.onSetMode)}
      {renderZoomControls(props)}
      <Btn onClick={props.onFitToView} style={{ fontSize: 10, padding: "4px 8px" }}>Fit</Btn>
      <Btn onClick={props.onTidy} style={{ fontSize: 10, padding: "4px 8px", background: "#22d3ee18", color: "#22d3ee", borderColor: "#22d3ee30" }}>Tidy</Btn>
      <Btn onClick={() => props.onSetAllCollapsed(false)} style={{ fontSize: 10, padding: "4px 8px" }}>Expand All</Btn>
      <Btn onClick={() => props.onSetAllCollapsed(true)} style={{ fontSize: 10, padding: "4px 8px" }}>Collapse All</Btn>
      <Btn
        onClick={props.onToggleHierarchy}
        title="Toggle the scene hierarchy browser"
        style={{
          fontSize: 10, padding: "4px 8px",
          background: props.hierarchyOpen ? "#818cf818" : undefined,
          color: props.hierarchyOpen ? "#818cf8" : undefined,
          borderColor: props.hierarchyOpen ? "#818cf830" : undefined,
        }}
      >☰ Hierarchy</Btn>
      <div className="va-spacer" style={{ flex: 1 }} />
      <span className="va-counts" style={{ color: "#555", fontSize: 10 }}>{props.nodeCount}n · {props.edgeCount}e</span>
      <Btn onClick={props.onRunAll} style={{ background: "#4ade8018", color: "#4ade80", borderColor: "#4ade8030", fontSize: 11, padding: "4px 10px" }}>▶ Run All</Btn>
      <Btn onClick={props.onShowSaveLoad} style={{ fontSize: 11, padding: "4px 10px" }}>💾 Save/Load</Btn>
      <Btn onClick={props.onShowIngest} style={{ fontSize: 11, padding: "4px 10px", background: "#f472b618", color: "#f472b6", borderColor: "#f472b630" }}>📂 Ingest</Btn>
      <Btn onClick={props.onShowPlugins} title="Import a node package (plugin) JSON file" style={{ fontSize: 11, padding: "4px 10px", background: "#22d3ee18", color: "#22d3ee", borderColor: "#22d3ee30" }}>🧩 Plugins</Btn>
      <button
        onClick={props.onExportPrompt}
        style={{
          background: "#818cf8", color: "#0c0c0f", border: "none", borderRadius: 5,
          padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
        }}
      >
        Export Prompt
      </button>
    </div>
  );
}

/**
 * The "Add ▾" dropdown: the three built-in node types, then Custom nodes
 * grouped by imported plugin package (each package expands to its node
 * definitions). The menu is fixed-positioned so the scrollable mobile
 * toolbar never clips it.
 */
function AddNodeMenu(props: {
  plugins: Plugin[];
  onAddNode: (type: "file" | "folder" | "concept") => void;
  onAddPluginNode: (pluginName: string, type: string) => void;
}) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = (): void => {
    const button = buttonRef.current;
    if (button === null) {
      return;
    }
    const rect = button.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - ADD_MENU_W - 8)),
    });
  };

  const closeMenu = (): void => setAnchor(null);

  useEffect(() => {
    if (anchor === null) {
      return;
    }
    const closeOnOutside = (event: PointerEvent): void => {
      const menu = menuRef.current;
      const button = buttonRef.current;
      if (menu !== null && menu.contains(event.target as Node)) {
        return;
      }
      if (button !== null && button.contains(event.target as Node)) {
        return;
      }
      closeMenu();
    };
    const closeOnScroll = (): void => closeMenu();
    document.addEventListener("pointerdown", closeOnOutside, true);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [anchor]);

  const pickBuiltIn = (type: "file" | "folder" | "concept"): void => {
    props.onAddNode(type);
    closeMenu();
  };

  const pickPluginNode = (pluginName: string, type: string): void => {
    props.onAddPluginNode(pluginName, type);
    closeMenu();
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => (anchor === null ? openMenu() : closeMenu())}
        style={{
          background: anchor === null ? "#111" : "#818cf822",
          border: `1px solid ${anchor === null ? "#444" : "#818cf866"}`,
          borderRadius: 5, color: "#ccc", padding: "4px 10px", fontSize: 11,
          cursor: "pointer", fontFamily: FONT,
        }}
      >
        Add ▾
      </button>
      {anchor !== null && (
        <div
          ref={menuRef}
          onPointerDown={event => event.stopPropagation()}
          style={{
            position: "fixed", top: anchor.top, left: anchor.left, width: ADD_MENU_W,
            maxHeight: Math.max(160, window.innerHeight - anchor.top - 12),
            overflowY: "auto", background: "#151518", border: "1px solid #333",
            borderRadius: 8, boxShadow: "0 8px 32px #000c", zIndex: 1100, padding: 4,
          }}
        >
          {renderBuiltInRow("file", "File", pickBuiltIn)}
          {renderBuiltInRow("folder", "Folder", pickBuiltIn)}
          {renderBuiltInRow("concept", "Concept", pickBuiltIn)}
          <div style={{ height: 1, background: "#2a2a2a", margin: "5px 4px" }} />
          <div style={{
            fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em",
            padding: "4px 8px 2px", fontFamily: FONT, fontWeight: 700,
          }}>Custom nodes</div>
          {props.plugins.length === 0 && (
            <div style={{ fontSize: 10, color: "#555", padding: "4px 8px 6px", fontFamily: FONT }}>
              No plugins imported — use 🧩 Plugins
            </div>
          )}
          {props.plugins.map(plugin => renderPluginSection(plugin, expandedPlugin, setExpandedPlugin, pickPluginNode))}
        </div>
      )}
    </>
  );
}

/** One built-in node type row in the Add menu. */
function renderBuiltInRow(
  type: "file" | "folder" | "concept",
  label: string,
  onPick: (type: "file" | "folder" | "concept") => void,
) {
  const color = TYPE_COLORS[type].dot;
  return (
    <button
      onClick={() => onPick(type)}
      style={menuItemStyle()}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </button>
  );
}

/** A plugin package row plus its (expandable) node definitions. */
function renderPluginSection(
  plugin: Plugin,
  expandedPlugin: string | null,
  setExpandedPlugin: (name: string | null) => void,
  onPick: (pluginName: string, type: string) => void,
) {
  const expanded = expandedPlugin === plugin.name;
  return (
    <div key={plugin.name}>
      <button
        onClick={() => setExpandedPlugin(expanded ? null : plugin.name)}
        style={{ ...menuItemStyle(), justifyContent: "space-between", color: "#ddd" }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
          <span style={{ fontSize: 10, flexShrink: 0 }}>📦</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plugin.name}</span>
        </span>
        <span style={{ color: "#666", fontSize: 9, flexShrink: 0 }}>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && renderPluginNodes(plugin, onPick)}
    </div>
  );
}

/** The plugin's node definitions, grouped by category. */
function renderPluginNodes(plugin: Plugin, onPick: (pluginName: string, type: string) => void) {
  const categories = new Map<string, typeof plugin.nodes>();
  for (const node of plugin.nodes) {
    const category = node.category ?? "";
    const list = categories.get(category) ?? [];
    list.push(node);
    categories.set(category, list);
  }
  const sections: { category: string; nodes: typeof plugin.nodes }[] = [];
  for (const [category, nodes] of categories) {
    sections.push({ category, nodes });
  }
  return (
    <div>
      {sections.map(section => (
        <div key={section.category === "" ? "(none)" : section.category}>
          {section.category !== "" && (
            <div style={{
              fontSize: 9, color: "#777", padding: "5px 10px 1px 26px", fontFamily: FONT,
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>{section.category}</div>
          )}
          {section.nodes.map(node => (
            <button key={node.type} onClick={() => onPick(plugin.name, node.type)} style={{ ...menuItemStyle(), paddingLeft: 26 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: node.color ?? "#facc15",
              }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Shared style for Add-menu rows. */
function menuItemStyle() {
  return {
    display: "flex", alignItems: "center", gap: 8, width: "100%",
    background: "none", border: "none", color: "#ccc", textAlign: "left" as const,
    padding: "6px 8px", fontSize: 11, cursor: "pointer", fontFamily: FONT,
    borderRadius: 5, minHeight: 30,
  };
}

/** parallel / serial segmented switch. */
function renderModeSwitch(mode: RunMode, onSetMode: (mode: RunMode) => void) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, background: "#ffffff06", border: "1px solid #333", borderRadius: 5, padding: 2 }}>
      {RUN_MODES.map(entry => (
        <button
          key={entry}
          onClick={() => onSetMode(entry)}
          style={{
            background: mode === entry ? "#818cf822" : "transparent",
            border: mode === entry ? "1px solid #818cf844" : "1px solid transparent",
            borderRadius: 4, color: mode === entry ? "#818cf8" : "#666",
            padding: "3px 9px", fontSize: 10, cursor: "pointer", textTransform: "uppercase",
            letterSpacing: "0.05em", fontWeight: 600, fontFamily: FONT,
          }}
        >
          {entry}
        </button>
      ))}
    </div>
  );
}

/** − / % / + zoom cluster. */
function renderZoomControls(props: ToolbarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, background: "#ffffff06", border: "1px solid #333", borderRadius: 5, padding: 2 }}>
      <Btn onClick={props.onZoomOut} style={{ padding: "3px 7px", fontSize: 12, lineHeight: 1, borderRadius: 3 }}>−</Btn>
      <button
        onClick={props.onZoomReset}
        style={{
          background: "transparent", border: "none", color: "#888", fontSize: 10, fontFamily: FONT,
          cursor: "pointer", padding: "3px 6px", minWidth: 44, textAlign: "center",
        }}
      >
        {Math.round(props.zoom * 100)}%
      </button>
      <Btn onClick={props.onZoomIn} style={{ padding: "3px 7px", fontSize: 12, lineHeight: 1, borderRadius: 3 }}>+</Btn>
    </div>
  );
}
