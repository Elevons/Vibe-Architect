import { useState } from "react";
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

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts / older browsers
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

export function PromptModal({ nodes, edges, mode, onClose }: PromptModalProps) {
  const prompt = BuildArchitecturePrompt(nodes, edges, mode);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(prompt);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <ModalShell title="Exported Architecture Prompt" maxWidth={720} gap={12} maxHeight="85vh" onClose={onClose}>
      <pre style={{
        background: "#0d0d10", border: "1px solid #222", borderRadius: 6, padding: 16,
        color: "#c8c8d0", fontFamily: FONT, fontSize: 11.5, lineHeight: 1.55,
        overflow: "auto", flex: 1, whiteSpace: "pre-wrap", margin: 0,
      }}>{prompt}</pre>
      <button
        onClick={handleCopy}
        style={{
          background: copied ? "#34d399" : "#818cf8",
          color: "#111",
          border: "none", borderRadius: 6,
          padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
        }}
      >
        {copied ? "Copied!" : "Copy to Clipboard"}
      </button>
    </ModalShell>
  );
}
