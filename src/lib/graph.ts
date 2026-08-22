import type { GraphEdge, GraphNode } from "./types";

/**
 * Graph algorithms over the node/edge lists.
 */

/**
 * Topological sort (Kahn's algorithm). Cycles are tolerated: nodes left
 * unprocessed are appended at the end in their original order.
 */
export function TopoSort(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }
  for (const edge of edges) {
    const targets = adjacency.get(edge.from);
    if (targets !== undefined) {
      targets.push(edge.to);
    }
    if (inDegree.has(edge.to)) {
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }
  }

  const queue = nodes.filter(node => (inDegree.get(node.id) ?? 0) === 0).map(node => node.id);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    ordered.push(id);
    for (const target of adjacency.get(id) ?? []) {
      const degree = (inDegree.get(target) ?? 0) - 1;
      inDegree.set(target, degree);
      if (degree === 0) {
        queue.push(target);
      }
    }
  }

  // Cycle fallback: append whatever the sort never reached.
  for (const node of nodes) {
    if (!ordered.includes(node.id)) {
      ordered.push(node.id);
    }
  }

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  return ordered
    .map(id => nodeById.get(id))
    .filter((node): node is GraphNode => node !== undefined);
}
