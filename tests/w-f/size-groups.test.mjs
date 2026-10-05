// size-limit chunk groups (#54 items 1 and 5): GPU-free, `node --test tests/w-f/size-groups.test.mjs`.
// The planted graphs are the shapes the request names: the stage modules moved into a shared chunk because a
// component script imports src/stage (item 1), and the camera and develop chunks that sit outside src/stage/gl's
// closure (item 5). preFixPreGL is the rule .size-limit.cjs used before (main at 5955491), kept to show the planted
// graph is the one that broke it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sizeGroups } = require('../../scripts/check/size-groups.cjs');

const chunk = (file, modules, imports = [], extra = {}) => ({ file, modules, imports, dynamicImports: [], isEntry: false, isDynamicEntry: false, ...extra });

/** Before #54: the pre-GL entry was the entry chunk that itself holds src/stage/index.ts. */
function preFixPreGL(chunks) {
  const entries = chunks.filter((c) => c.isEntry && c.modules.some((m) => m.startsWith('src/stage/index.ts')));
  if (!entries.length) throw new Error('size-limit: no client entry holds src/stage/index.ts');
  return entries.map((c) => c.file);
}

// Rolldown's shape when hero.ts imports src/stage: the stage is a shared chunk both entries import.
const shared = [
  chunk('_astro/Base.js', ['src/layouts/Base.astro'], ['_astro/stage.js'], { isEntry: true }),
  chunk('_astro/Hero.js', ['src/sections/hero/hero.ts'], ['_astro/stage.js'], { isEntry: true }),
  chunk('_astro/stage.js', ['src/stage/index.ts', 'src/stage/ticker.ts', 'node_modules/swup/dist/Swup.modern.js'], ['_astro/tier.js']),
  chunk('_astro/tier.js', ['src/stage/tier.ts', 'src/stage/state.ts']),
  chunk('_astro/gl.js', ['src/stage/gl/index.ts', 'node_modules/animejs/dist/modules/engine/engine.js'], ['_astro/stage.js', '_astro/three.js'], { isDynamicEntry: true }),
  chunk('_astro/three.js', ['node_modules/three/build/three.module.js']),
  chunk('_astro/camera.js', ['src/gl/camera/index.ts', 'node_modules/three/examples/jsm/loaders/GLTFLoader.js'], ['_astro/three.js'], { isDynamicEntry: true }),
  chunk('_astro/develop.js', ['src/gl/effects/develop/index.ts'], ['_astro/three.js'], { isDynamicEntry: true }),
  chunk('_astro/bench-stage.js', ['src/stage/gl/bench.ts'], ['_astro/gl.js'], { isDynamicEntry: true }),
  chunk('_astro/fixtures.js', ['src/stage/gl/fixtures.ts'], ['_astro/gl.js'], { isDynamicEntry: true }),
  chunk('_astro/bench-camera.js', ['src/gl/camera/bench.ts'], ['_astro/three.js'], { isDynamicEntry: true }),
  chunk('_astro/lenis.js', ['node_modules/lenis/dist/lenis.mjs', 'src/stage/lenis.ts'], ['_astro/stage.js'], { isDynamicEntry: true }),
];
const pages = [
  { page: '/', scripts: ['_astro/Hero.js', '_astro/Base.js'] },
  { page: '/work/project-01/', scripts: ['_astro/Base.js'] },
  { page: '/404.html', scripts: ['_astro/Base.js'] },
  { page: '/work/', scripts: [] },
];

test('planted: the pre-fix rule throws when the stage moves into a shared chunk (the failure #54 item 1 reports)', () => {
  assert.throws(() => preFixPreGL(shared), /no client entry holds src\/stage\/index\.ts/);
});

test('pre-GL is found by closure: the stage entry reaches src/stage/index.ts through the shared chunk', () => {
  const g = sizeGroups(shared, pages);
  assert.deepEqual(g.stageEntries, ['_astro/Base.js', '_astro/Hero.js']);
});

test('pre-GL per page: the home page counts every entry it loads (the hero entry too); other pages only theirs', () => {
  const g = sizeGroups(shared, pages);
  const home = g.preGL.find((x) => x.pages.includes('/'));
  const project = g.preGL.find((x) => x.pages.includes('/work/project-01/'));
  assert.deepEqual(home.files, ['_astro/Base.js', '_astro/Hero.js', '_astro/stage.js', '_astro/tier.js']);
  assert.deepEqual(project.files, ['_astro/Base.js', '_astro/stage.js', '_astro/tier.js']);
  assert.deepEqual(project.pages, ['/work/project-01/', '/404.html']);
  assert.equal(g.preGL.length, 2, 'a page without scripts (the /work/ redirect) makes no group');
});

test('GL group: three, anime, stage GL, the camera and develop; never pre-GL, bench or fixture chunks', () => {
  const g = sizeGroups(shared, pages);
  assert.deepEqual(g.gl, ['_astro/camera.js', '_astro/develop.js', '_astro/gl.js', '_astro/three.js']);
  assert.deepEqual(g.effects, ['_astro/develop.js']);
  assert.deepEqual(g.lenis, ['_astro/lenis.js']);
});

test('planted: a bench module bundled into a real GL chunk still counts (only bench-only chunks are left out)', () => {
  const merged = shared.map((c) => (c.file === '_astro/gl.js' ? { ...c, modules: [...c.modules, 'src/stage/gl/bench.ts'] } : c));
  assert.ok(sizeGroups(merged, pages).gl.includes('_astro/gl.js'));
});

test('planted: no entry reaches the stage at all, which fails loudly', () => {
  const none = shared.map((c) => (c.file === '_astro/stage.js' ? { ...c, modules: ['src/stage/ticker.ts'] } : c));
  assert.throws(() => sizeGroups(none, pages), /no client entry reaches src\/stage\/index\.ts/);
});

test('planted: no built page loads the stage entry, which fails loudly', () => {
  assert.throws(() => sizeGroups(shared, [{ page: '/x/', scripts: ['_astro/lenis.js'] }]), /no built page loads the entry/);
});

test('without page data every entry is counted together (an upper bound for any page)', () => {
  const g = sizeGroups(shared, []);
  assert.equal(g.preGL.length, 1);
  assert.deepEqual(g.preGL[0].files, ['_astro/Base.js', '_astro/Hero.js', '_astro/stage.js', '_astro/tier.js']);
});
