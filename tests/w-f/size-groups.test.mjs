// size-limit groups (W-V0a): GPU-free, `node --test tests/w-f/size-groups.test.mjs`.
// Part 1 feeds scripts/check/size-groups.cjs planted chunk graphs. Part 2 is the negative control of the HTML `/` row:
// the real .size-limit.cjs runs against a scratch copy of the build whose index.html is inflated past the cap, and
// size-limit must exit non-zero on exactly that row; the untouched copy must pass. Needs a build (npm run build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(import.meta.dirname, '../..');
const { sizeGroups } = require('../../scripts/check/size-groups.cjs');
const { budget, readBudgets } = require('../../scripts/check/budgets.cjs');

const chunk = (file, modules, imports = [], extra = {}) => ({ file, modules, imports, dynamicImports: [], isEntry: false, isDynamicEntry: false, ...extra });

// The shape of the real build: one entry (main.ts, gsap), a lazy engine chunk (OGL, engine, shaders) and a lazy scenes chunk.
const real = [
  chunk('_astro/main.js', ['src/evf/main.ts', 'node_modules/gsap/gsap-core.js'], [], { isEntry: true, dynamicImports: ['_astro/engine.js', '_astro/scenes.js'] }),
  chunk('_astro/engine.js', ['src/evf/gl/engine.ts', 'node_modules/ogl/src/core/Renderer.js'], [], { isDynamicEntry: true }),
  chunk('_astro/scenes.js', ['src/evf/scenes.ts'], [], { isDynamicEntry: true }),
];
const pages = [
  { page: '/', scripts: ['_astro/main.js'] },
  { page: '/404.html', scripts: [] },
];

test('critical is the static closure of the page scripts; engine is what it loads lazily; total is both', () => {
  const [home, ...rest] = sizeGroups(real, pages);
  assert.equal(rest.length, 0, 'a page without script has no row');
  assert.equal(home.page, '/');
  assert.deepEqual(home.critical, ['_astro/main.js']);
  assert.deepEqual(home.engine, ['_astro/engine.js', '_astro/scenes.js']);
  assert.deepEqual(home.total, ['_astro/engine.js', '_astro/main.js', '_astro/scenes.js']);
});

test('a shared chunk both entries import is critical, not engine', () => {
  const g = [
    chunk('_astro/a.js', ['src/evf/main.ts'], ['_astro/shared.js'], { isEntry: true, dynamicImports: ['_astro/engine.js'] }),
    chunk('_astro/shared.js', ['node_modules/gsap/gsap-core.js']),
    chunk('_astro/engine.js', ['node_modules/ogl/src/core/Renderer.js'], ['_astro/shared.js'], { isDynamicEntry: true }),
  ];
  const [home] = sizeGroups(g, [{ page: '/', scripts: ['_astro/a.js'] }]);
  assert.deepEqual(home.critical, ['_astro/a.js', '_astro/shared.js']);
  assert.deepEqual(home.engine, ['_astro/engine.js']);
});

test('negative control: engine code on the critical path throws', () => {
  const g = [chunk('_astro/main.js', ['src/evf/main.ts', 'node_modules/ogl/src/core/Renderer.js'], [], { isEntry: true })];
  assert.throws(() => sizeGroups(g, [{ page: '/', scripts: ['_astro/main.js'] }]), /engine code is on the critical path/);
});

test('negative control: an engine chunk the home page never loads throws', () => {
  const g = [...real, chunk('_astro/orphan.js', ['src/evf/gl/extra.ts'], [], { isDynamicEntry: true })];
  assert.throws(() => sizeGroups(g, pages), /engine chunks not reached/);
});

test('negative control: no page loading a client script throws', () => {
  assert.throws(() => sizeGroups(real, [{ page: '/', scripts: [] }]), /no built page loads a client script/);
});

// ---- the HTML `/` row, against the real build
const DIST = join(ROOT, 'dist');
const MANIFEST = join(ROOT, 'node_modules/.cache/portfolio-build/vite-manifest.json');
const built = existsSync(join(DIST, 'index.html')) && existsSync(MANIFEST);

function sizeLimit(dist) {
  const r = spawnSync(process.execPath, [join(ROOT, 'node_modules/size-limit/bin.js'), '--json'], {
    cwd: ROOT,
    env: { ...process.env, PORTFOLIO_DIST: dist, PORTFOLIO_MANIFEST: MANIFEST },
    encoding: 'utf8',
  });
  let rows = [];
  try { rows = JSON.parse(r.stdout); } catch { /* the failure is in stderr */ }
  return { code: r.status, rows, err: r.stderr };
}

test('HTML `/` row: the untouched build passes; an inflated index.html fails exactly that row (negative control)', { skip: !built && 'needs npm run build' }, () => {
  const cap = budget('site.bytesGz.htmlHome', readBudgets());
  const dir = mkdtempSync(join(tmpdir(), 'size-html-'));
  try {
    cpSync(DIST, dir, { recursive: true });
    const ok = sizeLimit(dir);
    assert.equal(ok.code, 0, `the untouched copy passes: ${ok.err}`);
    // Incompressible padding in a comment: the gzip size of index.html lands above the cap.
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    writeFileSync(join(dir, 'index.html'), `${html}<!-- ${randomBytes(cap).toString('base64')} -->`);
    const bad = sizeLimit(dir);
    assert.notEqual(bad.code, 0, 'the inflated copy fails');
    const failed = bad.rows.filter((r) => r.passed === false).map((r) => r.name);
    assert.deepEqual(failed, ['HTML (/)']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
