import { TopoSort } from "./graph";
import { BuildChildrenMap } from "./sceneGraph";
import type { GraphEdge, GraphNode, RunMode } from "./types";

/**
 * Builds the "Exported Architecture Prompt": a markdown document describing
 * the whole graph, ready to paste into another coding agent. Besides the
 * module descriptions it tells the agent exactly where every file goes and
 * instructs it to create the folders and files that do not exist yet.
 */

/**
 * Serialize the graph to markdown. In serial mode, modules are listed in
 * topological order and numbered as steps.
 */
export function BuildArchitecturePrompt(
  nodes: GraphNode[],
  edges: GraphEdge[],
  mode: RunMode,
): string {
  const lines: string[] = [];
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const childrenMap = BuildChildrenMap(nodes);

  // Edges touching a folder are grouping edges (they express the hierarchy),
  // not dependencies; the structure tree and file layout carry them instead.
  const dependencyEdges = edges.filter(edge => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    return from !== undefined && to !== undefined && from.type !== "folder" && to.type !== "folder";
  });

  lines.push("# System Architecture\n");
  lines.push(`Execution mode: ${mode}\n`);

  lines.push("## Structure\n");
  RenderStructureTree(nodes, nodeById, childrenMap, lines);
  lines.push("");

  lines.push("## File Layout\n");
  lines.push("Create each folder (directory) below if it does not already exist, then create each file at its listed path if it does not already exist.\n");
  RenderFileLayout(nodes, nodeById, lines);

  lines.push("## Modules\n");
  const ordered = mode === "serial" ? TopoSort(nodes, dependencyEdges) : nodes;
  for (let index = 0; index < ordered.length; index += 1) {
    const node = ordered[index];
    const incoming = EdgeNames(dependencyEdges.filter(edge => edge.to === node.id), nodeById, "from");
    const outgoing = EdgeNames(dependencyEdges.filter(edge => edge.from === node.id), nodeById, "to");

    const step = mode === "serial" ? `Step ${index + 1}: ` : "";
    lines.push(`### ${step}${node.name} [${node.type}]`);
    lines.push(node.desc);
    lines.push(`Path: ${NodePath(node, nodeById)}`);
    if (incoming.length > 0) {
      lines.push(`Receives context from: ${incoming.join(", ")}`);
    }
    if (outgoing.length > 0) {
      lines.push(`Passes context to: ${outgoing.join(", ")}`);
    }
    if (node.agentOutput !== null) {
      lines.push(`Generated code available: yes (${node.agentOutput.split("\n").length} lines)`);
    }
    lines.push("");
  }

  lines.push("## Dependency Graph\n");
  if (dependencyEdges.length === 0) {
    lines.push("(none)");
  }
  for (const edge of dependencyEdges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (from !== undefined && to !== undefined) {
      const label = edge.label !== "" ? ` [${edge.label}]` : "";
      lines.push(`${from.name} →${label} ${to.name}`);
    }
  }

  return lines.join("\n");
}

/**
 * Indented tree of the hierarchy, one line per node. Orphaned nodes
 * (parent id missing) are listed as roots.
 */
function RenderStructureTree(
  nodes: GraphNode[],
  nodeById: Map<string, GraphNode>,
  childrenMap: Map<string, string[]>,
  lines: string[],
): void {
  const visit = (id: string, depth: number): void => {
    const node = nodeById.get(id);
    if (node === undefined) {
      return;
    }
    lines.push(`${"  ".repeat(depth)}- ${node.name} [${node.type}]`);
    for (const childId of childrenMap.get(id) ?? []) {
      visit(childId, depth + 1);
    }
  };
  for (const node of nodes) {
    if (node.parentId === null || !nodeById.has(node.parentId)) {
      visit(node.id, 0);
    }
  }
}

/**
 * Explicit placement list: the directories to create, then every file (and
 * concept, for reference) with its full target path.
 */
function RenderFileLayout(
  nodes: GraphNode[],
  nodeById: Map<string, GraphNode>,
  lines: string[],
): void {
  const folders = nodes.filter(node => node.type === "folder");
  const files = nodes.filter(node => node.type === "file");
  const concepts = nodes.filter(node => node.type === "concept");

  lines.push("**Directories to create:**");
  if (folders.length === 0) {
    lines.push("- (none)");
  }
  for (const folder of folders) {
    lines.push(`- ${NodePath(folder, nodeById)}/`);
  }
  lines.push("");

  lines.push("**Files to create (at these paths):**");
  if (files.length === 0) {
    lines.push("- (none)");
  }
  for (const file of files) {
    lines.push(`- ${NodePath(file, nodeById)}`);
  }
  lines.push("");

  if (concepts.length > 0) {
    lines.push("**Concepts (no file of their own — implement where they fit):**");
    for (const concept of concepts) {
      lines.push(`- ${NodePath(concept, nodeById)}`);
    }
    lines.push("");
  }
}

/**
 * Full slash-separated path of a node, built by walking up its parent
 * chain (cycle-safe). A root node's path is just its name.
 */
function NodePath(
  node: GraphNode,
  nodeById: Map<string, GraphNode>,
): string {
  const parts: string[] = [node.name];
  const visited = new Set<string>([node.id]);
  let parentId = node.parentId;
  while (parentId !== null && !visited.has(parentId)) {
    const parent = nodeById.get(parentId);
    if (parent === undefined) {
      break;
    }
    visited.add(parentId);
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }
  return parts.join("/");
}

/** "Name (label)" strings for the other end of each edge. */
function EdgeNames(
  edges: GraphEdge[],
  nodeById: Map<string, GraphNode>,
  otherEnd: "from" | "to",
): string[] {
  const names: string[] = [];
  for (const edge of edges) {
    const other = nodeById.get(otherEnd === "from" ? edge.from : edge.to);
    if (other === undefined) {
      continue;
    }
    const label = edge.label !== "" ? ` (${edge.label})` : "";
    names.push(`${other.name}${label}`);
  }
  return names;
}
