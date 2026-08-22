import { createRoot } from "react-dom/client";
import { VibeArchitect } from "../src/components/VibeArchitect";

/**
 * Headless touch-gesture integration test.
 *
 * Drives the real app with synthetic PointerEvents (the same events a phone
 * browser fires) and reports results into <pre id="results"> for the
 * --dump-dom harness to read.
 */

const results: string[] = [];
const pass = (name: string, ok: boolean, detail?: string): void => {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined && detail !== "" ? ` (${detail})` : ""}`);
};

/** Dispatch a PointerEvent of the given type on an element. */
function fire(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  x: number,
  y: number,
  pointerId: number,
  pointerType: "touch" = "touch",
): void {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    pointerId,
    pointerType,
    isPrimary: pointerId === 1,
    buttons: type === "pointerup" ? 0 : 1,
  }));
}

/** The scaled world layer (the div whose inline transform holds pan+zoom). */
function worldLayer(): HTMLElement {
  const layers = Array.from(document.querySelectorAll("div")).filter(div => {
    const style = div.getAttribute("style") ?? "";
    return style.includes("translate(") && style.includes("scale(") && style.includes("transform-origin: 0px 0px");
  });
  // The node layer is the last one (edges SVG is a sibling, backgrounds first).
  return layers[layers.length - 1] as HTMLElement;
}

function parseTransform(): { x: number; y: number; zoom: number } {
  const transform = worldLayer().style.transform;
  const match = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\) scale\(([-\d.]+)\)/);
  if (match === null) {
    throw new Error(`Unparseable transform: ${transform}`);
  }
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

const nextFrame = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 60));

async function run(): Promise<void> {
  const root = createRoot(document.getElementById("root") as HTMLElement);
  root.render(<VibeArchitect />);
  await nextFrame();

  const canvas = document.querySelector("[data-pan='true']") as HTMLElement;
  if (canvas === null) {
    throw new Error("canvas not found");
  }

  // ── Test 1: single-finger pan ──
  fire(canvas, "pointerdown", 200, 300, 1);
  await nextFrame();
  fire(canvas, "pointermove", 150, 250, 1);
  await nextFrame();
  fire(canvas, "pointerup", 150, 250, 1);
  await nextFrame();
  const afterPan = parseTransform();
  pass("pan", Math.abs(afterPan.x + 50) < 1 && Math.abs(afterPan.y + 50) < 1, `pan=(${afterPan.x},${afterPan.y})`);

  // ── Test 2: pinch zoom (distance 100 → 200, expect zoom ×2) ──
  const beforePinch = parseTransform();
  fire(canvas, "pointerdown", 150, 400, 1);
  await nextFrame();
  fire(canvas, "pointerdown", 250, 400, 2);
  await nextFrame();
  fire(canvas, "pointermove", 100, 400, 1);
  await nextFrame();
  fire(canvas, "pointermove", 300, 400, 2);
  await nextFrame();
  fire(canvas, "pointerup", 300, 400, 2);
  await nextFrame();
  fire(canvas, "pointerup", 100, 400, 1);
  await nextFrame();
  const afterPinch = parseTransform();
  const zoomRatio = afterPinch.zoom / beforePinch.zoom;
  pass("pinch zoom", Math.abs(zoomRatio - 2) < 0.05, `zoom ${beforePinch.zoom} → ${afterPinch.zoom}`);

  // ── Test 3: add a node via toolbar, then drag it ──
  const addButton = Array.from(document.querySelectorAll("button")).find(button => button.textContent === "+ File");
  if (addButton === undefined) {
    throw new Error("+ File button not found");
  }
  addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const card = document.querySelector("[data-nodecard='true']") as HTMLElement;
  if (card === null) {
    throw new Error("node card not found");
  }
  const cardBox = card.getBoundingClientRect();
  const cardStartX = parseFloat(card.style.left);
  const cardStartY = parseFloat(card.style.top);
  const dragX = cardBox.left + cardBox.width / 2;
  const dragY = cardBox.top + cardBox.height / 2;
  fire(card, "pointerdown", dragX, dragY, 1);
  await nextFrame();
  fire(card, "pointermove", dragX + 120, dragY + 80, 1);
  await nextFrame();
  fire(card, "pointerup", dragX + 120, dragY + 80, 1);
  await nextFrame();
  const cardAfterX = parseFloat(card.style.left);
  const cardAfterY = parseFloat(card.style.top);
  const zoomNow = parseTransform().zoom;
  const expectedDX = 120 / zoomNow;
  const expectedDY = 80 / zoomNow;
  pass(
    "node drag",
    Math.abs((cardAfterX - cardStartX) - expectedDX) < 2 && Math.abs((cardAfterY - cardStartY) - expectedDY) < 2,
    `moved (${cardAfterX - cardStartX},${cardAfterY - cardStartY}) expected ≈(${expectedDX},${expectedDY})`,
  );

  // ── Test 4: double-tap opens the edit form ──
  const tapX = cardBox.left + cardBox.width / 2;
  const tapY = cardBox.top + 10;
  for (const round of [0, 1]) {
    fire(card, "pointerdown", tapX, tapY, 1 + round);
    await nextFrame();
    fire(card, "pointerup", tapX, tapY, 1 + round);
    await nextFrame();
  }
  const hasEditInput = card.querySelector("input") !== null;
  pass("double-tap edit", hasEditInput, hasEditInput ? "edit form opened" : "no input in card");

  // ── Test 5: tap on empty canvas deselects ──
  fire(canvas, "pointerdown", 30, 30, 1);
  await nextFrame();
  fire(canvas, "pointerup", 30, 30, 1);
  await nextFrame();
  const stillSelected = (document.querySelector("[data-nodecard='true']") as HTMLElement).style.boxShadow.includes("0 0 0 2px");
  pass("tap deselects", !stillSelected);

  // ── Test 6: edge creation by dragging between ports (touch) ──
  const addFileButton = Array.from(document.querySelectorAll("button")).find(button => button.textContent === "+ File");
  if (addFileButton === undefined) {
    throw new Error("+ File button not found (test 6)");
  }
  addFileButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const nodeCards = (): HTMLElement[] => Array.from(worldLayer().querySelectorAll("[data-nodecard='true']"));
  const [firstCard, secondCard] = [nodeCards()[0], nodeCards()[1]];
  const outPort = firstCard.querySelector("[title='Drag to connect']") as HTMLElement;
  // The input port is the port div positioned on the left (opacity 0.5).
  const inputPort = Array.from(secondCard.querySelectorAll("div")).find(div => div.style.opacity === "0.5") as HTMLElement;
  const outBox = outPort.getBoundingClientRect();
  const inBox = inputPort.getBoundingClientRect();
  fire(outPort, "pointerdown", outBox.left + 5, outBox.top + 5, 1);
  await nextFrame();
  fire(outPort, "pointermove", inBox.left + 5, inBox.top + 5, 1);
  await nextFrame();
  fire(inputPort, "pointerup", inBox.left + 5, inBox.top + 5, 1);
  await nextFrame();
  const countsText = document.querySelector(".va-counts")?.textContent ?? "";
  pass("edge via port drag", countsText.includes("1e"), countsText);

  // ── Test 7: parent a node, then collapse the parent via chevron tap ──
  const addFolderButton = Array.from(document.querySelectorAll("button")).find(button => button.textContent === "+ Folder");
  if (addFolderButton === undefined) {
    throw new Error("+ Folder button not found");
  }
  addFolderButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const folderCard = nodeCards()[nodeCards().length - 1];
  // Double-tap the first card to open its edit form.
  const firstBox = firstCard.getBoundingClientRect();
  for (const round of [0, 1]) {
    fire(firstCard, "pointerdown", firstBox.left + firstBox.width / 2, firstBox.top + 10, 1 + round);
    await nextFrame();
    fire(firstCard, "pointerup", firstBox.left + firstBox.width / 2, firstBox.top + 10, 1 + round);
    await nextFrame();
  }
  const parentSelect = firstCard.querySelectorAll("select")[1] as HTMLSelectElement;
  const folderOption = Array.from(parentSelect.options).find(option => option.textContent === "new_folder/");
  if (folderOption === undefined) {
    throw new Error("folder option not found in parent select");
  }
  parentSelect.value = folderOption.value;
  parentSelect.dispatchEvent(new Event("change", { bubbles: true }));
  await nextFrame();
  const saveButton = Array.from(firstCard.querySelectorAll("button")).find(button => button.textContent === "Save");
  if (saveButton === undefined) {
    throw new Error("Save button not found in edit form");
  }
  saveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  // The folder card should now show a chevron (it has a child).
  const chevron = Array.from(folderCard.querySelectorAll("button")).find(button => button.textContent === "▾");
  if (chevron === undefined) {
    throw new Error("chevron not found on folder card");
  }
  chevron.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const isCollapsed = folderCard.textContent !== null && folderCard.textContent.includes("1 item");
  const childRemoved = !firstCard.isConnected;
  pass("collapse via chevron", isCollapsed && childRemoved, `collapsed=${isCollapsed} childRemoved=${childRemoved}`);

  const pre = document.getElementById("results") as HTMLElement;
  pre.textContent = results.join("\n");
  document.title = results.every(line => line.startsWith("PASS")) ? "ALL PASS" : "FAILURES";
}

void run().catch(error => {
  const pre = document.getElementById("results") as HTMLElement;
  pre.textContent = `ERROR ${error instanceof Error ? error.stack : String(error)}`;
  document.title = "ERROR";
});
