import { TopoSort } from "./graph";
import { BuildChildrenMap } from "./sceneGraph";
import type { GraphEdge, GraphNode, RunMode } from "./types";

/**
 * Builds the "Exported Architecture Prompt": a markdown document describing
 * the whole graph, ready to paste into another coding agent.
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

  lines.push("# System Architecture\n");
  lines.push(`Execution mode: ${mode}\n`);

  lines.push("## Structure\n");
  RenderStructureTree(nodes, nodeById, childrenMap, lines);
  lines.push("");

  lines.push("## Modules\n");
  const ordered = mode === "serial" ? TopoSort(nodes, edges) : nodes;
  for (let index = 0; index < ordered.length; index += 1) {
    const node = ordered[index];
    const incoming = EdgeNames(edges.filter(edge => edge.to === node.id), nodeById, "from");
    const outgoing = EdgeNames(edges.filter(edge => edge.from === node.id), nodeById, "to");

    const step = mode === "serial" ? `Step ${index + 1}: ` : "";
    lines.push(`### ${step}${node.name} [${node.type}]`);
    lines.push(node.desc);
    if (node.parentId !== null) {
      const parent = nodeById.get(node.parentId);
      if (parent !== undefined) {
        lines.push(`Parent: ${parent.name}`);
      }
    }
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
  for (const edge of edges) {
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
