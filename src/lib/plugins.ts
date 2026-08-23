import { TYPE_COLORS } from "./constants";
import type { BuiltInNodeType } from "./constants";
import type { NodeType, Plugin, PluginNodeDef, TypeColors } from "./types";

/**
 * Plugin system: a plugin is a JSON "node package" — a named bundle of
 * custom node definitions. Importing one makes its nodes available in the
 * toolbar under Add ▾ → Custom nodes → <package name>. Saved graphs embed
 * the plugins they use, so a graph stays portable on its own.
 */

/** Shape of one raw node definition while validating plugin JSON. */
interface RawPluginNode {
  type?: unknown;
  label?: unknown;
  desc?: unknown;
  category?: unknown;
  color?: unknown;
}

/** Shape of the top-level plugin JSON while validating. */
interface RawPlugin {
  name?: unknown;
  version?: unknown;
  description?: unknown;
  nodes?: unknown;
}

/** Node type ids must be short and safe to use in attributes and file names. */
const TYPE_ID_PATTERN = /^[\w.:-]{1,64}$/;

/** Hex colors with or without a leading #, 3–8 digits. */
const COLOR_PATTERN = /^#?[0-9a-f]{3,8}$/i;

/** Narrow an open NodeType to one of the three built-in types. */
function IsBuiltInType(type: NodeType): type is BuiltInNodeType {
  return type === "file" || type === "folder" || type === "concept";
}

/**
 * Parse and validate plugin JSON. Returns null when the file is not a
 * usable plugin (same contract as ParseGraphSnapshot).
 */
export function ParsePlugin(text: string): Plugin | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const raw = data as RawPlugin;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name === "" || !Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    return null;
  }
  const nodes: PluginNodeDef[] = [];
  const seenTypes = new Set<string>();
  for (const entry of raw.nodes) {
    const node = ParsePluginNode(entry);
    if (node === null) {
      return null;
    }
    const key = node.type.toLowerCase();
    if (seenTypes.has(key)) {
      return null;
    }
    seenTypes.add(key);
    nodes.push(node);
  }
  const plugin: Plugin = { name, nodes };
  const version = typeof raw.version === "string" ? raw.version.trim() : "";
  if (version !== "") {
    plugin.version = version;
  }
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (description !== "") {
    plugin.description = description;
  }
  return plugin;
}

/** Validate one node definition; null when malformed. */
function ParsePluginNode(raw: unknown): PluginNodeDef | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const entry = raw as RawPluginNode;
  const type = typeof entry.type === "string" ? entry.type.trim() : "";
  const label = typeof entry.label === "string" ? entry.label.trim() : "";
  if (type === "" || label === "" || !TYPE_ID_PATTERN.test(type)) {
    return null;
  }
  const node: PluginNodeDef = { type, label };
  const desc = typeof entry.desc === "string" ? entry.desc.trim() : "";
  if (desc !== "") {
    node.desc = desc;
  }
  const category = typeof entry.category === "string" ? entry.category.trim() : "";
  if (category !== "") {
    node.category = category;
  }
  const color = typeof entry.color === "string" ? entry.color.trim() : "";
  if (color !== "" && COLOR_PATTERN.test(color)) {
    node.color = color.startsWith("#") ? color : `#${color}`;
  }
  return node;
}

/** Read and validate a plugin from a picked file. Null when unusable. */
export async function LoadPluginFromFile(file: File): Promise<Plugin | null> {
  try {
    return ParsePlugin(await file.text());
  } catch {
    return null;
  }
}

/**
 * Validate a `plugins` array from a saved graph. Malformed entries are
 * dropped individually so one bad plugin cannot sink the whole graph.
 */
export function ParsePluginArray(raw: unknown): Plugin[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const plugins: Plugin[] = [];
  for (const entry of raw) {
    const plugin = ParsePluginEntry(entry);
    if (plugin !== null) {
      plugins.push(plugin);
    }
  }
  return plugins;
}

/** Validate one plugin object taken directly from parsed JSON. */
function ParsePluginEntry(raw: unknown): Plugin | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const text = JSON.stringify(raw);
  return ParsePlugin(text);
}

/** Find the definition that declares a given node type, across all plugins. */
export function FindPluginNodeDef(plugins: Plugin[], type: string): PluginNodeDef | undefined {
  for (const plugin of plugins) {
    for (const node of plugin.nodes) {
      if (node.type === type) {
        return node;
      }
    }
  }
  return undefined;
}

/**
 * Colors for a node type: built-in types use the fixed palette, plugin
 * types use their declared accent, and unknown types fall back to the
 * concept style so a graph still renders when its plugin is missing.
 */
export function ColorsForType(type: NodeType, plugins: Plugin[]): TypeColors {
  if (IsBuiltInType(type)) {
    return TYPE_COLORS[type];
  }
  const def = FindPluginNodeDef(plugins, type);
  if (def !== undefined && def.color !== undefined) {
    return { bg: `${def.color}14`, border: def.color, dot: def.color };
  }
  return TYPE_COLORS.concept;
}

/**
 * Default name/desc for a freshly created node. Plugin types use their
 * definition's label and description; built-ins keep their fixed defaults.
 */
export function NodeDefaultsFor(type: NodeType, plugins: Plugin[]): { name: string; desc: string } {
  if (IsBuiltInType(type)) {
    return NodeDefaultsForBuiltIn(type);
  }
  const def = FindPluginNodeDef(plugins, type);
  if (def !== undefined) {
    return { name: def.label, desc: def.desc ?? `A ${def.label} node from the plugin.` };
  }
  return { name: type, desc: "Describe this node…" };
}

/** Fixed defaults for the three built-in node types. */
function NodeDefaultsForBuiltIn(type: "file" | "folder" | "concept"): { name: string; desc: string } {
  const defaults: Record<"file" | "folder" | "concept", { name: string; desc: string }> = {
    file: { name: "new_file.js", desc: "Describe what this file does…" },
    folder: { name: "new_folder/", desc: "Describe what this folder contains…" },
    concept: { name: "Untitled concept", desc: "Describe this architectural concept…" },
  };
  return defaults[type];
}
