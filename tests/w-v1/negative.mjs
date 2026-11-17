#!/usr/bin/env node
// Negative controls for the W-V1 browser rows: each plant is one defect in the source, built into a scratch copy next to
// the worktree (../portfolio-site.wt/_wv1-neg/<id>, node_modules linked), and the spec that guards it runs against that
// build (W_V1_DIST). A plant passes when that spec FAILS on it; the report says which test failed and why.
// Usage: node tests/w-v1/negative.mjs [--only id,id] [--project chromium] [--out <file.json>]
// Afterwards rebuild the worktree (npm run build): the planted builds share the chunk-manifest cache.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SCRATCH = resolve(ROOT, '../_wv1-neg');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);

/** [id, row, file, from, to, spec, grep] */
export const PLANTS = [
  ['prefetch-0', 'A2', 'src/evf/project/inapp.ts', 'export const PREFETCH_MS = 300;', 'export const PREFETCH_MS = 0;', 'open.spec.mjs', 'open from frame 3'],
  ['innerhtml', 'A2', 'src/evf/project/article.ts', 'col.append(...holder.childNodes);', 'col.innerHTML = holder.innerHTML;', 'open.spec.mjs', 'open from frame 3'],
  ['no-back', 'A2', 'src/evf/project/inapp.ts', 'if (pushed) { ownBack = true; history.go(extra ? -2 : -1); }', 'if (false) { ownBack = true; }', 'open.spec.mjs', 'open from frame 3'],
  ['cold-home', 'A2', 'src/evf/project/cold.ts', 'location.replace(homeUrl(workHash(n)));', 'location.replace(homeUrl());', 'open.spec.mjs', 'cold /work/project-06/'],
  ['strip-11px', 'A5', 'src/evf/style/print.css', '.print__n { flex: none; font-family: var(--f-mono); font-size: 12px;', '.print__n { flex: none; font-family: var(--f-mono); font-size: 11px;', 'roll.spec.mjs', 'own aspect'],
  ['width-96', 'A7', 'src/evf/style/print.css', 'width: min(calc(var(--f) * 100%), calc(80svh * var(--ar)));', 'width: min(calc(var(--f) * 96%), calc(80svh * var(--ar)));', 'roll.spec.mjs', '1440 x 900: width'],
  ['no-right-side', 'A7', 'src/evf/style/print.css', ".print[data-side='right'] { align-self: flex-end; }", '', 'roll.spec.mjs', '390 x 844: one column'],
  ['late-expose', 'A8', 'src/evf/project/roll.ts', 'entering.forEach((p, k) => expose(p, (k % 4) * 0.1));', 'entering.forEach((p, k) => expose(p, 1.5 + k));', 'roll.spec.mjs', 'none blank 1.0 s after 50% visible$'],
  ['measure-on-scroll', 'A9', 'src/evf/project/roll.ts', 'const onScroll = () => setFocus(nearest());', 'const onScroll = () => { cache(); setFocus(nearest()); };', 'roll.spec.mjs', 'the print nearest the centre'],
  ['dim-0.7', 'A9', 'src/evf/style/print.css', '.roll[data-dim] .print:not([data-focus]) { opacity: 0.55; }', '.roll[data-dim] .print:not([data-focus]) { opacity: 0.7; }', 'roll.spec.mjs', 'the print nearest the centre'],
  ['no-focus-return', 'A10', 'src/evf/project/playback.ts', 'linkOf(n)?.focus({ preventScroll: true });', 'void linkOf;', 'playback.spec.mjs', 'A10 at 1440'],
  ['no-push', 'A10', 'src/evf/project/playback.ts', "if (push) { history.scrollRestoration = 'manual'; hist.push(printHash(n + 1)); pushed = true; }", 'if (false) { pushed = true; }', 'playback.spec.mjs', 'A10 at 1440'],
  ['three-loops', 'A11', 'src/evf/project/roll.ts', 'export const MAX_PLAYING = 2;', 'export const MAX_PLAYING = 3;', 'roll.spec.mjs', 'two at most'],
  ['loops-when-calm', 'A11', 'src/evf/project/roll.ts', 'const allowed = !held && !reduced() &&', 'const allowed = !held &&', 'roll.spec.mjs', 'reduced motion: no inline play'],
  ['back-36px', 'A12', 'src/evf/style/project.css', 'display: inline-flex; gap: 10px; align-items: center; min-height: 44px;', 'display: inline-flex; gap: 10px; align-items: center; min-height: 36px; max-height: 36px;', 'open.spec.mjs', 'A12 phone'],
  ['calm-brackets-glide', 'A13', 'src/evf/project/roll.ts', 'if (jump || reduced()) { gsap.killTweensOf(box);', 'if (jump) { gsap.killTweensOf(box);', 'playback.spec.mjs', 'reduced motion: a crossfade open'],
  ['sway-stays', 'A14', 'src/evf/main.ts', 'setSway: (on) => { if (engine) engine.sway = on && !calm; },', 'setSway: () => { if (engine) engine.sway = !calm; },', 'idle.spec.mjs', 'A14 in the Viewfinder'],
  // round 2 (the judge's r1 must-fix list): each plant puts one fixed defect back
  ['af-intro-rect', 'A2', 'src/evf/main.ts', '} else coverFor(i);\n  placeAF(sceneToFrac(subjectOf(s), rect));\n  syncDist();',
    '} else coverFor(i);\n  const was = engine?.st.rect;\n  if (engine) engine.st.rect = { x: 0, y: 0, w: innerWidth, h: innerHeight };\n  placeAF(sceneToFrac(subjectOf(s), rect));\n  if (engine && was) engine.st.rect = was;\n  syncDist();', 'landing.spec.mjs', 'landing with GL'],
  ['no-flat-cover', 'A13', 'src/evf/project/inapp.ts', '} else h.cover(to);', '}', 'open.spec.mjs', 'tint cover follows'],
  ['counter-stale', 'A9', 'src/evf/project/roll.ts', 'if (!o.counter) return;', 'if (!o.counter || n < 0) return;', 'open.spec.mjs', 'HUD counter never'],
  ['pb-rewrite', 'A10', 'src/evf/project/playback.ts', 'if (cur >= 0 && hist.own()) pushed = true;', '', 'playback.spec.mjs', 'history over playback'],
  ['page-blank', 'J4', 'src/evf/project/playback.ts', 'const g = ghostOf(f);', "const g = document.createElement('i');", 'playback.spec.mjs', 'J4 paging'],
  ['focus-2d', 'J3', 'src/evf/project/roll.ts', 'const d = gap > 0 ? 1e6 + gap : Math.abs(r.y + r.h / 2 - cy) + X_WEIGHT * Math.abs(r.x + r.w / 2 - cx);', 'const d = Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy);', 'roll.spec.mjs', 'centre line leads'],
  ['touch-dims', 'A9', 'src/evf/project/roll.ts', 'const dimOn = () => total >= DIM_MIN && fine.matches;', 'const dimOn = () => total >= DIM_MIN;', 'roll.spec.mjs', 'no dim under 4'],
  ['cold-sway', 'A14', 'src/evf/project/cold.ts', 'e.sway = false; // a page to read', 'e.sway = true; // a page to read', 'idle.spec.mjs', 'A14 on a cold'],
  ['no-end-rule', 'J3', 'src/evf/project/roll.ts', 'if (v.top >= scrollMax - 2) {', 'if (false) {', 'roll.spec.mjs', 'centre line leads'],
  // round 3 (the judge's r2 must-fix list and wv1-hover-af)
  ['zoom-layout', 'A7', 'src/evf/project/inapp.ts', 'onUpdate: () => { marksAt(R, box); h.reveal(); } }, 0);', 'onUpdate: () => { writeRect(R); marksAt(R, box); h.reveal(); } }, 0);', 'cls-gl.spec.mjs', 'A7 with GL'],
  ['close-layout', 'A7', 'src/evf/project/inapp.ts', 'onUpdate: () => { marksAt(R, rect); h.reveal(); } }, 0.06);', 'onUpdate: () => { writeRect(R); marksAt(R, rect); h.reveal(); } }, 0.06);', 'cls-gl.spec.mjs', 'A7 with GL'],
  ['opener-evf', 'A2', 'src/evf/project/inapp.ts', "a && a !== evf && evf.contains(a) && a.matches('button, a[href]')", 'a && a !== document.body && evf.contains(a)', 'keys.spec.mjs', 'Close returns focus'],
  ['focus-back', 'A2', 'src/evf/project/inapp.ts', 'col.focus({ preventScroll: true });', "($('[data-close]', proj) as HTMLElement).focus({ preventScroll: true });", 'keys.spec.mjs', 'keys scroll the column'],
  ['trap-off', 'A2', 'src/evf/project/view.ts', "if (e.key !== 'Tab' || !isOpen()) return;", "if (e.key !== 'Tab' || isOpen()) return;", 'keys.spec.mjs', 'keys scroll the column'],
  ['resize-cover', 'A13', 'src/evf/project/inapp.ts', 'if (!e) { coverFill(true); return; }', 'if (!e) return;', 'keys.spec.mjs', 'resize or rotate while open'],
  ['marks-show', 'A2', 'src/evf/project/inapp.ts', "const marksOff = () => { for (const m of marks()) m.style.visibility = 'hidden'; };", 'const marksOff = () => {};', 'keys.spec.mjs', 'resize or rotate while open'],
  ['pb-esc-swallow', 'A10', 'src/evf/project/playback.ts', "if (e.key === 'Escape') { if (cur < 0) return; e.preventDefault();", "if (e.key === 'Escape') { e.preventDefault();", 'playback.spec.mjs', 'Esc, Esc'],
  ['pb-scroll-restore', 'A10', 'src/evf/project/playback.ts', "history.scrollRestoration = 'manual'; hist.push(", 'hist.push(', 'playback.spec.mjs', 'paging 06 to 07'],
  ['pb-failed-glyph', 'A10', 'src/evf/project/playback.ts', "const failed = p.classList.contains('is-failed');", 'const failed = false;', 'playback.spec.mjs', 'failed image opens'],
  ['af-in-grid', 'A7', 'src/evf/project/roll.ts', 'host?.append(af);', 'grid?.append(af);', 'roll.spec.mjs', 'overflow 0 at 1440'],
  ['no-clamp', 'A7', 'src/evf/project/roll.ts', 'const l = Math.max(box.x, BR), r = Math.min(box.x + box.w, maxR);', 'const l = box.x, r = box.x + box.w;', 'roll.spec.mjs', 'overflow 0 at 1440'],
  ['no-hover', 'A9', 'src/evf/project/roll.ts', "if (grid) on(grid, 'pointermove'", "if (!grid) on(grid, 'pointermove'", 'roll.spec.mjs', 'hover to focus'],
  // round 3, CI: the dim's saturation by CSS filter transition again (WPE's compositor crash), and a wrong end state
  ['filter-transition', 'A9', 'src/evf/style/print.css', '.roll[data-dim] .print { transition: opacity var(--step) var(--e-out); }', '.roll[data-dim] .print { transition: opacity var(--step) var(--e-out); }\n.roll[data-dim] .print__img { transition: filter var(--step) var(--e-out); }', 'roll.spec.mjs', 'the print nearest the centre'],
  ['sat-0.5', 'A9', 'src/evf/style/print.css', '.roll[data-dim] .print:not([data-focus]) .print__img { filter: saturate(0.4); }', '.roll[data-dim] .print:not([data-focus]) .print__img { filter: saturate(0.5); }', 'roll.spec.mjs', 'the print nearest the centre'],
  // the Flip's landing, polled rather than read at 700 ms: a Flip that never lands untransformed still fails
  ['flip-short', 'A10', 'src/evf/project/playback.ts', 'gsap.to(frame, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: D.land, ease: E.out });', 'gsap.to(frame, { x: 0, y: 0, scaleX: 0.9, scaleY: 0.9, duration: D.land, ease: E.out });', 'playback.spec.mjs', 'A10 at 1440'],
  // wv1-pb-arrows-focus (judge r3): each plant takes back one part of the fix (4f2deb5's own build fails all these rows)
  ['pb-keys-dialog', 'A10', 'src/evf/project/playback.ts', 'if (cur < 0 || !dlg || e.defaultPrevented) return;', 'if (cur < 0 || !dlg || e.defaultPrevented || !dlg.contains(e.target as Node)) return;', 'playback.spec.mjs', 'cold #print-NN load'],
  ['pb-focus-lost', 'A10', 'src/evf/project/playback.ts', "d.addEventListener('focusout', (e) => { if (cur >= 0 &&", "d.addEventListener('focusout', (e) => { if (false &&", 'playback.spec.mjs', 'cold #print-NN load|typed #print-NN hashes'],
  ['pb-end-handoff', 'A10', 'src/evf/project/playback.ts', '(otherOff ? parts.close : other).focus({ preventScroll: true });', 'void other; void otherOff;', 'playback.spec.mjs', 'to either end'],
  ['pb-tab-out', 'A10', 'src/evf/project/playback.ts', "if (e.key === 'Tab') { tab(e, dlg); return; }", "if (e.key === 'Tab') return;", 'playback.spec.mjs', 'to either end'],
  ['pb-clip-arrows', 'A10', 'src/evf/project/playback.ts', "if ((e.target as Element | null)?.closest?.('video, input, select, textarea')) return;", '', 'playback.spec.mjs', 'cold #print-NN load'],
  // fix-pass B2
  ['meta-nowrap', 'A1', 'src/evf/style/project.css', '.pj__meta .ph { white-space: normal; max-width: 100%; }', '', 'open.spec.mjs', 'A1 meta cells hold'],
];

const SKIP = new Set(['node_modules', 'dist', '.git', 'test-results', '.astro', 'playwright-report']);
function scratch(id) {
  const dir = join(SCRATCH, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !SKIP.has(src.slice(ROOT.length + 1).split(/[\\/]/)[0]) || src === ROOT });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction');
  return dir;
}

const only = opt('--only', '') ? new Set(opt('--only').split(',')) : null;
const project = opt('--project', 'chromium');
const report = [];
for (const [id, row, file, from, to, spec, grep] of PLANTS) {
  if (only && !only.has(id)) continue;
  const dir = scratch(id);
  const f = join(dir, file);
  const src = readFileSync(f, 'utf8');
  if (!src.includes(from)) { report.push({ id, row, ok: false, why: `the planted line is not in ${file}` }); continue; }
  writeFileSync(f, src.replace(from, to));
  const b = spawnSync(process.execPath, [join(dir, 'node_modules/astro/bin/astro.mjs'), 'build'], { cwd: dir, encoding: 'utf8' });
  if (b.status !== 0) { report.push({ id, row, ok: false, why: `planted build failed: ${(b.stderr || b.stdout).slice(-300)}` }); continue; }
  const json = join(dir, 'neg.json');
  const t = spawnSync(process.execPath, [join(ROOT, 'node_modules/@playwright/test/cli.js'), 'test', '-c', 'tests/w-v1/playwright.config.mjs', spec, '-g', grep, `--project=${project}`], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, W_V1_DIST: join(dir, 'dist'), W_V1_JSON: json },
  });
  let failed = [];
  try {
    const r = JSON.parse(readFileSync(json, 'utf8'));
    const walk = (s) => [...(s.specs || []).flatMap((sp) => sp.tests.flatMap((x) => x.results.filter((y) => y.status === 'failed' || y.status === 'timedOut').map((y) => ({ title: sp.title, err: (y.errors?.[0]?.message || '').replace(/\x1b\[[0-9;]*m/g, '').split('\n').slice(0, 3).join(' ') })))), ...(s.suites || []).flatMap(walk)];
    failed = r.suites.flatMap(walk);
  } catch { /* no report */ }
  report.push({ id, row, plant: `${file}: ${from} -> ${to || '(removed)'}`, spec, grep, exit: t.status, ok: t.status !== 0 && failed.length > 0, failed });
  console.log(`${t.status !== 0 && failed.length ? 'CAUGHT' : 'MISSED'}  ${row.padEnd(4)} ${id}: ${failed.map((x) => `${x.title} :: ${x.err.slice(0, 140)}`).join(' | ') || `exit ${t.status}`}`);
  rmSync(dir, { recursive: true, force: true });
}
const out = opt('--out', join(SCRATCH, 'negative.json'));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ schema: 1, project, report }, null, 2)}\n`);
const missed = report.filter((r) => !r.ok);
console.log(missed.length ? `negative: ${missed.length} of ${report.length} plants not caught` : `negative: all ${report.length} plants caught`);
process.exit(missed.length ? 1 : 0);
