import { CreateUniqueId } from "./ids";
import { DescribeFile } from "./agent";
import { DagLayout } from "./layout";
import type { GraphEdge, GraphNode, IngestFileEntry, IngestResult } from "./types";

/**
 * Repository ingestion: deciding which files to read and turning them into
 * a graph of folder nodes (the structure) with one grouping edge per
 * child. Import parsing is deliberately not done — the graph is an
 * architecture doc, not an import map.
 */

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "__pycache__", ".next", "dist", "build",
  ".venv", "venv", ".cache", "coverage", ".svn",
]);

const CODE_EXTS = new Set([
  "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp",
  "h", "hpp", "cs", "php", "swift", "kt", "scala", "sh", "bash", "zsh",
  "vue", "svelte", "astro", "mjs", "cjs",
]);
const CONFIG_EXTS = new Set(["json", "yaml", "yml", "toml", "xml", "ini", "env", "cfg", "conf"]);
const DOC_EXTS = new Set(["md", "txt", "rst", "adoc"]);
/** Every extension ingestion will read. */
export const ALL_EXTS = new Set([...CODE_EXTS, ...CONFIG_EXTS, ...DOC_EXTS]);

/** Skip paths that pass through an ignored directory. */
export function ShouldInclude(path: string): boolean {
  const parts = path.split("/");
  return !parts.some(part => IGNORED_DIRS.has(part));
}

/** Lowercase file extension, or "" when the name has none. */
export function GetExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}



/**
 * Auto-build the folder hierarchy from file paths: one folder node per
 * directory (nested by path, created collapsed), each file parented to its
 * directory. Files at the root stay parentless.
 */
export function AutoParentFromNodes(nodes: GraphNode[]): GraphNode[] {
  const dirToId = new Map<string, string>();
  const folderNodes: GraphNode[] = [];

  const EnsureFolderChain = (dir: string): string | null => {
    if (dir === "") {
      return null;
    }
    const existing = dirToId.get(dir);
    if (existing !== undefined) {
      return existing;
    }
    const parts = dir.split("/");
    const parentId = EnsureFolderChain(parts.slice(0, -1).join("/"));
    const folderId = CreateUniqueId("n");
    dirToId.set(dir, folderId);
    folderNodes.push({
      id: folderId, x: 0, y: 0, name: `${dir}/`, path: dir,
      desc: `Directory ${dir}`, type: "folder", parentId, visible: true, collapsed: true,
      agentOutput: null, agentStatus: "idle",
    });
    return folderId;
  };

  return [
    ...nodes.map(node => {
      if (node.type === "folder") {
        return node;
      }
      const slash = node.path.lastIndexOf("/");
      if (slash <= 0) {
        return node;
      }
      return { ...node, parentId: EnsureFolderChain(node.path.slice(0, slash)) };
    }),
    ...folderNodes,
  ];
}

/**
 * Turn the read files into a laid-out graph: one node per file (described
 * by the LLM unless skipped), files parented under auto-created (collapsed)
 * folder nodes, one grouping edge per folder → child, then DAG-laid-out.
 */
export async function BuildIngestGraph(
  files: IngestFileEntry[],
  skipDescribe: boolean,
  onProgress: (index: number, name: string) => void,
): Promise<IngestResult> {
  const nodes: GraphNode[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const id = CreateUniqueId("n");
    onProgress(index + 1, file.name);

    const description = skipDescribe ? file.path : await DescribeFile(file.path, file.content.slice(0, 2000));
    nodes.push({
      id, x: 0, y: 0, name: file.name, path: file.path, desc: description,
      type: "file", parentId: null, visible: true, collapsed: false,
      agentOutput: file.content, agentStatus: "done",
    });
  }

  const parented = AutoParentFromNodes(nodes);
  const edges = BuildGroupingEdges(parented);
  const { nodes: laidNodes } = DagLayout(parented, edges);
  return { nodes: laidNodes, edges };
}

/** One grouping edge per parent link: the folder draws a noodle to each child. */
function BuildGroupingEdges(nodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const node of nodes) {
    if (node.parentId !== null) {
      edges.push({ id: CreateUniqueId("e"), from: node.parentId, to: node.id, label: "" });
    }
  }
  return edges;
}
