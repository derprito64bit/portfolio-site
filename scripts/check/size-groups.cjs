// The chunk groups .size-limit.cjs measures (budgets.md "JS"), as a pure function of the client chunk graph (the
// Vite-manifest shape astro.config.mjs writes) and the module scripts each built page loads. Kept apart from the
// size-limit config so tests/w-f/size-groups.test.mjs can feed it planted graphs.
//   pre-GL   per page: the static closure of the module scripts the page loads (every entry on a page runs before
//            GL: the stage's, and any component's, such as the hero's). Pages that load the same closure share one
//            group. At least one entry must reach src/stage/index.ts by static imports, wherever Rolldown put the
//            stage modules (#54 item 1: a shared chunk holds them once a component script imports src/stage).
//   GL       what GL boot loads, by closure (round-1 review, Breaker 1.1 #6): from the GL entries (the dynamic entries
//            whose own module is under src/stage/gl/ or src/gl/: the stage's GL, the camera, develop), every chunk
//            they import, statically or dynamically, minus the pre-GL chunks and the /bench/-only chunks (all of
//            whose GL modules are a bench.ts or fixtures.ts), which the closure never enters. So a GL-only helper
//            split into a chunk of its own (src/lib/gl-math.ts, scripts/build/posters/stage.js) still counts.
//            Cross-check: every chunk holding three, anime.js, src/stage/gl/ or src/gl/ (#54 item 5's rule, budgets.md:
//            "three, addons, anime, stage GL, effects"), minus pre-GL and bench-only, must be in the closure, or the
//            groups throw.
//   effects  every chunk holding src/gl/effects/.
//   lenis    every chunk holding node_modules/lenis/ (reported; budgets.md sets no Lenis budget).
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const GL_PREFIXES = ['node_modules/three/', 'node_modules/animejs/', 'src/stage/gl/', 'src/gl/'];
const BENCH_ONLY = /(^|\/)(bench|fixtures)\.ts$/;

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

function sizeGroups(chunks, pages) {
  const byFile = new Map(chunks.map((c) => [c.file, c]));
  const holds = (c, prefix) => c.modules.some((m) => m.startsWith(prefix));
  const closure = (start, skip = new Set()) => {
    const out = new Set();
    const visit = (f) => {
      if (out.has(f) || skip.has(f) || !byFile.has(f)) return;
      out.add(f);
      for (const i of byFile.get(f).imports) visit(i);
    };
    start.forEach(visit);
    return out;
  };

  const entries = chunks.filter((c) => c.isEntry);
  const stageEntries = entries.filter((e) => [...closure([e.file])].some((f) => holds(byFile.get(f), 'src/stage/index.ts')));
  if (!stageEntries.length) throw new Error('size-limit: no client entry reaches src/stage/index.ts through its static imports');

  // Pre-GL per page. Without page data (no dist), every entry together: an upper bound for any page.
  const sets = new Map();
  const loaded = pages.length ? pages : [{ page: '(all entries)', scripts: entries.map((e) => e.file) }];
  for (const p of loaded) {
    const known = p.scripts.filter((f) => byFile.has(f));
    if (!known.length) continue; // a page without scripts (the /work/ redirect)
    const files = [...closure(known)].sort();
    const key = files.join('|');
    if (!sets.has(key)) sets.set(key, { pages: [], files });
    sets.get(key).pages.push(p.page);
  }
  const stageLoaded = [...sets.values()].some((s) => stageEntries.some((e) => s.files.includes(e.file)));
  if (!stageLoaded) throw new Error('size-limit: no built page loads the entry that reaches src/stage/index.ts');
  const preGL = [...sets.values()].map((s) => ({ name: s.pages.length > 1 ? `${s.pages[0]} and ${s.pages.length - 1} more` : s.pages[0], pages: s.pages, files: s.files }));
  const preGLAll = new Set(preGL.flatMap((g) => g.files));

  const glModule = (m) => GL_PREFIXES.some((p) => m.startsWith(p));
  const benchOnly = (c) => c.modules.some(glModule) && c.modules.filter(glModule).every((m) => BENCH_ONLY.test(m));
  // The GL entries: dynamic entries whose own module (src; else every GL module in them) is stage GL or src/gl.
  const glSrc = /^src\/(stage\/gl|gl)\//;
  const glEntry = (c) => c.isDynamicEntry && !benchOnly(c) && (c.src ? glSrc.test(c.src) && !BENCH_ONLY.test(c.src) : c.modules.some((m) => glSrc.test(m)));
  const roots = chunks.filter(glEntry).map((c) => c.file).sort();
  if (!roots.length) throw new Error('size-limit: no GL entry (a dynamic entry under src/stage/gl/ or src/gl/)');
  const skip = new Set([...preGLAll, ...chunks.filter(benchOnly).map((c) => c.file)]);
  const reach = new Set();
  const visit = (f) => {
    if (reach.has(f) || skip.has(f) || !byFile.has(f)) return;
    reach.add(f);
    const c = byFile.get(f);
    for (const i of [...(c.imports ?? []), ...(c.dynamicImports ?? [])]) visit(i);
  };
  roots.forEach(visit);
  const gl = [...reach].sort();
  // Cross-check by module path (the rule #54 item 5 proposed): a GL chunk the closure misses fails loudly.
  const byPath = chunks.filter((c) => !preGLAll.has(c.file) && c.modules.some(glModule) && !benchOnly(c)).map((c) => c.file);
  const missed = byPath.filter((f) => !reach.has(f));
  if (missed.length) throw new Error(`size-limit: GL chunks not reached from a GL entry: ${missed.join(', ')}`);
  const glByClosureOnly = gl.filter((f) => !byPath.includes(f));
  const effects = chunks.filter((c) => holds(c, 'src/gl/effects/')).map((c) => c.file).sort();
  const lenis = chunks.filter((c) => holds(c, 'node_modules/lenis/')).map((c) => c.file).sort();
  return { preGL, gl, glRoots: roots, glByClosureOnly, effects, lenis, stageEntries: stageEntries.map((e) => e.file) };
}

module.exports = { sizeGroups, pageScripts, GL_PREFIXES, BENCH_ONLY };
