import { CreateUniqueId } from "./ids";
import { DescendantCount, SetParent, SubtreeIds, WouldCreateCycle } from "./sceneGraph";
import type { GraphEdge, GraphNode, NodeType, PortSide } from "./types";

/**
 * The editing rules of the graph as pure functions over `{ nodes, edges }`.
 * The canvas and the headless core both edit through these, so a node
 * added by hand and one added by a host agent obey the same rules.
 *
 * Each rule that can refuse has a `…Refusal` check returning the reason,
 * or null when the edit is allowed. The edit itself returns the graph
 * unchanged when refused, so callers that don't need the reason can skip
 * the check.
 */

/** The editable part of a snapshot. */
export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Fields an edit may change on an existing node. */
export type NodePatch = Partial<Pick<GraphNode, "name" | "desc" | "path" | "type" | "x" | "y">>;

/** A new node with defaults for every scene-graph field. */
export function CreateNode(type: NodeType, name: string, desc: string, x: number, y: number): GraphNode {
  return {
    id: CreateUniqueId("n"), x, y, name, path: "", desc,
    type, parentId: null, visible: true, collapsed: false,
  };
}

/** Add a node as a root. */
export function AddNode(graph: GraphState, node: GraphNode): GraphState {
  return { ...graph, nodes: [...graph.nodes, node] };
}

/** Shallow-merge a patch into one node. */
export function UpdateNode(graph: GraphState, id: string, patch: Partial<GraphNode>): GraphState {
  return { ...graph, nodes: graph.nodes.map(node => (node.id === id ? { ...node, ...patch } : node)) };
}

/** Delete a node, its whole subtree, and every edge touching them. */
export function RemoveNode(graph: GraphState, id: string): GraphState {
  const removed = new Set(SubtreeIds(graph.nodes, id));
  return {
    nodes: graph.nodes
      .filter(node => !removed.has(node.id))
      .map(node => (node.componentIds === undefined
        ? node
        : { ...node, componentIds: node.componentIds.filter(componentId => !removed.has(componentId)) })),
    edges: graph.edges.filter(edge => !removed.has(edge.from) && !removed.has(edge.to)),
  };
}

/**
 * Why a noodle from `from` to `to` is not allowed, or null. A folder's
 * noodle groups (the target becomes its child, so it must not cycle and
 * must not land on an object); an object's port attaches instead (see
 * Attach); any other node draws a free-form note line.
 */
export function ConnectRefusal(graph: GraphState, from: string, to: string): string | null {
  const fromNode = graph.nodes.find(node => node.id === from);
  const toNode = graph.nodes.find(node => node.id === to);
  if (fromNode === undefined || toNode === undefined) {
    return "both nodes must exist";
  }
  if (from === to) {
    return "a node cannot connect to itself";
  }
  if (graph.edges.some(edge => edge.from === from && edge.to === to)) {
    return "these nodes are already connected";
  }
  if (fromNode.type === "object") {
    return "an object's port attaches components; use attach";
  }
  if (fromNode.type === "folder") {
    if (toNode.type === "object") {
      return "an object cannot be grouped under a folder";
    }
    if (WouldCreateCycle(graph.nodes, to, from)) {
      return "grouping would create a cycle";
    }
  }
  return null;
}

/**
 * Draw a noodle. From a folder it groups: the target is reparented under
 * the folder. From anything else it is a note line that never reparents.
 */
export function Connect(graph: GraphState, from: string, to: string, fromSide?: PortSide, toSide?: PortSide, label: string = ""): GraphState {
  if (ConnectRefusal(graph, from, to) !== null) {
    return graph;
  }
  const edge: GraphEdge = { id: CreateUniqueId("e"), from, to, label, fromSide, toSide };
  const fromNode = graph.nodes.find(node => node.id === from);
  const nodes = fromNode?.type === "folder" ? SetParent(graph.nodes, to, from) : graph.nodes;
  return { nodes, edges: [...graph.edges, edge] };
}

/** Why `componentId` cannot be attached to `objectId`, or null. */
export function AttachRefusal(graph: GraphState, objectId: string, componentId: string): string | null {
  const objectNode = graph.nodes.find(node => node.id === objectId);
  if (objectNode === undefined || objectNode.type !== "object") {
    return "attach needs an object node";
  }
  if (!graph.nodes.some(node => node.id === componentId)) {
    return "the component node must exist";
  }
  if (objectId === componentId) {
    return "an object cannot attach itself";
  }
  if ((objectNode.componentIds ?? []).includes(componentId)) {
    return "this component is already attached";
  }
  return null;
}

/** Attach a node as a component of an object (an object→component noodle). */
export function Attach(graph: GraphState, objectId: string, componentId: string): GraphState {
  if (AttachRefusal(graph, objectId, componentId) !== null) {
    return graph;
  }
  return {
    nodes: graph.nodes.map(node => (node.id === objectId
      ? { ...node, componentIds: [...(node.componentIds ?? []), componentId] }
      : node)),
    edges: [...graph.edges, { id: CreateUniqueId("e"), from: objectId, to: componentId, label: "" }],
  };
}

/**
 * Remove an edge and undo what it did: a folder's noodle unparents its
 * target, an object's noodle detaches its component.
 */
export function Disconnect(graph: GraphState, edgeId: string): GraphState {
  const edge = graph.edges.find(entry => entry.id === edgeId);
  if (edge === undefined) {
    return graph;
  }
  const edges = graph.edges.filter(entry => entry.id !== edgeId);
  const fromNode = graph.nodes.find(node => node.id === edge.from);
  if (fromNode?.type === "folder") {
    return {
      edges,
      nodes: graph.nodes.map(node => (node.id === edge.to && node.parentId === edge.from ? { ...node, parentId: null } : node)),
    };
  }
  if (fromNode?.type === "object") {
    return {
      edges,
      nodes: graph.nodes.map(node => (node.id === edge.from
        ? { ...node, componentIds: (node.componentIds ?? []).filter(id => id !== edge.to) }
        : node)),
    };
  }
  return { ...graph, edges };
}

/** Rename an edge's note label. */
export function LabelEdge(graph: GraphState, edgeId: string, label: string): GraphState {
  return { ...graph, edges: graph.edges.map(edge => (edge.id === edgeId ? { ...edge, label } : edge)) };
}

/** Why `nodeId` cannot be moved under `parentId`, or null. */
export function SetParentRefusal(graph: GraphState, nodeId: string, parentId: string | null): string | null {
  if (!graph.nodes.some(node => node.id === nodeId)) {
    return "the node must exist";
  }
  if (parentId === null) {
    return null;
  }
  if (!graph.nodes.some(node => node.id === parentId)) {
    return "the parent node must exist";
  }
  if (WouldCreateCycle(graph.nodes, nodeId, parentId)) {
    return "that parent is inside this node's own subtree";
  }
  return null;
}

/** Reparent a node in the scene hierarchy (cycle attempts are ignored). */
export function SetNodeParent(graph: GraphState, nodeId: string, parentId: string | null): GraphState {
  return { ...graph, nodes: SetParent(graph.nodes, nodeId, parentId) };
}

/**
 * Move a node and its entire subtree together: the root lands at (x, y)
 * and every descendant shifts by the same delta, keeping the group's
 * internal layout.
 */
export function MoveSubtree(graph: GraphState, rootId: string, x: number, y: number): GraphState {
  const root = graph.nodes.find(node => node.id === rootId);
  if (root === undefined) {
    return graph;
  }
  const deltaX = x - root.x;
  const deltaY = y - root.y;
  if (deltaX === 0 && deltaY === 0) {
    return graph;
  }
  const subtree = new Set(SubtreeIds(graph.nodes, rootId));
  return {
    ...graph,
    nodes: graph.nodes.map(node => (subtree.has(node.id) ? { ...node, x: node.x + deltaX, y: node.y + deltaY } : node)),
  };
}

/** Collapse or expand every node that has children. */
export function SetAllCollapsed(graph: GraphState, collapsed: boolean): GraphState {
  const parentIds = new Set(graph.nodes.filter(node => DescendantCount(graph.nodes, node.id) > 0).map(node => node.id));
  return { ...graph, nodes: graph.nodes.map(node => (parentIds.has(node.id) ? { ...node, collapsed } : node)) };
}
