import { NODE_H, NODE_W } from "./lib/constants";
import { NormalizeSnapshot } from "./lib/fileStorage";
import { CreateUniqueId } from "./lib/ids";
import {
  AddNode,
  Attach,
  AttachRefusal,
  Connect,
  ConnectRefusal,
  CreateNode,
  Disconnect,
  MoveSubtree,
  RemoveNode,
  SetAllCollapsed,
  SetNodeParent,
  SetParentRefusal,
  UpdateNode,
  type NodePatch,
} from "./lib/operations";
import { BuildArchitecturePrompt } from "./lib/prompt";
import type { GraphEdge, GraphNode, GraphSnapshot, NodeType, PortSide, RunMode } from "./lib/types";

/**
 * The headless entry point: the graph rules, the prompt builder, and one
 * operation dispatcher over them. A host imports the built `core.js` to edit a
 * board's graph with the same rules the canvas follows — no DOM, no React.
 */

/** One edit, as a plain JSON object a host tool can send. */
export type GraphOperation =
  | { op: "add_node"; id?: string; type?: NodeType; name: string; desc?: string; path?: string; x?: number; y?: number; parentId?: string | null }
  | { op: "update_node"; id: string; patch: NodePatch }
  | { op: "remove_node"; id: string }
  | { op: "connect"; from: string; to: string; fromSide?: PortSide; toSide?: PortSide; label?: string }
  | { op: "disconnect"; edgeId: string }
  | { op: "attach"; objectId: string; componentId: string }
  | { op: "set_parent"; id: string; parentId: string | null }
  | { op: "move_subtree"; id: string; x: number; y: number }
  | { op: "set_mode"; mode: RunMode }
  | { op: "set_collapsed"; collapsed: boolean };

/** The graph after an edit, or the unchanged graph and the reason it refused. */
export interface GraphOperationResult {
  graph: GraphSnapshot;
  error?: string;
}

/**
 * Apply one operation to a snapshot. A refused edit returns the graph
 * unchanged with `error`, so a host can report the rule without duplicating it.
 */
export function ApplyOperation(snapshot: GraphSnapshot, operation: GraphOperation): GraphOperationResult {
  switch (operation.op) {
    case "add_node":
      return ApplyAddNode(snapshot, operation);
    case "update_node":
      return WithGraph(snapshot, UpdateNode(snapshot, operation.id, operation.patch));
    case "remove_node":
      return WithGraph(snapshot, RemoveNode(snapshot, operation.id));
    case "connect": {
      const refusal = ConnectRefusal(snapshot, operation.from, operation.to);
      if (refusal !== null) {
        return { graph: snapshot, error: refusal };
      }
      return WithGraph(snapshot, Connect(snapshot, operation.from, operation.to, operation.fromSide, operation.toSide, operation.label ?? ""));
    }
    case "disconnect":
      return WithGraph(snapshot, Disconnect(snapshot, operation.edgeId));
    case "attach": {
      const refusal = AttachRefusal(snapshot, operation.objectId, operation.componentId);
      if (refusal !== null) {
        return { graph: snapshot, error: refusal };
      }
      return WithGraph(snapshot, Attach(snapshot, operation.objectId, operation.componentId));
    }
    case "set_parent": {
      const refusal = SetParentRefusal(snapshot, operation.id, operation.parentId);
      if (refusal !== null) {
        return { graph: snapshot, error: refusal };
      }
      return WithGraph(snapshot, SetNodeParent(snapshot, operation.id, operation.parentId));
    }
    case "move_subtree":
      return WithGraph(snapshot, MoveSubtree(snapshot, operation.id, operation.x, operation.y));
    case "set_mode":
      return { graph: { ...snapshot, mode: operation.mode } };
    case "set_collapsed":
      return WithGraph(snapshot, SetAllCollapsed(snapshot, operation.collapsed));
    default:
      return { graph: snapshot, error: "unknown operation" };
  }
}

/** Build one node, then add it (and optionally reparent it). */
function ApplyAddNode(snapshot: GraphSnapshot, operation: Extract<GraphOperation, { op: "add_node" }>): GraphOperationResult {
  if (operation.name.trim() === "") {
    return { graph: snapshot, error: "a node needs a name" };
  }
  const position = operation.x !== undefined && operation.y !== undefined
    ? { x: operation.x, y: operation.y }
    : NextFreePosition(snapshot.nodes);
  const node: GraphNode = {
    ...CreateNode(operation.type ?? "concept", operation.name.trim(), operation.desc ?? "", position.x, position.y),
    id: operation.id ?? CreateUniqueId("n"),
    path: operation.path ?? "",
  };
  let graph: GraphSnapshot = WithGraph(snapshot, AddNode(snapshot, node)).graph;
  if (operation.parentId !== undefined && operation.parentId !== null) {
    const refusal = SetParentRefusal(graph, node.id, operation.parentId);
    if (refusal !== null) {
      return { graph: snapshot, error: refusal };
    }
    graph = WithGraph(graph, SetNodeParent(graph, node.id, operation.parentId)).graph;
  }
  return { graph };
}

/** Keep the snapshot's mode and plugins when an edit returns only nodes/edges. */
function WithGraph(snapshot: GraphSnapshot, edited: { nodes: GraphNode[]; edges: GraphEdge[] }): { graph: GraphSnapshot } {
  return { graph: { ...snapshot, nodes: edited.nodes, edges: edited.edges } };
}

/** A free spot to the right of every node, so an added card is never hidden. */
function NextFreePosition(nodes: GraphNode[]): { x: number; y: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0 };
  }
  const lowest = nodes.reduce((current, node) => (node.y > current.y ? node : current), nodes[0]);
  const rightmost = Math.max(...nodes.map(node => node.x + NODE_W));
  return { x: rightmost + 80, y: lowest.y + NODE_H + 80 };
}

export { BuildArchitecturePrompt, NormalizeSnapshot };
export type { GraphEdge, GraphNode, GraphSnapshot, NodePatch, NodeType, PortSide, RunMode };
