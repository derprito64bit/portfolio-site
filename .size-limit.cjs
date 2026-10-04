// size-limit budgets (budgets.md), computed from the client chunk graph that astro.config.mjs writes after a build
// (Vite-manifest shape). Run `npm run build` first; `npm run size` fails loudly when a chunk group is over.
//   pre-GL JS     the stage entry and its static imports                     <= 35 kB gz
//   GL chunk      src/stage/gl/index.ts and its static imports, minus pre-GL  <= 185 kB gz
//   effects       chunks holding src/gl/effects/** (once W-S1/W-C2 land them) <= 10 kB gz
//   Lenis         the full-tier feel layer                                     <= 6 kB gz (5.4 documented)
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const file = join(__dirname, 'node_modules/.cache/portfolio-build/vite-manifest.json');
if (!existsSync(file)) throw new Error('size-limit: no chunk manifest; run `npm run build` first');
const chunks = Object.values(JSON.parse(readFileSync(file, 'utf8')));
const byFile = new Map(chunks.map((c) => [c.file, c]));

function closure(start, skip = new Set()) {
  const out = new Set();
  const visit = (f) => {
    if (out.has(f) || skip.has(f) || !byFile.has(f)) return;
    out.add(f);
    for (const i of byFile.get(f).imports) visit(i);
  };
  start.forEach(visit);
  return out;
}
const holds = (c, prefix) => c.modules.some((m) => m.startsWith(prefix));
const dist = (set) => [...set].map((f) => `dist/${f}`);

const entries = chunks.filter((c) => c.isEntry && holds(c, 'src/stage/index.ts'));
if (!entries.length) throw new Error('size-limit: no client entry holds src/stage/index.ts');
const preGL = closure(entries.map((c) => c.file));
const glEntry = chunks.find((c) => c.isDynamicEntry && holds(c, 'src/stage/gl/index.ts'));
if (!glEntry) throw new Error('size-limit: no dynamic chunk holds src/stage/gl/index.ts');
const gl = closure([glEntry.file], preGL);
const effects = new Set(chunks.filter((c) => holds(c, 'src/gl/effects/')).map((c) => c.file));
const lenis = chunks.filter((c) => holds(c, 'node_modules/lenis/')).map((c) => c.file);

const common = { gzip: true, brotli: false };
module.exports = [
  { name: 'pre-GL JS (stage, router, a11y)', path: dist(preGL), limit: '35 kB', ...common },
  { name: 'GL chunk (three, anime engine, stage GL)', path: dist(gl), limit: '185 kB', ...common },
  ...(effects.size ? [{ name: 'effects', path: dist(effects), limit: '10 kB', ...common }] : []),
  ...(lenis.length ? [{ name: 'Lenis (full tier only)', path: lenis.map((f) => `dist/${f}`), limit: '6 kB', ...common }] : []),
];
