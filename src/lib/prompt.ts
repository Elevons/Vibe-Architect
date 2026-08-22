import { TopoSort } from "./graph";
import type { GraphEdge, GraphGroup, GraphNode, RunMode } from "./types";

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
  groups: GraphGroup[],
  mode: RunMode,
): string {
  const lines: string[] = [];
  const nodeById = new Map(nodes.map(node => [node.id, node]));

  lines.push("# System Architecture\n");
  lines.push(`Execution mode: ${mode}\n`);

  const usedGroups = groups.filter(group => nodes.some(node => node.group === group.id));
  if (usedGroups.length > 0) {
    lines.push("## Module Groups\n");
    for (const group of usedGroups) {
      const members = nodes.filter(node => node.group === group.id).map(node => node.name);
      lines.push(`### ${group.name}\nModules: ${members.join(", ")}\n`);
    }
  }

  lines.push("## Modules\n");
  const ordered = mode === "serial" ? TopoSort(nodes, edges) : nodes;
  ordered.forEach((node, index) => {
    const incoming = EdgeNames(edges.filter(edge => edge.to === node.id), nodeById, "from");
    const outgoing = EdgeNames(edges.filter(edge => edge.from === node.id), nodeById, "to");

    const step = mode === "serial" ? `Step ${index + 1}: ` : "";
    lines.push(`### ${step}${node.name} [${node.type}]`);
    lines.push(node.desc);
    if (node.group !== null) {
      const group = groups.find(entry => entry.id === node.group);
      if (group !== undefined) {
        lines.push(`Group: ${group.name}`);
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
  });

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
