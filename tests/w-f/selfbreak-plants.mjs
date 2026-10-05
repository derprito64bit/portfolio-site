// Negative controls for tests/w-f/selfbreak.mjs (round-1 review: Breakers 1.1 #3, 1.2 #3 and 1.3 #3). Each plant breaks
// exactly what one self-break case claims, in a scratch copy of the built dist (in the OS temp folder, never committed);
// the case must fail on it in D2 and WK-P2 (G in Chromium only: Playwright's WebKit never restores from its page
// cache). Plants A to F are the breakers' plant-sb.mjs and plant-sb3.mjs; G is Breaker 1.1's bfcache plant.
// Usage: node tests/w-f/selfbreak-plants.mjs [--out selfbreak-plants.json] [--only A,G]
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, cliMain } from '../harness/lib.mjs';

const keepAwake = 'const f = () => { window.__stage && window.__stage.invalidate(); requestAnimationFrame(f); }; requestAnimationFrame(f);';
export const PLANTS = {
  A: { case: 'resize', pages: ['bench/index.html'], why: 'after any resize the canvas CSS height is pushed 0.37 px off its buffer grid', code: "addEventListener('resize', () => setTimeout(() => { const c = document.getElementById('gl'); if (c && c.style.blockSize) c.style.blockSize = (parseFloat(c.style.blockSize) + 0.37) + 'px'; }, 0));" },
  B: { case: 'history', pages: ['index.html', 'work/project-02/index.html'], why: 'a popstate starts a second rAF chain that invalidates forever (a duplicate ticker)', code: `addEventListener('popstate', () => { if (window.__b2loop) return; window.__b2loop = true; ${keepAwake} });` },
  C: { case: 'rapid', pages: ['bench/index.html'], why: 'a second click on a print within 1 s throws', code: "(() => { let last = 0; document.addEventListener('click', (e) => { if (!e.target.closest('[data-gl-id]')) return; const t = performance.now(); const quick = t - last < 1000; last = t; if (quick) throw new Error('planted: a second print click within 1 s throws'); }, true); })();" },
  D: { case: 'tierDrop', pages: ['bench/index.html'], why: 'after a demotion to static a second rAF chain keeps the ticker awake', code: `(() => { const h = document.documentElement; new MutationObserver(() => { if (h.dataset.tier === 'static' && !window.__planD) { window.__planD = true; ${keepAwake} } }).observe(h, { attributes: true, attributeFilter: ['data-tier'] }); })();` },
  E: { case: 'reduced', pages: ['bench/index.html'], why: 'once reduced motion turns on, the stage is kept awake', code: `(() => { const mq = matchMedia('(prefers-reduced-motion: reduce)'); mq.addEventListener('change', () => { if (mq.matches && !window.__planE) { window.__planE = true; ${keepAwake} } }); })();` },
  F: { case: 'rest', pages: ['bench/index.html'], why: 'the first press or scroll after a 2 s rest throws', code: "(() => { let asleepSince = null; setInterval(() => { const s = window.__stage; if (!s) return; if (s.settled) { if (asleepSince === null) asleepSince = performance.now(); } else asleepSince = null; }, 50); const act = () => { if (asleepSince !== null && performance.now() - asleepSince >= 2000) throw new Error('planted: the first press or scroll after a rest breaks the stage'); }; addEventListener('scroll', act, { passive: true }); addEventListener('pointerdown', act, true); })();" },
  G: { case: 'history', pages: ['bench/index.html'], why: 'a bfcache restore throws (pageshow persisted)', code: "addEventListener('pageshow', (e) => { if (e.persisted) setTimeout(() => { throw new Error('planted: a bfcache restore breaks the page'); }, 0); });", chromiumOnly: true },
};

export async function run(opts = {}) {
  const only = opts.only ? new Set(String(opts.only).split(',')) : null;
  const scratch = mkdtempSync(join(tmpdir(), 'selfbreak-plants-'));
  const results = [];
  try {
    for (const [id, p] of Object.entries(PLANTS)) {
      if (only && !only.has(id)) continue;
      const dist = join(scratch, `dist-${id}`);
      cpSync(join(ROOT, 'dist'), dist, { recursive: true });
      for (const page of p.pages) {
        const f = join(dist, page);
        writeFileSync(f, readFileSync(f, 'utf8').replace('</body>', `<script data-plant="${id}">${p.code}</script></body>`));
      }
      const file = join(scratch, `selfbreak-${id}.json`);
      spawnSync(process.execPath, ['tests/w-f/selfbreak.mjs', '--dist', dist, '--only', p.case, '--profiles', 'D2,WK-P2', '--out', file], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
      let rows = [];
      try {
        rows = (JSON.parse(readFileSync(file, 'utf8')).rows ?? []).map((x) => ({ profile: x.profile, pass: x.pass, error: x.error ?? null, failures: x.failures ?? x.console?.failures ?? [] }));
      } catch (e) {
        rows = [{ profile: '?', pass: true, error: `no result: ${e.message}` }];
      }
      const caughtOn = rows.filter((x) => !x.pass).map((x) => x.profile);
      const expected = p.chromiumOnly ? ['D2'] : ['D2', 'WK-P2'];
      results.push({ plant: id, case: p.case, why: p.why, rows, caughtOn, expected, caught: expected.every((e) => caughtOn.includes(e)) });
      rmSync(dist, { recursive: true, force: true });
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return { schema: 1, suite: 'w-f/selfbreak-plants', pass: results.length > 0 && results.every((r) => r.caught), results, summary: results.map((r) => `${r.plant} ${r.case} ${r.caught ? 'caught' : 'MISSED'}`).join(', ') };
}

await cliMain(import.meta.url, run);
