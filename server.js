#!/usr/bin/env node
/**
 * Simple server for Vibe Architect. Serves the Vite build and exposes a REST
 * API so graphs can be saved/loaded to disk instead of downloaded as files.
 *
 *   npm run dev         → Vite dev server (proxies /api to this)
 *   node server.js      → standalone (serves dist/ + API on port 3001)
 *
 * Graphs are stored as .json files in data/.
 */

import { createRequire } from "node:module";
import { readdir, readFile, writeFile, unlink, mkdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const require = createRequire(import.meta.url);
const express = require("express");
const app = express();

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DATA_DIR = join(__dirname, "data");
const DIST_DIR = join(__dirname, "dist");
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(express.json({ limit: "10mb" }));

async function ensureDataDir() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
  } catch {
    // directory already exists
  }
}

/** List all saved graphs with name and modified time. */
app.get("/api/graphs", async (_req, res) => {
  await ensureDataDir();
  try {
    const files = await readdir(DATA_DIR);
    const graphs = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const name = f.slice(0, -5);
      let mtime = null;
      try {
        const s = await stat(join(DATA_DIR, f));
        mtime = s.mtime.toISOString();
      } catch { /* skip */ }
      graphs.push({ name, mtime });
    }
    graphs.sort((a, z) => a.name.localeCompare(z.name));
    res.json(graphs);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Get a single graph by name. */
app.get("/api/graphs/:name", async (req, res) => {
  await ensureDataDir();
  const name = sanitizeName(req.params.name);
  try {
    const raw = await readFile(join(DATA_DIR, `${name}.json`), "utf8");
    res.json(JSON.parse(raw));
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

/** Save (create or update) a graph. Body: { name, data } */
app.post("/api/graphs", async (req, res) => {
  const { name, data } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Missing name" });
  }
  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "Missing data" });
  }
  await ensureDataDir();
  const safe = sanitizeName(name);
  try {
    await writeFile(join(DATA_DIR, `${safe}.json`), JSON.stringify(data, null, 2), "utf8");
    res.json({ name: safe, ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Delete a graph by name. */
app.delete("/api/graphs/:name", async (req, res) => {
  await ensureDataDir();
  const name = sanitizeName(req.params.name);
  try {
    await unlink(join(DATA_DIR, `${name}.json`));
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

function sanitizeName(name) {
  return name.replace(/[\/\\:*?"<>|]/g, "_").slice(0, 100);
}

// Serve Vite build
app.use(express.static(DIST_DIR));
app.use((_req, res) => {
  res.sendFile(join(DIST_DIR, "index.html"), err => {
    if (err) res.status(404).json({ error: "Not found" });
  });
});

ensureDataDir().then(() => {
  http.createServer(app).listen(PORT, () => {
    console.log(`Vibe Architect server on http://localhost:${PORT}`);
    console.log(`Graphs stored in ${DATA_DIR}`);
  });
});
