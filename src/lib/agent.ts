import { RequestAnthropicText } from "./anthropic";
import type { GraphEdge, GraphNode } from "./types";

/**
 * The code-generation agent: given a node and its upstream context, ask the
 * model to write the module's code.
 */

/** Maximum characters of upstream generated code included in the prompt. */
const UPSTREAM_OUTPUT_LIMIT = 1500;

/** One upstream module's contribution to the prompt context. */
interface UpstreamContext {
  name: string;
  desc: string;
  contract: string;
  output: string | null;
}

/** One related-file note in the "related to" listing. */
interface RelatedNote {
  name: string;
  label: string;
}

/** Collect the incoming edges' source nodes as prompt context. */
function CollectUpstreamContext(node: GraphNode, nodes: GraphNode[], edges: GraphEdge[]): UpstreamContext[] {
  const nodeMap = new Map(nodes.map(entry => [entry.id, entry]));
  const context: UpstreamContext[] = [];
  for (const edge of edges) {
    if (edge.to !== node.id) {
      continue;
    }
    const source = nodeMap.get(edge.from);
    if (source === undefined) {
      continue;
    }
    context.push({
      name: source.name,
      desc: source.desc,
      contract: edge.label || "",
      output: source.agentOutput,
    });
  }
  return context;
}

/** Render one upstream module as a prompt section. */
function RenderUpstreamSection(entry: UpstreamContext): string {
  let section = `### ${entry.name}\nPurpose: ${entry.desc}\nContract: ${entry.contract || "(none)"}`;
  if (entry.output !== null && entry.output !== "") {
    section += `\nGenerated code:\n\`\`\`\n${entry.output.slice(0, UPSTREAM_OUTPUT_LIMIT)}\n\`\`\``;
  }
  return section;
}

/**
 * Collect note-line edges feeding this node:non-folder sources connected by a
 * line whose label is the note. Folders' grouping edges are excluded — their
 * relationship is hierarchy, not a peer reference.
 */
function CollectRelatedNotes(node: GraphNode, nodes: GraphNode[], edges: GraphEdge[]): RelatedNote[] {
  const nodeMap = new Map(nodes.map(entry => [entry.id, entry]));
  const related: RelatedNote[] = [];
  for (const edge of edges) {
    if (edge.to !== node.id) {
      continue;
    }
    const source = nodeMap.get(edge.from);
    if (source === undefined) {
      continue;
    }
    if (source.type === "folder") {
      continue;
    }
    related.push({ name: source.name, label: edge.label || "" });
  }
  return related;
}

/** One "A related to B: note" listing line per related file, or empty. */
function RenderRelatedSection(node: GraphNode, related: RelatedNote[]): string {
  if (related.length === 0) {
    return "";
  }
  const lines = related.map(entry => `- ${entry.name} related to ${node.name}: ${entry.label || "(no note)"}`);
  return "\n\n## Related modules:\n" + lines.join("\n");
}

/** Build the full code-generation prompt for a node. */
function BuildAgentPrompt(node: GraphNode, upstream: UpstreamContext[], related: RelatedNote[]): string {
  let context = "";
  if (upstream.length > 0) {
    context = "\n\n## Context from upstream modules:\n" + upstream.map(RenderUpstreamSection).join("\n\n");
  }
  return `You are a senior developer. Generate the code for "${node.name}" (type: ${node.type}).\n\n## Spec:\n${node.desc}${context}${RenderRelatedSection(node, related)}\n\nGenerate ONLY the code. No explanation, no markdown fences.`;
}

/**
 * Generate code for a node using its spec and upstream modules' specs and
 * generated code. Returns "(no output)" when the model produces nothing.
 */
export async function RunAgent(node: GraphNode, nodes: GraphNode[], edges: GraphEdge[]): Promise<string> {
  const upstream = CollectUpstreamContext(node, nodes, edges);
  const related = CollectRelatedNotes(node, nodes, edges);
  const prompt = BuildAgentPrompt(node, upstream, related);
  const text = await RequestAnthropicText(prompt, 1000);
  return text || "(no output)";
}

/**
 * Ask the model for a one- or two-sentence description of a file, based on
 * its name and a content snippet. Falls back to the name on empty output
 * and an error note on failure.
 */
export async function DescribeFile(name: string, contentSnippet: string): Promise<string> {
  try {
    const prompt = `In one or two concise sentences, describe what this file does based on its name and content. Be specific about its role in the codebase. Do not use markdown.\n\nFile: ${name}\n\`\`\`\n${contentSnippet}\n\`\`\``;
    const text = await RequestAnthropicText(prompt, 150);
    return text.trim() || name;
  } catch {
    return `(could not describe ${name})`;
  }
}
