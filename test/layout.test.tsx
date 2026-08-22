import { createRoot } from "react-dom/client";
import { VibeArchitect } from "../src/components/VibeArchitect";

/**
 * Layout metrics probe: reports the computed mobile layout (toolbar rows,
 * touch target sizes, minimap scale, root height) into <pre id="out">.
 */

const out: string[] = [];
const rect = (element: Element): string => {
  const box = element.getBoundingClientRect();
  return `x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}`;
};
const cs = (element: Element): CSSStyleDeclaration => getComputedStyle(element);

createRoot(document.getElementById("root") as HTMLElement).render(<VibeArchitect />);
await new Promise(resolve => setTimeout(resolve, 500));

const root = document.querySelector(".va-root");
const toolbar = document.querySelector(".va-toolbar");
const status = document.querySelector(".va-status");
const minimap = document.querySelector(".va-minimap");
if (root === null || toolbar === null || status === null || minimap === null) {
  throw new Error("missing layout elements");
}
const buttons = Array.from(document.querySelectorAll(".va-toolbar button"));
const smallestButton = Math.min(...buttons.map(button => button.getBoundingClientRect().height));

out.push(`viewport: ${window.innerWidth}x${window.innerHeight}`);
out.push(`root: ${rect(root)} (height ${cs(root).height})`);
out.push(`toolbar: ${rect(toolbar)} rows=${toolbar.getBoundingClientRect().height <= 50 ? "single" : "WRAPPED"} overflowX=${cs(toolbar).overflowX} flexWrap=${cs(toolbar).flexWrap}`);
out.push(`smallest toolbar button height: ${Math.round(smallestButton)}px`);
out.push(`status: ${rect(status)} overflowX=${cs(status).overflowX}`);
out.push(`minimap: ${rect(minimap)} transform=${cs(minimap).transform}`);
out.push(`body scrollHeight: ${document.body.scrollHeight} (should equal viewport height)`);

const outElement = document.getElementById("out");
if (outElement !== null) {
  outElement.textContent = out.join("\n");
}
