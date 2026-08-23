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
  const stillSelected = (document.querySelector("[data-nodecard='true']") as HTMLElement).style.boxShadow.includes("0px 0px 0px 2px");
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

  // ── Test 8: hierarchy panel — row click selects + centers the node ──
  const panel = document.querySelector(".va-hierarchy");
  if (panel === null) {
    throw new Error("hierarchy panel not found");
  }
  const scrollArea = panel.querySelector(".va-hierarchy-scroll") as HTMLElement;
  const rows = (): HTMLElement[] => Array.from(scrollArea.children, child => child as HTMLElement);
  // Row order: roots first (file2, folder), then the folder's child (file1).
  const targetRow = rows()[0];
  const transformBefore = worldLayer().style.transform;
  targetRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const transformAfter = worldLayer().style.transform;
  const [selectedCard] = nodeCards();
  const ringApplied = selectedCard.style.boxShadow.includes("0px 0px 0px 2px");
  pass("hierarchy row focus", transformBefore !== transformAfter && ringApplied, `panned=${transformBefore !== transformAfter} ring=${ringApplied}`);

  // ── Test 9: hierarchy eye hides the node from the canvas ──
  const eyeButton = Array.from(rows()[0].querySelectorAll("button")).find(button => button.textContent === "👁");
  if (eyeButton === undefined) {
    throw new Error("eye button not found in hierarchy row");
  }
  eyeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const hiddenCardGone = !selectedCard.isConnected;
  const rowDimmed = parseFloat((rows()[0] as HTMLElement).style.opacity) < 1;
  pass("hierarchy eye hides node", hiddenCardGone && rowDimmed, `gone=${hiddenCardGone} dimmed=${rowDimmed}`);

  // ── Test 10: hierarchy fold tucks the branch's rows away ──
  const folderRow = rows().find(row => row.textContent?.includes("new_folder/"));
  if (folderRow === undefined) {
    throw new Error("folder row not found");
  }
  const foldButton = Array.from(folderRow.querySelectorAll("button")).find(button => button.textContent === "▾");
  if (foldButton === undefined) {
    throw new Error("fold chevron not found on folder row");
  }
  const childRowsBefore = rows().filter(row => row.textContent?.includes("new_file.js")).length;
  foldButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const childRowsAfter = rows().filter(row => row.textContent?.includes("new_file.js")).length;
  pass("hierarchy fold", childRowsAfter === childRowsBefore - 1, `rows ${childRowsBefore} → ${childRowsAfter}`);

  // ── Test 11: an edge into a folder groups the other node under it ──
  // Re-show file2 via the hierarchy eye (hidden in test 9).
  const unhideButton = Array.from(rows()[0].querySelectorAll("button")).find(button => button.textContent === "–");
  if (unhideButton === undefined) {
    throw new Error("unhide button not found (test 11)");
  }
  unhideButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();

  // Expand the collapsed folder card so its ports are back.
  const collapsedFolderCard = nodeCards().find(card => card.textContent?.includes("new_folder/"));
  if (collapsedFolderCard === undefined) {
    throw new Error("collapsed folder card not found (test 11)");
  }
  const expandButton = Array.from(collapsedFolderCard.querySelectorAll("button")).find(button => button.textContent === "Expand ▾");
  if (expandButton === undefined) {
    throw new Error("expand button not found on collapsed folder (test 11)");
  }
  expandButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();

  // Drag the folder's output port onto file2's input port.
  // file2's card was re-created when it came back (test 9 unmounted it),
  // so re-find it live: it is the selected card (ring from test 8).
  // Match the folder by its name span — a child's card also contains
  // "new_folder/" as its parent indicator (⤷ new_folder/).
  const freshCards = nodeCards();
  const cardName = (card: HTMLElement): string => card.querySelector("span")?.textContent ?? "";
  const folderCardNow = freshCards.find(card => cardName(card) === "new_folder/");
  const file2CardNow = freshCards.find(card => card.style.boxShadow.includes("0px 0px 0px 2px"));
  if (folderCardNow === undefined || file2CardNow === undefined) {
    throw new Error("cards not found after expand (test 11)");
  }
  const folderOutPort = folderCardNow.querySelector("[title='Drag to connect']") as HTMLElement;
  const file2InPort = Array.from(file2CardNow.querySelectorAll("div")).find(div => div.style.opacity === "0.5") as HTMLElement;
  if (folderOutPort === null || file2InPort === undefined) {
    throw new Error("ports not found for folder grouping drag (test 11)");
  }
  const outBox2 = folderOutPort.getBoundingClientRect();
  const inBox2 = file2InPort.getBoundingClientRect();
  fire(folderOutPort, "pointerdown", outBox2.left + 5, outBox2.top + 5, 1);
  await nextFrame();
  fire(folderOutPort, "pointermove", inBox2.left + 5, inBox2.top + 5, 1);
  await nextFrame();
  fire(file2InPort, "pointerup", inBox2.left + 5, inBox2.top + 5, 1);
  await nextFrame();

  // file2 is now a child of the folder: its row moved under the still-folded
  // folder branch (2 visible rows → 1), and the new edge is counted.
  const countsAfter = document.querySelector(".va-counts")?.textContent ?? "";
  const rowsAfter = rows().length;
  pass("folder edge groups node", countsAfter.includes("2e") && rowsAfter === 1, `counts=${countsAfter} rows=${rowsAfter} (was 2)`);

  // ── Test 12: hiding a parent hides its whole subtree ──
  const cardsBefore = nodeCards().length;
  const folderRow12 = rows().find(row => row.textContent?.includes("new_folder/"));
  if (folderRow12 === undefined) {
    throw new Error("folder row not found (test 12)");
  }
  const folderEye = Array.from(folderRow12.querySelectorAll("button")).find(button => button.textContent === "👁");
  if (folderEye === undefined) {
    throw new Error("eye not found on folder row (test 12)");
  }
  folderEye.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const cardsAfterHide = nodeCards().length;
  const folderRowAfter = rows().find(row => row.textContent?.includes("new_folder/"));
  if (folderRowAfter === undefined) {
    throw new Error("folder row vanished after hide (test 12)");
  }
  const rowDimmed12 = parseFloat(folderRowAfter.style.opacity) < 1;
  pass("hiding parent hides subtree", cardsBefore === 3 && cardsAfterHide === 0 && rowDimmed12, `cards ${cardsBefore} → ${cardsAfterHide} dimmed=${rowDimmed12}`);

  // Showing the parent again brings the subtree back.
  const folderEyeBack = Array.from(folderRowAfter.querySelectorAll("button")).find(button => button.textContent === "–");
  if (folderEyeBack === undefined) {
    throw new Error("unhide eye not found on folder row (test 12)");
  }
  folderEyeBack.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const cardsAfterShow = nodeCards().length;
  pass("showing parent restores subtree", cardsAfterShow === cardsBefore, `cards ${cardsAfterShow} (was ${cardsBefore})`);

  // ── Test 13: pressing a card button must not fall through to the canvas ──
  // (a leaked pointerdown would start a pan and clear the selection)
  const panBefore = worldLayer().style.transform;
  const selectedCard13 = nodeCards().find(card => card.style.boxShadow.includes("0px 0px 0px 2px"));
  if (selectedCard13 === undefined) {
    throw new Error("no selected card (test 13)");
  }
  const editButton = Array.from(selectedCard13.querySelectorAll("button")).find(button => button.textContent === "Edit");
  if (editButton === undefined) {
    throw new Error("Edit button not found (test 13)");
  }
  const editBox = editButton.getBoundingClientRect();
  fire(editButton, "pointerdown", editBox.left + 5, editBox.top + 5, 1);
  await nextFrame();
  fire(editButton, "pointerup", editBox.left + 5, editBox.top + 5, 1);
  await nextFrame();
  editButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const editFormOpen = selectedCard13.querySelector("textarea") !== null;
  const stillSelected13 = selectedCard13.style.boxShadow.includes("0px 0px 0px 2px");
  const panUnchanged = worldLayer().style.transform === panBefore;
  pass("card button press stays on the card", editFormOpen && stillSelected13 && panUnchanged, `form=${editFormOpen} selected=${stillSelected13} pan=${panUnchanged}`);

  const pre = document.getElementById("results") as HTMLElement;
  pre.textContent = results.join("\n");
  document.title = results.every(line => line.startsWith("PASS")) ? "ALL PASS" : "FAILURES";
}

void run().catch(error => {
  const pre = document.getElementById("results") as HTMLElement;
  pre.textContent = `ERROR ${error instanceof Error ? error.stack : String(error)}`;
  document.title = "ERROR";
});
