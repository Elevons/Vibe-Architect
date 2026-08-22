import type { ReactNode } from "react";
import { FONT } from "../../lib/constants";

/**
 * Shared modal chrome: dimmed backdrop, centered panel, title row with a
 * close button. Clicking the backdrop closes the modal.
 */

interface ModalShellProps {
  title: string;
  maxWidth: number;
  gap?: number;
  maxHeight?: number | string;
  onClose: () => void;
  children: ReactNode;
}

export function ModalShell({ title, maxWidth, gap = 16, maxHeight, onClose, children }: ModalShellProps) {
  return (
    <div
      className="va-modal-backdrop"
      style={{
        position: "fixed", inset: 0, background: "#000c", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="va-modal-panel"
        onClick={event => event.stopPropagation()}
        style={{
          background: "#151518", border: "1px solid #333", borderRadius: 10, padding: 24,
          maxWidth, width: "100%", maxHeight, display: "flex", flexDirection: "column", gap,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, color: "#f0f0f0", fontFamily: FONT, fontSize: 15 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
