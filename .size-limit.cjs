// size-limit budgets (docs/agents/budgets.md), computed from the client chunk graph that astro.config.mjs writes after
// a build (Vite-manifest shape) and the module scripts each built page loads. The groups are scripts/check/
// size-groups.cjs; every limit comes from the json budgets block (scripts/check/budgets.cjs), never a literal.
// Run `npm run build` first; `npm run size` fails loudly when a group is over.
//   pre-GL JS     per page: the static closure of the page's module scripts            site.preGlJsKbGz
//   GL chunk      three, anime, stage GL, src/gl (camera, effects), minus pre-GL/bench   site.glChunkKbGz
//   effects       chunks holding src/gl/effects/**                                      site.effectsKbGz
//   Lenis         the full-tier feel layer: reported, no budget in budgets.md
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { budget, readBudgets } = require('./scripts/check/budgets.cjs');
const { pageScripts, sizeGroups } = require('./scripts/check/size-groups.cjs');

const file = join(__dirname, 'node_modules/.cache/portfolio-build/vite-manifest.json');
if (!existsSync(file)) throw new Error('size-limit: no chunk manifest; run `npm run build` first');
const chunks = Object.values(JSON.parse(readFileSync(file, 'utf8')));
const groups = sizeGroups(chunks, pageScripts(join(__dirname, 'dist')));
const b = readBudgets();
const dist = (files) => files.map((f) => `dist/${f}`);
const kB = (path) => `${budget(path, b)} kB`;

const common = { gzip: true, brotli: false };
module.exports = [
  ...groups.preGL.map((g) => ({ name: `pre-GL JS (${g.name})`, path: dist(g.files), limit: kB('site.preGlJsKbGz'), ...common })),
  { name: 'GL chunk (three, anime, stage GL, camera, effects)', path: dist(groups.gl), limit: kB('site.glChunkKbGz'), ...common },
  ...(groups.effects.length ? [{ name: 'effects', path: dist(groups.effects), limit: kB('site.effectsKbGz'), ...common }] : []),
  ...(groups.lenis.length ? [{ name: 'Lenis (full tier only; reported, no budget)', path: dist(groups.lenis), ...common }] : []),
];
