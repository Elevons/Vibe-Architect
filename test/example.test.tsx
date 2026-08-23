/**
 * Example graph check: loads examples/vibe-architect.json through the app's
 * own load pipeline (LoadGraphFromFile → ParseGraphSnapshot) and verifies the
 * snapshot is well-formed: expected counts, edge endpoints and parent links
 * all resolve, no parent cycles, and every node renders.
 */
import { LoadGraphFromFile } from "../src/lib/fileStorage";
import { ComputeRenderedSet } from "../src/lib/sceneGraph";
import type { GraphNode } from "../src/lib/types";

const results: string[] = [];
const pass = (name: string, ok: boolean, detail = ""): void => {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail === "" ? "" : ` (${detail})`}`);
};

async function run(): Promise<void> {
  const response = await fetch("/examples/vibe-architect.json");
  const text = await response.text();
  const file = new File([text], "vibe-architect.json", { type: "application/json" });
  const snapshot = await LoadGraphFromFile(file);

  pass("example loads through the app pipeline", snapshot !== null);
  if (snapshot === null) {
    throw new Error("snapshot did not parse");
  }

  const { nodes, edges } = snapshot;
  pass("node count", nodes.length === 39, `got ${nodes.length}`);
  pass("edge count", edges.length === 56, `got ${edges.length}`);
  pass("mode", snapshot.mode === "parallel", snapshot.mode);

  const ids = new Set(nodes.map(node => node.id));
  pass("unique node ids", ids.size === nodes.length);

  const danglingEdges = edges.filter(edge => !ids.has(edge.from) || !ids.has(edge.to));
  pass("every edge endpoint resolves", danglingEdges.length === 0, `${danglingEdges.length} dangling`);

  const danglingParents = nodes.filter(node => node.parentId !== null && !ids.has(node.parentId));
  pass("every parent link resolves", danglingParents.length === 0, `${danglingParents.length} dangling`);

  // Walk each parent chain; a cycle would never reach a root.
  let cycles = 0;
  for (const node of nodes) {
    const seen = new Set<string>();
    let cursor: GraphNode | undefined = node;
    while (cursor !== undefined && cursor.parentId !== null) {
      if (seen.has(cursor.id)) {
        cycles += 1;
        break;
      }
      seen.add(cursor.id);
      cursor = nodes.find(candidate => candidate.id === cursor?.parentId);
    }
  }
  pass("no parent cycles", cycles === 0, `${cycles} cyclic`);

  const roots = nodes.filter(node => node.parentId === null);
  const rootNames = roots.map(node => node.name).sort();
  pass("root folders are src/ and test/", JSON.stringify(rootNames) === JSON.stringify(["src/", "test/"]), rootNames.join(", "));

  const folders = nodes.filter(node => node.type === "folder");
  pass("folder count", folders.length === 6, `got ${folders.length}`);

  const rendered = ComputeRenderedSet(nodes);
  pass("every node renders", rendered.size === nodes.length, `rendered ${rendered.size}/${nodes.length}`);

  const pre = document.getElementById("results") as HTMLElement;
  pre.textContent = results.join("\n");
  document.title = results.every(line => line.startsWith("PASS")) ? "ALL PASS" : "FAILURES";
}

run().catch(error => {
  const pre = document.getElementById("results") as HTMLElement;
  pre.textContent = `FAIL crashed: ${error instanceof Error ? error.message : String(error)}`;
  document.title = "FAILURES";
});
