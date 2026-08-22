import { FONT } from "../../lib/constants";
import { BuildArchitecturePrompt } from "../../lib/prompt";
import type { GraphEdge, GraphNode, RunMode } from "../../lib/types";
import { ModalShell } from "./ModalShell";

/**
 * Shows the exported architecture prompt and copies it to the clipboard.
 */

interface PromptModalProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  mode: RunMode;
  onClose: () => void;
}

export function PromptModal({ nodes, edges, mode, onClose }: PromptModalProps) {
  const prompt = BuildArchitecturePrompt(nodes, edges, mode);

  return (
    <ModalShell title="Exported Architecture Prompt" maxWidth={720} gap={12} maxHeight="85vh" onClose={onClose}>
      <pre style={{
        background: "#0d0d10", border: "1px solid #222", borderRadius: 6, padding: 16,
        color: "#c8c8d0", fontFamily: FONT, fontSize: 11.5, lineHeight: 1.55,
        overflow: "auto", flex: 1, whiteSpace: "pre-wrap", margin: 0,
      }}>{prompt}</pre>
      <button
        onClick={() => navigator.clipboard?.writeText(prompt)}
        style={{
          background: "#818cf8", color: "#111", border: "none", borderRadius: 6,
          padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
        }}
      >
        Copy to Clipboard
      </button>
    </ModalShell>
  );
}
