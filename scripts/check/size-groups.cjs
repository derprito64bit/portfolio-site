// The chunk groups .size-limit.cjs measures (budgets.md, budgets-v2 "bytesGz"), as a pure function of the client chunk
// graph (the Vite-manifest shape astro.config.mjs writes) and the module scripts each built page loads. Kept apart from
// the size-limit config so tests/w-f/size-groups.test.mjs can feed it planted graphs.
//   critical  per page: the static closure of the module scripts the page loads (what runs before anything is lazy).
//   engine    per page: every chunk the critical chunks reach by dynamic import (and what those import), minus critical.
//             The WebGL engine, its shaders and the scenes load this way, after first paint.
//   total     critical plus engine.
// Cross-check: a chunk holding the engine (node_modules/ogl/ or src/evf/gl/) must be in engine, never in critical,
// or the groups throw. So the engine cannot slide onto the critical path unnoticed.
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const ENGINE_PREFIXES = ['node_modules/ogl/', 'src/evf/gl/'];

/** The module scripts each built page loads: [{ page, scripts: ['_astro/x.js', ...] }]. */
function pageScripts(distDir) {
  const out = [];
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  if (!existsSync(distDir)) return out;
  for (const file of walk(distDir).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    const scripts = new Set();
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (!/\btype="module"/.test(m[1])) continue;
      const src = /\bsrc="\/?([^"]+)"/.exec(m[1]);
      if (src) scripts.add(src[1]);
      for (const imp of m[2].matchAll(/\bimport\s*(?:[^'"]*?from\s*)?["']\/?(_astro\/[^"']+)["']/g)) scripts.add(imp[1]);
    }
    const page = `/${relative(distDir, file).replaceAll('\\', '/')}`.replace(/index\.html$/, '');
    out.push({ page, scripts: [...scripts] });
  }
  return out.sort((a, b) => a.page.localeCompare(b.page));
}

/** @returns {{ page: string, critical: string[], engine: string[], total: string[] }[]} one record per page that loads script */
function sizeGroups(chunks, pages) {
  const byFile = new Map(chunks.map((c) => [c.file, c]));
  const holdsEngine = (c) => c.modules.some((m) => ENGINE_PREFIXES.some((p) => m.startsWith(p)));
  const reach = (start, edges, skip = new Set()) => {
    const out = new Set();
    const visit = (f) => {
      if (out.has(f) || skip.has(f) || !byFile.has(f)) return;
      out.add(f);
      for (const i of edges(byFile.get(f))) visit(i);
    };
    start.forEach(visit);
    return out;
  };
  const loaded = pages.filter((p) => p.scripts.some((f) => byFile.has(f)));
  if (!loaded.length) throw new Error('size-limit: no built page loads a client script (is the chunk manifest from this build?)');
  const engineChunks = chunks.filter(holdsEngine).map((c) => c.file);
  return loaded.map((p) => {
    const critical = reach(p.scripts, (c) => c.imports ?? []);
    const lazy = reach([...critical].flatMap((f) => byFile.get(f).dynamicImports ?? []), (c) => [...(c.imports ?? []), ...(c.dynamicImports ?? [])], critical);
    const onCritical = [...critical].filter((f) => holdsEngine(byFile.get(f)));
    if (onCritical.length) throw new Error(`size-limit: engine code is on the critical path of ${p.page}: ${onCritical.join(', ')}`);
    const missed = engineChunks.filter((f) => !lazy.has(f));
    if (missed.length && p.page === '/') throw new Error(`size-limit: engine chunks not reached from the home page's critical chunks: ${missed.join(', ')}`);
    return { page: p.page, critical: [...critical].sort(), engine: [...lazy].sort(), total: [...critical, ...lazy].sort() };
  });
}

module.exports = { sizeGroups, pageScripts, ENGINE_PREFIXES };
