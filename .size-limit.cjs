// size-limit budgets (docs/agents/budgets.md, budgets-v2 "bytesGz"), computed from the client chunk graph that
// astro.config.mjs writes after a build (Vite-manifest shape) and the module scripts each built page loads. The groups
// are scripts/check/size-groups.cjs; every limit comes from the json budgets block (scripts/check/budgets.cjs), never a
// literal. Run `npm run build` first; `npm run size` fails loudly when a group is over.
//   critical JS   per page: the static closure of the page's module scripts            bytesGz.criticalJs
//   engine        what the critical chunks load lazily (OGL, the engine, the scenes)    bytesGz.engine
//   total JS      critical plus engine: `/` is totalJsHome, every other page totalJsProject
//   CSS           the page's stylesheets, inlined <style> blocks included                bytesGz.css
//   HTML          the document itself, inlined CSS included: `/` is htmlHome, others htmlProject
// PORTFOLIO_DIST and PORTFOLIO_MANIFEST point the same checks at another build (the negative controls use them).
const { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } = require('node:fs');
const { join, relative } = require('node:path');
const { budget, readBudgets } = require('./scripts/check/budgets.cjs');
const { pageScripts, sizeGroups } = require('./scripts/check/size-groups.cjs');

const DIST = process.env.PORTFOLIO_DIST || join(__dirname, 'dist');
const MANIFEST = process.env.PORTFOLIO_MANIFEST || join(__dirname, 'node_modules/.cache/portfolio-build/vite-manifest.json');
if (!existsSync(MANIFEST)) throw new Error('size-limit: no chunk manifest; run `npm run build` first');
if (!existsSync(DIST)) throw new Error(`size-limit: no build at ${DIST}; run \`npm run build\` first`);
const chunks = Object.values(JSON.parse(readFileSync(MANIFEST, 'utf8')));
const groups = sizeGroups(chunks, pageScripts(DIST));
const b = readBudgets();
const limit = (path) => `${budget(`site.bytesGz.${path}`, b)} B`;
const abs = (files) => files.map((f) => join(DIST, f));
const common = { gzip: true, brotli: false };

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const pageName = (file) => `/${relative(DIST, file).replaceAll('\\', '/')}`.replace(/index\.html$/, '');

// CSS: stylesheet files plus the inlined <style> blocks of each page, gathered into one scratch file per page.
const scratch = join(__dirname, 'node_modules/.cache/portfolio-build/css');
mkdirSync(scratch, { recursive: true });
const cssRows = [];
for (const html of walk(DIST).filter((f) => f.endsWith('.html'))) {
  const text = readFileSync(html, 'utf8');
  const inline = [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const linked = [...text.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="\/?([^"]+)"/g)].map((m) => join(DIST, m[1])).filter(existsSync);
  const file = join(scratch, `${pageName(html).replace(/[^a-z0-9]+/gi, '_')}.css`);
  writeFileSync(file, inline.join('\n'));
  if (inline.length || linked.length) cssRows.push({ name: `CSS (${pageName(html)})`, path: [file, ...linked], limit: limit('css'), ...common });
}

module.exports = [
  ...groups.flatMap((g) => [
    { name: `critical JS (${g.page})`, path: abs(g.critical), limit: limit('criticalJs'), ...common },
    ...(g.engine.length ? [{ name: `engine (${g.page})`, path: abs(g.engine), limit: limit('engine'), ...common }] : []),
    { name: `total JS (${g.page})`, path: abs(g.total), limit: limit(g.page === '/' ? 'totalJsHome' : 'totalJsProject'), ...common },
  ]),
  ...cssRows,
  ...walk(DIST)
    .filter((f) => f.endsWith('.html'))
    .map((f) => ({ name: `HTML (${pageName(f)})`, path: [f], limit: limit(pageName(f) === '/' ? 'htmlHome' : 'htmlProject'), ...common })),
];
