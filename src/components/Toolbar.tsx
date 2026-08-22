import { FONT, RUN_MODES } from "../lib/constants";
import type { NodeType, RunMode } from "../lib/types";
import { Btn } from "./Btn";

/**
 * Top toolbar: node creation, run mode, zoom controls, layout actions,
 * and the run/save/ingest/prompt entry points.
 */

interface ToolbarProps {
  mode: RunMode;
  zoom: number;
  nodeCount: number;
  edgeCount: number;
  onAddNode: (type: NodeType) => void;
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
  onExportPrompt: () => void;
}

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
      <Btn onClick={() => props.onAddNode("file")} style={{ fontSize: 11, padding: "4px 10px", color: "#818cf8", borderColor: "#818cf830" }}>+ File</Btn>
      <Btn onClick={() => props.onAddNode("folder")} style={{ fontSize: 11, padding: "4px 10px", color: "#4ade80", borderColor: "#4ade8030" }}>+ Folder</Btn>
      <Btn onClick={() => props.onAddNode("concept")} style={{ fontSize: 11, padding: "4px 10px", color: "#facc15", borderColor: "#facc1530" }}>+ Concept</Btn>
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
