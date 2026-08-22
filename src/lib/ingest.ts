import { CreateUniqueId } from "./ids";
import { DescribeFile } from "./agent";
import { AutoGroupFromNodes, DagLayout } from "./layout";
import type { GraphEdge, GraphNode, IngestFileEntry, IngestResult } from "./types";

/**
 * Repository ingestion: deciding which files to read, parsing their
 * imports, and resolving relative imports against the file set.
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

/** Extensions that have import syntax we know how to parse. */
const JS_LIKE_EXTS = new Set(["js", "jsx", "ts", "tsx", "mjs", "cjs", "vue", "svelte", "astro"]);
/** File extensions tried when resolving a directory or extensionless import. */
const RESOLVE_EXTS = ["js", "ts", "jsx", "tsx", "py", "go", "index.js", "index.ts"];

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

/** Extract import/require specifiers from a file's content. */
export function ParseImports(content: string, ext: string): string[] {
  const deps = new Set<string>();
  if (JS_LIKE_EXTS.has(ext)) {
    collectMatches(content, /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g, deps);
  }
  if (ext === "py") {
    collectMatches(content, /(?:from\s+(\S+)\s+import|import\s+(\S+))/g, deps, (match) =>
      (match[1] ?? match[2] ?? "").replace(/\./g, "/"));
  }
  if (ext === "go") {
    collectGoImports(content, deps);
  }
  return [...deps];
}

/** Run a global regex and add each capture to the dependency set. */
function collectMatches(
  content: string,
  pattern: RegExp,
  deps: Set<string>,
  transform: (match: RegExpExecArray) => string = (match) => match[1] ?? match[2] ?? "",
): void {
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const value = transform(match);
    if (value !== "") {
      deps.add(value);
    }
  }
}

/** Go imports appear as a single quoted string or a parenthesized block. */
function collectGoImports(content: string, deps: Set<string>): void {
  const pattern = /import\s+(?:\(\s*([\s\S]*?)\)|"([^"]+)")/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (match[2] !== undefined) {
      deps.add(match[2]);
    } else if (match[1] !== undefined) {
      const quoted = match[1].match(/"([^"]+)"/g) ?? [];
      for (const specifier of quoted) {
        deps.add(specifier.replace(/"/g, ""));
      }
    }
  }
}

/**
 * Resolve a relative import to an actual file in the set, trying the exact
 * path first, then common extensions, then index files.
 */
export function ResolveImport(imp: string, fromPath: string, allPaths: string[]): string | null {
  if (!imp.startsWith(".")) {
    return null;
  }
  const fromDir = fromPath.split("/").slice(0, -1).join("/");
  const relative = imp.replace(/^\.\//, "");
  const resolved = fromDir === "" ? relative : `${fromDir}/${relative}`;

  const candidates = [
    resolved,
    ...RESOLVE_EXTS.map(ext => (resolved.endsWith("/") ? `${resolved}${ext}` : `${resolved}.${ext}`)),
    `${resolved}/index.js`,
    `${resolved}/index.ts`,
  ];
  return allPaths.find(path => candidates.some(candidate => path === candidate || path.endsWith(`/${candidate}`))) ?? null;
}

/**
 * Turn the read files into a laid-out graph: one node per file (described
 * by the LLM unless skipped), edges from parsed imports, auto-grouped by
 * directory and collapsed, then DAG-laid-out.
 */
export async function BuildIngestGraph(
  files: IngestFileEntry[],
  skipDescribe: boolean,
  onProgress: (index: number, name: string) => void,
): Promise<IngestResult> {
  const allPaths = files.map(file => file.path);
  const nodes: GraphNode[] = [];
  const pathToId = new Map<string, string>();

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const id = CreateUniqueId("n");
    pathToId.set(file.path, id);
    onProgress(index + 1, file.name);

    const description = skipDescribe ? file.path : await DescribeFile(file.path, file.content.slice(0, 2000));
    nodes.push({
      id, x: 0, y: 0, name: file.name, path: file.path, desc: description,
      type: "file", group: null, agentOutput: file.content, agentStatus: "done",
    });
  }

  const edges = BuildImportEdges(files, pathToId, allPaths);

  // Directories become collapsed groups; the DAG layout positions everything.
  const { groups: autoGroups, nodes: groupedNodes } = AutoGroupFromNodes(nodes, []);
  const collapsedGroups = autoGroups.map(group => ({ ...group, collapsed: true }));
  const { nodes: laidNodes, groups: laidGroups } = DagLayout(groupedNodes, edges, collapsedGroups);
  return { nodes: laidNodes, edges, groups: laidGroups };
}

/** One edge per import that resolves to another file in the set. */
function BuildImportEdges(files: IngestFileEntry[], pathToId: Map<string, string>, allPaths: string[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const file of files) {
    const fromId = pathToId.get(file.path);
    if (fromId === undefined) {
      continue;
    }
    for (const imp of ParseImports(file.content, file.ext)) {
      const resolved = ResolveImport(imp, file.path, allPaths);
      const toId = resolved !== null ? pathToId.get(resolved) : undefined;
      if (toId !== undefined) {
        edges.push({ id: CreateUniqueId("e"), from: fromId, to: toId, label: imp.split("/").pop() ?? imp });
      }
    }
  }
  return edges;
}
