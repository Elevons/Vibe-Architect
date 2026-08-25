/**
 * Plugin system check.
 *
 * Library level: ParsePlugin validation and normalization, ParsePluginArray
 * (bad entries dropped individually), ColorsForType / NodeDefaultsFor
 * resolution, and snapshot round-trips that carry plugins.
 *
 * UI level: imports the shipped blender2babylon-kit plugin through the real
 * Plugins modal, then adds a node via Add ▾ → Custom nodes → <package>, and
 * verifies the card's accent color, type badge, hierarchy row, and the edit
 * form's type options.
 */
import { createRoot } from "react-dom/client";
import { VibeArchitect } from "../src/components/VibeArchitect";
import { ParseGraphSnapshot } from "../src/lib/fileStorage";
import { ColorsForType, NodeDefaultsFor, ParsePlugin, ParsePluginArray } from "../src/lib/plugins";
import type { Plugin } from "../src/lib/types";

const results: string[] = [];
const pass = (name: string, ok: boolean, detail = ""): void => {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail === "" ? "" : ` (${detail})`}`);
};

const nextFrame = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 60));

const SAMPLE_PLUGIN = JSON.stringify({
  name: "test-pkg",
  version: "0.1",
  description: "A test package",
  nodes: [
    { type: "tp:alpha", label: "Alpha", desc: "First node", category: "A", color: "ff0000" },
    { type: "tp:beta", label: "Beta" },
  ],
});

/** All buttons in the document, in DOM order. */
function buttons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll("button"));
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return buttons().find(button => (button.textContent ?? "").includes(text));
}

/** The scaled node layer (last transformed div), scoped for card queries. */
function nodeLayer(): HTMLElement {
  const layers = Array.from(document.querySelectorAll("div")).filter(div => {
    const style = div.getAttribute("style") ?? "";
    return style.includes("translate(") && style.includes("scale(") && style.includes("transform-origin: 0px 0px");
  });
  return layers[layers.length - 1] as HTMLElement;
}

async function run(): Promise<void> {
  // ── Library: ParsePlugin ──
  const parsed = ParsePlugin(SAMPLE_PLUGIN);
  pass("ParsePlugin accepts a valid plugin", parsed !== null && parsed.name === "test-pkg" && parsed.nodes.length === 2);
  const plugin = parsed as Plugin;
  pass("ParsePlugin normalizes color to #hex", plugin.nodes[0].color === "#ff0000", String(plugin.nodes[0].color));
  pass("ParsePlugin keeps version/description", plugin.version === "0.1" && plugin.description === "A test package");
  pass("ParsePlugin omits empty optionals", plugin.nodes[1].desc === undefined && plugin.nodes[1].category === undefined && plugin.nodes[1].color === undefined);

  pass("ParsePlugin rejects invalid JSON", ParsePlugin("{nope") === null);
  pass("ParsePlugin rejects missing name", ParsePlugin(JSON.stringify({ nodes: [{ type: "a", label: "A" }] })) === null);
  pass("ParsePlugin rejects empty nodes", ParsePlugin(JSON.stringify({ name: "x", nodes: [] })) === null);
  pass("ParsePlugin rejects node without label", ParsePlugin(JSON.stringify({ name: "x", nodes: [{ type: "a" }] })) === null);
  pass("ParsePlugin rejects node without type", ParsePlugin(JSON.stringify({ name: "x", nodes: [{ label: "A" }] })) === null);
  pass("ParsePlugin rejects duplicate types", ParsePlugin(JSON.stringify({ name: "x", nodes: [{ type: "a", label: "A" }, { type: "a", label: "B" }] })) === null);
  pass("ParsePlugin rejects bad type id", ParsePlugin(JSON.stringify({ name: "x", nodes: [{ type: "bad type!", label: "A" }] })) === null);
  const badColor = ParsePlugin(JSON.stringify({ name: "x", nodes: [{ type: "a", label: "A", color: "not-a-color" }] }));
  pass("ParsePlugin drops an invalid color", badColor !== null && badColor.nodes[0].color === undefined);

  // ── Library: ParsePluginArray (snapshot plugins) ──
  const array = ParsePluginArray([
    { name: "good", nodes: [{ type: "g:1", label: "G" }] },
    { name: "bad", nodes: "nope" },
    "junk",
  ]);
  pass("ParsePluginArray keeps valid, drops invalid", array.length === 1 && array[0].name === "good", `kept ${array.length}`);

  // ── Library: color + defaults resolution ──
  pass("ColorsForType: built-in file", ColorsForType("file", []).dot === "#818cf8");
  pass("ColorsForType: plugin type uses its color", ColorsForType("tp:alpha", [plugin]).dot === "#ff0000");
  pass("ColorsForType: unknown type falls back to concept", ColorsForType("mystery", []).dot === "#facc15");
  const defaults = NodeDefaultsFor("tp:alpha", [plugin]);
  pass("NodeDefaultsFor uses plugin label/desc", defaults.name === "Alpha" && defaults.desc === "First node", `${defaults.name}`);
  pass("NodeDefaultsFor built-in unchanged", NodeDefaultsFor("file", []).name === "new_file.js");

  // ── Library: snapshot round-trip carries plugins ──
  const snapshotText = JSON.stringify({
    nodes: [{ id: "n1", x: 0, y: 0, name: "Alpha", path: "", desc: "", type: "tp:alpha", parentId: null, visible: true, collapsed: false }],
    edges: [],
    mode: "parallel",
    plugins: [plugin],
  });
  const roundTripped = ParseGraphSnapshot(snapshotText);
  pass("snapshot round-trip keeps plugins", roundTripped !== null && roundTripped.plugins !== undefined && roundTripped.plugins.length === 1 && roundTripped.plugins[0].name === "test-pkg");
  pass("snapshot round-trip keeps custom node type", roundTripped !== null && roundTripped.nodes[0].type === "tp:alpha", roundTripped?.nodes[0].type ?? "null");

  // Built-in types must survive a round-trip untouched (regression: "file"
  // used to fall through to the unknown-custom branch and become "concept").
  const builtInText = JSON.stringify({
    nodes: [
      { id: "f1", x: 0, y: 0, name: "a.ts", path: "", desc: "", type: "file", parentId: null, visible: true, collapsed: false },
      { id: "f2", x: 0, y: 0, name: "d/", path: "", desc: "", type: "folder", parentId: null, visible: true, collapsed: false },
      { id: "f3", x: 0, y: 0, name: "idea", path: "", desc: "", type: "concept", parentId: null, visible: true, collapsed: false },
      { id: "f4", x: 0, y: 0, name: "legacy", path: "", desc: "", parentId: null, visible: true, collapsed: false },
    ],
    edges: [],
    mode: "parallel",
  });
  const builtIn = ParseGraphSnapshot(builtInText);
  const builtInTypes = builtIn !== null ? builtIn.nodes.map(node => node.type).join(",") : "null";
  pass("built-in types survive round-trip", builtInTypes === "file,folder,concept,file", builtInTypes);

  // An object's attached components (componentIds) and its teal attachment
  // edge must survive a save/load round-trip.
  const objectText = JSON.stringify({
    nodes: [
      { id: "o1", x: 0, y: 0, name: "player", path: "", desc: "", type: "object", parentId: null, visible: true, collapsed: false, componentIds: ["c1", "c2"] },
      { id: "c1", x: 0, y: 0, name: "mesh", path: "", desc: "", type: "file", parentId: null, visible: true, collapsed: false },
      { id: "c2", x: 0, y: 0, name: "script", path: "", desc: "", type: "file", parentId: null, visible: true, collapsed: false },
    ],
    edges: [{ id: "e1", from: "o1", to: "c1", label: "" }, { id: "e2", from: "o1", to: "c2", label: "" }],
    mode: "parallel",
  });
  const roundTrippedObject = ParseGraphSnapshot(objectText);
  const obj = roundTrippedObject?.nodes.find(node => node.id === "o1");
  const attachmentEdges = roundTrippedObject?.edges.filter(edge => edge.from === "o1").length ?? 0;
  pass(
    "object keeps attached components and edges across round-trip",
    obj !== undefined
      && Array.isArray(obj.componentIds)
      && obj.componentIds.length === 2
      && obj.componentIds.includes("c1")
      && obj.componentIds.includes("c2")
      && attachmentEdges === 2,
    `componentIds=${obj === undefined ? "n/a" : JSON.stringify(obj.componentIds)} attachmentEdges=${attachmentEdges}`,
  );

  // A custom type whose plugin is absent falls back to concept, not file.
  const noPluginText = JSON.stringify({
    nodes: [{ id: "n2", x: 0, y: 0, name: "Ghost", path: "", desc: "", type: "b2b:export", parentId: null, visible: true, collapsed: false }],
    edges: [],
    mode: "parallel",
  });
  const noPlugin = ParseGraphSnapshot(noPluginText);
  pass("custom type without its plugin falls back to concept", noPlugin !== null && noPlugin.nodes[0].type === "concept", noPlugin?.nodes[0].type ?? "null");

  // ── UI: import the shipped b2bkit plugin through the Plugins modal ──
  createRoot(document.getElementById("root") as HTMLElement).render(<VibeArchitect />);
  await nextFrame();

  // Open the Plugins ▾ dropdown and trigger import from its top button.
  const pluginsMenuButton = buttonWithText("Plugins ▾");
  pass("toolbar has the Plugins dropdown", pluginsMenuButton !== undefined);
  pluginsMenuButton?.click();
  await nextFrame();
  const importTrigger = buttonWithText("Import plugin…");
  pass("Plugins dropdown has an Import button", importTrigger !== undefined);
  importTrigger?.click();
  await nextFrame();

  const importButton = buttonWithText("Import plugin file…");
  pass("Plugins modal offers import", importButton !== undefined);
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  pass("Plugins modal has a file input", fileInput !== null);

  const response = await fetch("/examples/blender2babylon-kit.json");
  const kitText = await response.text();
  const kitFile = new File([kitText], "blender2babylon-kit.json", { type: "application/json" });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(kitFile);
  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  await nextFrame();

  const importStatus = Array.from(document.querySelectorAll("span")).find(span => (span.textContent ?? "").startsWith("Imported"));
  pass("plugin import reports success", importStatus !== undefined, importStatus?.textContent ?? "no status");

  const kitRow = Array.from(document.querySelectorAll("span")).find(span => (span.textContent ?? "").includes("📦 blender2babylon-kit"));
  pass("modal lists the imported package", kitRow !== undefined);

  // Close the modal (its ✕ button).
  const modal = document.querySelector(".va-modal-panel") as HTMLElement | null;
  const closeButtons = modal !== null ? Array.from(modal.querySelectorAll("button")) : [];
  closeButtons.find(button => button.textContent === "✕")?.click();
  await nextFrame();

  // ── UI: Plugins ▾ → blender2babylon-kit → Export ──
  const dropdownButton = buttonWithText("Plugins ▾");
  pass("toolbar has the Plugins dropdown", dropdownButton !== undefined);
  dropdownButton?.click();
  await nextFrame();

  const menu = Array.from(document.querySelectorAll("div")).find(div => {
    const style = div.getAttribute("style") ?? "";
    return style.includes("position: fixed") && style.includes("z-index: 1100");
  });
  pass("Plugins dropdown opens", menu !== undefined);

  const packageButton = menu !== undefined ? Array.from(menu.querySelectorAll("button")).find(button => (button.textContent ?? "").includes("blender2babylon-kit")) : undefined;
  pass("dropdown lists the package", packageButton !== undefined);
  packageButton?.click();
  await nextFrame();

  const exportButton = menu !== undefined ? Array.from(menu.querySelectorAll("button")).find(button => (button.textContent ?? "").trim() === "Export") : undefined;
  pass("expanded package lists its nodes", exportButton !== undefined);
  exportButton?.click();
  await nextFrame();

  // ── UI: the created card ──
  const cards = Array.from(nodeLayer().querySelectorAll("[data-nodecard='true']"));
  pass("a card was added", cards.length === 1, `cards=${cards.length}`);
  const card = cards[0] as HTMLElement | undefined;
  const typeBadge = card !== undefined ? Array.from(card.querySelectorAll("span")).find(span => (span.textContent ?? "").trim() === "b2b:export") : undefined;
  pass("card shows the custom type badge", typeBadge !== undefined);
  const cardName = card !== undefined ? Array.from(card.querySelectorAll("span")).find(span => (span.textContent ?? "").trim() === "Export") : undefined;
  pass("card is named from the plugin label", cardName !== undefined);
  // The type badge is colored with the plugin's accent (the border is white
  // while the card is selected, so the badge is the stable color check).
  const badgeColor = typeBadge !== undefined ? (typeBadge as HTMLElement).style.color : "";
  pass("card uses the plugin accent color", badgeColor === "rgb(34, 211, 238)", badgeColor);

  // ── UI: hierarchy row for the custom node ──
  const hierarchyRow = Array.from(document.querySelectorAll(".va-hierarchy-scroll *")).find(element => (element.textContent ?? "").trim() === "Export");
  pass("hierarchy lists the custom node", hierarchyRow !== undefined);

  // ── UI: edit form offers the custom type ──
  // The dblclick handler sits on the display wrapper (the card's only
  // non-absolute child div), not on the card root.
  const displayDiv = card !== undefined
    ? Array.from(card.children).find(element => element.tagName === "DIV" && !(element.getAttribute("style") ?? "").includes("position: absolute")) as HTMLElement | undefined
    : undefined;
  pass("card has a display wrapper", displayDiv !== undefined);
  displayDiv?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  await nextFrame();
  const typeSelect = document.querySelector('select');
  const options = typeSelect !== null ? Array.from(typeSelect.querySelectorAll("option")).map(option => option.value) : [];
  pass("edit form offers the custom type", options.includes("b2b:export"), options.join(","));
  pass("edit form still offers built-ins", options.includes("file") && options.includes("folder") && options.includes("concept"));

  const pre = document.getElementById("results") as HTMLElement;
  pre.textContent = results.join("\n");
  document.title = results.every(line => line.startsWith("PASS")) ? "ALL PASS" : "FAILURES";
}

void run().catch(error => {
  const pre = document.getElementById("results") as HTMLElement;
  pre.textContent = `ERROR ${error instanceof Error ? error.stack : String(error)}`;
  document.title = "ERROR";
});
