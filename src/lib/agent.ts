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

/** Build the full code-generation prompt for a node. */
function BuildAgentPrompt(node: GraphNode, upstream: UpstreamContext[]): string {
  let context = "";
  if (upstream.length > 0) {
    context = "\n\n## Context from upstream modules:\n" + upstream.map(RenderUpstreamSection).join("\n\n");
  }
  return `You are a senior developer. Generate the code for "${node.name}" (type: ${node.type}).\n\n## Spec:\n${node.desc}${context}\n\nGenerate ONLY the code. No explanation, no markdown fences.`;
}

/**
 * Generate code for a node using its spec and upstream modules' specs and
 * generated code. Returns "(no output)" when the model produces nothing.
 */
export async function RunAgent(node: GraphNode, nodes: GraphNode[], edges: GraphEdge[]): Promise<string> {
  const upstream = CollectUpstreamContext(node, nodes, edges);
  const prompt = BuildAgentPrompt(node, upstream);
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
