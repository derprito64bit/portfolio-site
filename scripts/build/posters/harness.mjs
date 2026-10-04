// harness.mjs (W-C13): what render.mjs and the poster parity check share: the stage tokens, a static server for
// the repo, a muted Chrome on the real GPU, and one call that runs page.html in a given mode.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** tokens.stage (fovDeg, poses) from content/tokens.json once W-F has moved it there, else docs/agents/tokens.json. */
export function stageTokens() {
  const file = ["content/tokens.json", "docs/agents/tokens.json"].map((f) => join(repo, f)).find(existsSync);
  const { stage } = JSON.parse(readFileSync(file, "utf8"));
  const poses = Object.fromEntries(Object.entries(stage.poses).filter(([, p]) => typeof p === "object"));
  return { file, fovDeg: stage.fovDeg, poses };
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".glb": "model/gltf-binary", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif" };

/** Serves the repo root (plus any extra roots mounted under /x/<name>/) on an ephemeral port. */
export function serve(mounts = {}) {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let root = repo;
    const m = path.match(/^\/x\/([^/]+)(\/.*)$/);
    if (m && mounts[m[1]]) { root = mounts[m[1]]; path = m[2]; }
    const file = normalize(join(root, path));
    if (!file.startsWith(normalize(root)) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    const body = readFileSync(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "content-length": body.length, "cache-control": "no-store" });
    res.end(body);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

/** Chrome (the installed channel, like the agents' playwright-cli config), muted, on the GPU. */
export function launch({ headed = false } = {}) {
  return chromium.launch({
    channel: "chrome",
    headless: !headed,
    args: ["--mute-audio", "--autoplay-policy=user-gesture-required"], // as the agents' playwright-cli config (muted)
  });
}

export const SOFTWARE = /SwiftShader|llvmpipe|softpipe|Basic Render|Software/i;

/** Opens page.html with the given query in a fresh page of `context`, waits for window.__done, returns it. */
export async function runPage(context, origin, query, { keep = false } = {}) {
  const page = await context.newPage();
  const errors = [], aborted = [], finished = new Set();
  page.on("console", (m) => (m.type() === "error" || /\b(error|exception|GL_INVALID|CONTEXT_LOST)\b/i.test(m.text())) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
  page.on("requestfinished", (r) => finished.add(r.url()));
  page.on("requestfailed", (r) => (r.failure()?.errorText === "net::ERR_ABORTED" ? aborted : errors)
    .push({ url: r.url(), text: `request failed ${r.url()} ${r.failure()?.errorText}` }));
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  await page.goto(`${origin}/scripts/build/posters/page.html?${qs}`);
  await page.waitForFunction(() => window.__done !== undefined, null, { timeout: 60_000 });
  const done = await page.evaluate(() => window.__done);
  if (done.error) throw new Error(done.error);
  // Chrome intermittently reports an aborted request for a GLB the page did load (m1 saw the same with chunked
  // replies; m2 still sees it with Content-Length). The page sets __done only after its loads resolved, so with no
  // done.error an abort is noise: it is logged, not fatal. Every other failure, HTTP error or console error is.
  for (const a of aborted) console.warn(`${a.text} (page completed; finished events: ${finished.has(a.url)})`);
  if (errors.length) throw new Error(`console errors: ${errors.map((e) => e.text ?? e).join(" | ")}`);
  if (!keep) await page.close();
  return keep ? { done, page } : done;
}
