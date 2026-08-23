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

/** Add a node through the Add ▾ toolbar dropdown (built-in row). */
async function addViaMenu(label: string): Promise<void> {
  const addButton = Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Add ▾");
  if (addButton === undefined) {
    throw new Error("Add ▾ button not found");
  }
  addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const menu = Array.from(document.querySelectorAll("div")).find(div => {
    const style = div.getAttribute("style") ?? "";
    return style.includes("position: fixed") && style.includes("z-index: 1100");
  });
  if (menu === undefined) {
    throw new Error("Add menu did not open");
  }
  const item = Array.from(menu.querySelectorAll("button")).find(button => (button.textContent ?? "").trim() === label);
  if (item === undefined) {
    throw new Error(`menu item "${label}" not found`);
  }
  item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
}

/**
 * Group `child` under `folder` by dragging the folder's grouping output port
 * ([title='Drag to group'], bottom edge) onto the child's input port (top
 * edge, opacity 0.5). This is the documented "Drag to group" interaction and
 * targets the source folder directly, so it is unambiguous.
 */
async function groupPortDrag(folder: HTMLElement, child: HTMLElement): Promise<void> {
  const outPort = folder.querySelector("[title='Drag to group']") as HTMLElement;
  const inPort = Array.from(child.querySelectorAll("div")).find(div => div.style.opacity === "0.5") as HTMLElement;
  if (outPort === null || inPort === undefined) {
    throw new Error("ports not found for grouping drag (test 16)");
  }
  const ob = outPort.getBoundingClientRect();
  const ib = inPort.getBoundingClientRect();
  fire(outPort, "pointerdown", ob.left + 5, ob.top + 5, 1);
  await nextFrame();
  fire(outPort, "pointermove", ib.left + 5, ib.top + 5, 1);
  await nextFrame();
  fire(inPort, "pointerup", ib.left + 5, ib.top + 5, 1);
  await nextFrame();
}

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

  // ── Test 3: add a node via the Add ▾ dropdown, then drag it ──
  await addViaMenu("File");
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

  // ── Test 6: grouping edge by dragging a folder's port onto a file (touch) ──
  // Files have no output port; only folders emit noodles.
  await addViaMenu("File");
  await addViaMenu("Folder");
  const nodeCards = (): HTMLElement[] => Array.from(worldLayer().querySelectorAll("[data-nodecard='true']"));
  const [firstCard, secondCard] = [nodeCards()[0], nodeCards()[1]];
  const folderCard6 = nodeCards()[nodeCards().length - 1];
  const outPort = folderCard6.querySelector("[title='Drag to group']") as HTMLElement;
  // The input port is the port div with opacity 0.5 (top edge, centered).
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
  pass("folder edge via port drag", countsText.includes("1e"), countsText);

  // Restore the pre-test-6 state (file1 + loose file2, no folders) so the
  // later tests see the same world: unparent file2, then delete the folder.
  const secondBox = secondCard.getBoundingClientRect();
  for (const round of [0, 1]) {
    fire(secondCard, "pointerdown", secondBox.left + secondBox.width / 2, secondBox.top + 10, 1 + round);
    await nextFrame();
    fire(secondCard, "pointerup", secondBox.left + secondBox.width / 2, secondBox.top + 10, 1 + round);
    await nextFrame();
  }
  const unparentSelect = secondCard.querySelectorAll("select")[1] as HTMLSelectElement;
  unparentSelect.value = "";
  unparentSelect.dispatchEvent(new Event("change", { bubbles: true }));
  await nextFrame();
  const cancelButton = Array.from(secondCard.querySelectorAll("button")).find(button => button.textContent === "Cancel");
  if (cancelButton === undefined) {
    throw new Error("Cancel button not found in edit form (test 6)");
  }
  cancelButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const folderBox6 = folderCard6.getBoundingClientRect();
  fire(folderCard6, "pointerdown", folderBox6.left + folderBox6.width / 2, folderBox6.top + folderBox6.height / 2, 1);
  await nextFrame();
  fire(folderCard6, "pointerup", folderBox6.left + folderBox6.width / 2, folderBox6.top + folderBox6.height / 2, 1);
  await nextFrame();
  const deleteButton = Array.from(folderCard6.querySelectorAll("button")).find(button => button.textContent === "✕");
  if (deleteButton === undefined) {
    throw new Error("delete button not found on selected folder (test 6)");
  }
  deleteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
  const restoredCounts = document.querySelector(".va-counts")?.textContent ?? "";
  pass("test 6 cleanup restores state", restoredCounts.includes("2n") && restoredCounts.includes("0e"), restoredCounts);

  // ── Test 7: parent a node, then collapse the parent via chevron tap ──
  await addViaMenu("Folder");
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
  // Several folders may share the default name; the one just added is last.
  const folderOptions = Array.from(parentSelect.options).filter(option => option.textContent === "new_folder/");
  const folderOption = folderOptions[folderOptions.length - 1];
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

  // Expand the collapsed folder card so its ports are back. Identify it by
  // its Expand button — several cards may contain "new_folder/" (child
  // cards show it as a parent indicator).
  const collapsedFolderCard = nodeCards().find(card =>
    Array.from(card.querySelectorAll("button")).some(button => button.textContent === "Expand ▾"),
  );
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
  const folderOutPort = folderCardNow.querySelector("[title='Drag to group']") as HTMLElement;
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
  // folder branch (2 visible rows → 1), and the grouping edge is counted.
  const countsAfter = document.querySelector(".va-counts")?.textContent ?? "";
  const rowsAfter = rows().length;
  pass("folder edge groups node", countsAfter.includes("1e") && rowsAfter === 1, `counts=${countsAfter} rows=${rowsAfter} (was 2)`);

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

  // ── Test 14: edge endpoints land exactly on the measured ports ──
  // file2's card is expanded with the edit form open (taller than the
  // default), so the ports sit lower than the fixed-height math would put
  // them. The measured size reaches the edges via a layout effect → state →
  // re-render; poll until it settles (a frame or two in the worst case).
  const transform14 = parseTransform();
  const canvasBox = canvas.getBoundingClientRect();
  const toWorld = (screenX: number, screenY: number): { x: number; y: number } => ({
    x: (screenX - canvasBox.left - transform14.x) / transform14.zoom,
    y: (screenY - canvasBox.top - transform14.y) / transform14.zoom,
  });
  // 5px tolerance: the anchor sits on the card's border-box edge while the
  // 18px port dot is centred a few px inside (border inset), so the noodle
  // start is always inside the dot. Still far tighter than the old fixed-
  // height bug, which was off by tens of px on expanded cards.
  const TOLERANCE_PX = 5;
  const measureAnchored = (): { anchored: number; total: number } => {
    // Folders emit (output port, bottom edge); every node receives
    // (input port, top edge). Collect the two port kinds separately.
    const outCenters: { x: number; y: number }[] = [];
    const inCenters: { x: number; y: number }[] = [];
    for (const card of nodeCards()) {
      const outPort = card.querySelector("[title='Drag to group']") as HTMLElement | null;
      const inPort = Array.from(card.querySelectorAll("div")).find(div => div.style.opacity === "0.5") as HTMLElement | undefined;
      if (outPort !== null) {
        const outBox = outPort.getBoundingClientRect();
        outCenters.push(toWorld(outBox.left + outBox.width / 2, outBox.top + outBox.height / 2));
      }
      if (inPort !== undefined) {
        const inBox = inPort.getBoundingClientRect();
        inCenters.push(toWorld(inBox.left + inBox.width / 2, inBox.top + inBox.height / 2));
      }
    }
    const edgePaths = Array.from(document.querySelectorAll("svg path")).filter(path => path.getAttribute("stroke") === "#333");
    let anchored = 0;
    for (const path of edgePaths) {
      const match = (path.getAttribute("d") ?? "").match(/^M([\d.-]+),([\d.-]+) C[\d.-]+,[\d.-]+ [\d.-]+,[\d.-]+ ([\d.-]+),([\d.-]+)$/);
      if (match === null) {
        continue;
      }
      const start = { x: Number(match[1]), y: Number(match[2]) };
      const end = { x: Number(match[3]), y: Number(match[4]) };
      const startsOnPort = outCenters.some(port => Math.hypot(port.x - start.x, port.y - start.y) < TOLERANCE_PX);
      const endsOnPort = inCenters.some(port => Math.hypot(port.x - end.x, port.y - end.y) < TOLERANCE_PX);
      if (startsOnPort && endsOnPort) {
        anchored += 1;
      }
    }
    return { anchored, total: edgePaths.length };
  };
  let measurement = measureAnchored();
  for (let attempt = 0; attempt < 25 && (measurement.anchored < measurement.total || measurement.total === 0); attempt++) {
    await nextFrame();
    measurement = measureAnchored();
  }
  pass("edges anchor to measured ports", measurement.total === 1 && measurement.anchored === 1, `anchored ${measurement.anchored}/${measurement.total}`);

  // ── Test 15: pinch stays anchored when the first finger has already panned ──
  // Regression: a fast pinch used to read a stale pan/zoom closure, so the
  // view jumped when the second finger landed mid-pan. We verify two things:
  //   (a) sub-deadzone first-finger drift does not move the view, and
  //   (b) the world point under the midpoint at pinch start stays under the
  //       (moving) midpoint throughout the pinch — i.e. no jump.
  // The app converts screen→world using the canvasRef div (the one with
  // onPointerDown), which is the data-pan div's parent. Use the same element
  // so the test's world math matches the app's exactly.
  const refDiv15 = canvas.parentElement as HTMLElement;
  const box15 = refDiv15.getBoundingClientRect();
  const toWorld15 = (screenX: number, screenY: number, pan: { x: number; y: number }, zoom: number): { x: number; y: number } => ({
    x: (screenX - box15.left - pan.x) / zoom,
    y: (screenY - box15.top - pan.y) / zoom,
  });

  // (a) Deadzone: first finger drifts 3px (< 6px deadzone) → no pan.
  const panBeforeDrift = parseTransform();
  fire(canvas, "pointerdown", 150, 400, 1);
  await nextFrame();
  fire(canvas, "pointermove", 153, 402, 1);
  await nextFrame();
  const panAfterDrift = parseTransform();
  const driftHeld = Math.abs(panAfterDrift.x - panBeforeDrift.x) < 0.5 && Math.abs(panAfterDrift.y - panBeforeDrift.y) < 0.5;

  // (b) Reproduce the fast-pinch race: push past the deadzone (a real pan
  // commits) and land the second finger in the *same frame* — no await
  // between, so the second pointerdown's closure still holds the pre-pan
  // pan/zoom. The app must read live values or the pinch anchor jumps.
  // The committed pan is panBeforeDrift + (175-150, 415-400); the pinch's
  // midpoint is ((175+255)/2, (415+405)/2) in client coords.
  fire(canvas, "pointermove", 175, 415, 1);
  fire(canvas, "pointerdown", 255, 405, 2);
  await nextFrame();
  const pannedPan = { x: panBeforeDrift.x + 25, y: panBeforeDrift.y + 15 };
  const worldMid15 = toWorld15((175 + 255) / 2, (415 + 405) / 2, pannedPan, panBeforeDrift.zoom);

  // Spread the fingers; the anchor must stay pinned to worldMid15.
  const spreadSteps: [number, number, number, number][] = [
    [150, 415, 280, 405],
    [120, 425, 310, 395],
    [90, 435, 340, 385],
  ];
  let maxAnchorError = 0;
  for (const [x1, y1, x2, y2] of spreadSteps) {
    fire(canvas, "pointermove", x1, y1, 1);
    await nextFrame();
    fire(canvas, "pointermove", x2, y2, 2);
    await nextFrame();
    const current = parseTransform();
    const curMidX = (x1 + x2) / 2;
    const curMidY = (y1 + y2) / 2;
    const underMid = toWorld15(curMidX, curMidY, current, current.zoom);
    maxAnchorError = Math.max(maxAnchorError, Math.hypot(underMid.x - worldMid15.x, underMid.y - worldMid15.y));
  }
  fire(canvas, "pointerup", 340, 385, 2);
  await nextFrame();
  fire(canvas, "pointerup", 90, 435, 1);
  await nextFrame();
  const zoomAfterPinch15 = parseTransform().zoom;
  const zoomedIn = zoomAfterPinch15 > panBeforeDrift.zoom * 1.2;
  pass(
    "pinch stays anchored after first-finger pan",
    driftHeld && maxAnchorError < 2 && zoomedIn,
    `driftHeld=${driftHeld} anchorError=${maxAnchorError.toFixed(2)}px zoomedIn=${zoomedIn}`,
  );

  // ── Test 16: dragging a folder's header bar moves the whole subtree ──
  // Build a fresh folder with two children, then drag the folder's header
  // and verify every member moves by the same world delta (the group keeps
  // its internal layout).
  await addViaMenu("Folder");
  await addViaMenu("File");
  await addViaMenu("File");

  // Folders emit a grouping output port ([title='Drag to group']) on the
  // bottom edge; files only have the input port (opacity 0.5). New nodes
  // append last in the DOM, so the newest folder is the last card that has
  // an output port, and the two newest files are the last two without one.
  // Identifying by port presence (not by default name) stays unambiguous even
  // when earlier tests left identically-named folders behind.
  const cards16 = nodeCards();
  const folderCard16 = cards16.find(card => card.querySelector("[title='Drag to group']") !== null);
  const fileCards16 = cards16.filter(card => card.querySelector("[title='Drag to group']") === null).slice(-2);
  if (folderCard16 === undefined || fileCards16.length < 2) {
    throw new Error(`expected a folder and two files (test 16), got ${nodeCards().length} cards`);
  }

  // Group both files under the folder by dragging the folder's output port
  // onto each file's input port (the documented "Drag to group" interaction).
  await groupPortDrag(folderCard16, fileCards16[0]);
  await groupPortDrag(folderCard16, fileCards16[1]);

  // The folder must now be a real parent (it shows a collapse/expand chevron).
  const collapseBtn = folderCard16.querySelector("button[title*='children']");
  if (collapseBtn === null) {
    throw new Error(`folder has no children after grouping drags (test 16)`);
  }

  // World position of a card's top-left corner (cards are positioned by
  // left/top in the scaled world layer; React renders numbers as "NNpx").
  const transform16 = parseTransform();
  const cardWorld = (card: HTMLElement): { x: number; y: number } => ({
    x: parseFloat(card.style.left),
    y: parseFloat(card.style.top),
  });
  const before16 = {
    folder: cardWorld(folderCard16),
    file1: cardWorld(fileCards16[0]),
    file2: cardWorld(fileCards16[1]),
  };

  // Drag the folder's header bar: the name span's parent is the header div,
  // which carries the group-drag pointer handler. Move it by a screen delta.
  const nameSpan16 = folderCard16.querySelector("span");
  const header16 = nameSpan16?.parentElement as HTMLElement;
  if (header16 === null) {
    throw new Error("folder header not found (test 16)");
  }
  const box16 = header16.getBoundingClientRect();
  const startX = box16.left + box16.width / 2;
  const startY = box16.top + box16.height / 2;
  const DRAG_SCREEN = { x: 80, y: 60 };
  fire(header16, "pointerdown", startX, startY, 1);
  await nextFrame();
  fire(header16, "pointermove", startX + DRAG_SCREEN.x, startY + DRAG_SCREEN.y, 1);
  await nextFrame();
  fire(header16, "pointerup", startX + DRAG_SCREEN.x, startY + DRAG_SCREEN.y, 1);
  await nextFrame();

  // The screen delta maps to a world delta divided by the current zoom.
  const zoom16 = transform16.zoom;
  const expectedDelta = { x: DRAG_SCREEN.x / zoom16, y: DRAG_SCREEN.y / zoom16 };
  const after16 = {
    folder: cardWorld(folderCard16),
    file1: cardWorld(fileCards16[0]),
    file2: cardWorld(fileCards16[1]),
  };
  const deltaOf = (before: { x: number; y: number }, after: { x: number; y: number }): { x: number; y: number } => ({
    x: after.x - before.x,
    y: after.y - before.y,
  });
  const deltas = {
    folder: deltaOf(before16.folder, after16.folder),
    file1: deltaOf(before16.file1, after16.file1),
    file2: deltaOf(before16.file2, after16.file2),
  };
  const closeTo = (actual: { x: number; y: number }): boolean =>
    Math.abs(actual.x - expectedDelta.x) < 1 && Math.abs(actual.y - expectedDelta.y) < 1;
  const groupMovedTogether = closeTo(deltas.folder) && closeTo(deltas.file1) && closeTo(deltas.file2);
  pass(
    "folder header drag moves the whole subtree",
    groupMovedTogether,
    `folder=(+${deltas.folder.x.toFixed(1)},+${deltas.folder.y.toFixed(1)}) file1=(+${deltas.file1.x.toFixed(1)},+${deltas.file1.y.toFixed(1)}) file2=(+${deltas.file2.x.toFixed(1)},+${deltas.file2.y.toFixed(1)}) expected≈(+${expectedDelta.x.toFixed(1)},+${expectedDelta.y.toFixed(1)})`,
  );

  // ── Test 17: dragging the grouping-box handle moves the whole subtree ──
  // The dashed background box that wraps a folder + its children now carries a
  // grip handle (⠿) at its top-left corner. Grabbing that handle must move the
  // folder and every child by the same world delta, just like the header drag.
  const handle17 = document.querySelector("[title='Drag to move the whole group']") as HTMLElement | null;
  if (handle17 === null) {
    throw new Error("grouping-box handle not found (test 17)");
  }
  const cards17 = nodeCards();
  const folderCard17 = cards17.find(card => card.querySelector("[title='Drag to group']") !== null);
  const fileCards17 = cards17.filter(card => card.querySelector("[title='Drag to group']") === null).slice(-2);
  if (folderCard17 === undefined || fileCards17.length < 2) {
    throw new Error(`expected folder + 2 children (test 17), got ${cards17.length} cards`);
  }
  const cardWorld17 = (card: HTMLElement): { x: number; y: number } => ({
    x: parseFloat(card.style.left),
    y: parseFloat(card.style.top),
  });
  const hBefore = {
    folder: cardWorld17(folderCard17),
    file1: cardWorld17(fileCards17[0]),
    file2: cardWorld17(fileCards17[1]),
  };
  const handleRect17 = handle17.getBoundingClientRect();
  const hStartX = handleRect17.left + handleRect17.width / 2;
  const hStartY = handleRect17.top + handleRect17.height / 2;
  const hDragScreen = { x: 70, y: 50 };
  fire(handle17, "pointerdown", hStartX, hStartY, 1);
  await nextFrame();
  fire(handle17, "pointermove", hStartX + hDragScreen.x, hStartY + hDragScreen.y, 1);
  await nextFrame();
  fire(handle17, "pointerup", hStartX + hDragScreen.x, hStartY + hDragScreen.y, 1);
  await nextFrame();
  const hAfter = {
    folder: cardWorld17(folderCard17),
    file1: cardWorld17(fileCards17[0]),
    file2: cardWorld17(fileCards17[1]),
  };
  const deltaOf17 = (b: { x: number; y: number }, a: { x: number; y: number }): { x: number; y: number } => ({ x: a.x - b.x, y: a.y - b.y });
  const deltas17 = {
    folder: deltaOf17(hBefore.folder, hAfter.folder),
    file1: deltaOf17(hBefore.file1, hAfter.file1),
    file2: deltaOf17(hBefore.file2, hAfter.file2),
  };
  const zoom17 = parseTransform().zoom;
  const expectedDelta17 = { x: hDragScreen.x / zoom17, y: hDragScreen.y / zoom17 };
  const closeTo17 = (actual: { x: number; y: number }): boolean =>
    Math.abs(actual.x - expectedDelta17.x) < 1 && Math.abs(actual.y - expectedDelta17.y) < 1;
  const handleMovedTogether = closeTo17(deltas17.folder) && closeTo17(deltas17.file1) && closeTo17(deltas17.file2);
  pass(
    "grouping-box handle moves the whole subtree",
    handleMovedTogether,
    `folder=(+${deltas17.folder.x.toFixed(1)},+${deltas17.folder.y.toFixed(1)}) file1=(+${deltas17.file1.x.toFixed(1)},+${deltas17.file1.y.toFixed(1)}) file2=(+${deltas17.file2.x.toFixed(1)},+${deltas17.file2.y.toFixed(1)}) expected≈(+${expectedDelta17.x.toFixed(1)},+${expectedDelta17.y.toFixed(1)})`,
  );

  const pre = document.getElementById("results") as HTMLElement;
  pre.textContent = results.join("\n");
  document.title = results.every(line => line.startsWith("PASS")) ? "ALL PASS" : "FAILURES";
}

void run().catch(error => {
  const pre = document.getElementById("results") as HTMLElement;
  pre.textContent = `ERROR ${error instanceof Error ? error.stack : String(error)}`;
  document.title = "ERROR";
});
