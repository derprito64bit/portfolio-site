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
  ['late-expose', 'A8', 'src/evf/project/roll.ts', 'entering.forEach((p, k) => expose(p, (k % 4) * 0.1));', 'entering.forEach((p, k) => expose(p, 1.5 + k));', 'roll.spec.mjs', 'none blank 1.0 s after 50% visible at (1440|390)$'],
  ['measure-on-scroll', 'A9', 'src/evf/project/roll.ts', 'const onScroll = () => setFocus(pick());', 'const onScroll = () => { cache(); setFocus(pick()); };', 'roll.spec.mjs', 'the print nearest the centre'],
  ['dim-0.7', 'A9', 'src/evf/style/print.css', '.roll[data-dim] .print:not([data-focus], .is-failed) .print__frame:not(:has(> .print__box)) { opacity: 0.55; }', '.roll[data-dim] .print:not([data-focus], .is-failed) .print__frame:not(:has(> .print__box)) { opacity: 0.7; }', 'roll.spec.mjs', 'the print nearest the centre'],
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
  ['filter-transition', 'A9', 'src/evf/style/print.css', '.roll[data-dim] .print__frame { transition: opacity var(--step) var(--e-out); }', '.roll[data-dim] .print__frame { transition: opacity var(--step) var(--e-out); }\n.roll[data-dim] .print__img { transition: filter var(--step) var(--e-out); }', 'roll.spec.mjs', 'the print nearest the centre'],
  ['sat-0.5', 'A9', 'src/evf/style/print.css', '.roll[data-dim] .print:not([data-focus]) .print__img { filter: saturate(0.4); }', '.roll[data-dim] .print:not([data-focus]) .print__img { filter: saturate(0.5); }', 'roll.spec.mjs', 'the print nearest the centre'],
  // the Flip's landing, polled rather than read at 700 ms: a Flip that never lands untransformed still fails
  ['flip-short', 'A10', 'src/evf/project/playback.ts', 'gsap.to(frame, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: D.land, ease: E.out });', 'gsap.to(frame, { x: 0, y: 0, scaleX: 0.9, scaleY: 0.9, duration: D.land, ease: E.out });', 'playback.spec.mjs', 'A10 at 1440'],
  // wv1-pb-arrows-focus (judge r3): each plant takes back one part of the fix (4f2deb5's own build fails all these rows)
  ['pb-keys-dialog', 'A10', 'src/evf/project/playback.ts', 'if (cur < 0 || !dlg || e.defaultPrevented) return;', 'if (cur < 0 || !dlg || e.defaultPrevented || !dlg.contains(e.target as Node)) return;', 'playback.spec.mjs', 'cold #print-NN load'],
  ['pb-focus-lost', 'A10', 'src/evf/project/playback.ts', "d.addEventListener('focusout', (e) => { if (cur >= 0 &&", "d.addEventListener('focusout', (e) => { if (false &&", 'playback.spec.mjs', 'cold #print-NN load|typed #print-NN hashes'],
  ['pb-end-handoff', 'A10', 'src/evf/project/playback.ts', "next.setAttribute('aria-disabled', String(n === total - 1));", 'next.toggleAttribute(\'disabled\', n === total - 1);', 'playback.spec.mjs', 'to either end'],
  ['pb-tab-out', 'A10', 'src/evf/project/playback.ts', "if (e.key === 'Tab') { tab(e, dlg); return; }", "if (e.key === 'Tab') return;", 'playback.spec.mjs', 'to either end'],
  ['pb-clip-arrows', 'A10', 'src/evf/project/playback.ts', "if ((e.target as Element | null)?.closest?.('video, input, select, textarea')) return;", '', 'playback.spec.mjs', 'cold #print-NN load'],
  // fix-pass B1 (the roll and the print surface): each plant puts one fixed defect back
  ['dim-strip', 'A9', 'src/evf/style/print.css', '.roll[data-dim] .print:not([data-focus], .is-failed) .print__frame:not(:has(> .print__box)) { opacity: 0.55; }', '.roll[data-dim] .print:not([data-focus]) { opacity: 0.55; }', 'roll.spec.mjs', 'the dim leaves the strip'],
  ['scroll-snaps-af', 'A9', 'src/evf/project/roll.ts', 'if (n === cur) { if (dim && jump) place(n, true); return; }', 'if (n === cur) { if (dim) place(n, true); return; }', 'roll.spec.mjs', 'the brackets glide through'],
  ['cold-lit-first', 'A8', 'src/evf/style/print.css', '.pj-js .roll .print:not(.is-exp) .print__frame { filter', '.pj-js .roll[data-expose] .print:not(.is-exp) .print__frame { filter', 'roll.spec.mjs', 'never steps from lit to dark'],
  ['calm-dim-tie', 'A8', 'src/evf/style/print.css', '.calm.pj-js .roll[data-roll] .print:not(.is-exp) .print__frame', '.calm.pj-js .roll .print:not(.is-exp) .print__frame', 'roll.spec.mjs', 'before its module runs \\(calm\\)'],
  ['no-key-focus', 'A9', 'src/evf/project/roll.ts', "on(grid, 'focusin'", "on(grid, 'focusin-off'", 'roll.spec.mjs', 'keyboard to focus'],
  ['phone-no-expose', 'A8', 'src/evf/project/roll.ts', 'if (!frame) return;', 'if (!frame || innerWidth < 760) return;', 'roll.spec.mjs', 'at 390'],
  ['phone-calm-off', 'A13', 'src/evf/project/roll.ts', "const reduced = () => o.calm || matchMedia('(prefers-reduced-motion: reduce)').matches;", "const reduced = () => (o.calm || matchMedia('(prefers-reduced-motion: reduce)').matches) && innerWidth > 759;", 'roll.spec.mjs', 'reduced: opacity only\\) at 390'],
  ['cls-timer', 'A7', 'src/pages/work/[slug].astro', "addEventListener('error', (e) => {", "setTimeout(() => { if (!d.hasAttribute('data-roll')) d.classList.remove('pj-js'); }, 4000); addEventListener('error', (e) => {", 'roll.spec.mjs', 'slow module'],
  // fix-pass B4
  ['resize-opening', 'A13', 'src/evf/project/inapp.ts', "if (S !== 'open' && S !== 'opening') return;", "if (S !== 'open') return;", 'keys.spec.mjs', 'resize or rotate during the open'],
  // a reference-host plant: only the GL row kills it; with no __vfEngine (no WebGL here) the row skips and this is MISSED
  ['owned-opening', 'A13', 'src/evf/main.ts', "const owned = S === 'open' || S === 'opening';", "const owned = S === 'open';", 'cls-gl.spec.mjs', 'resize or rotate during the open'],
  ['not-parsed-wait', 'A2', 'src/evf/project/inapp.ts', 'if (!ready) { fail(); return; }', 'if (!ready) return;', 'open.spec.mjs', 'not parsed by the landing'],
  ['step-mod-click', 'A2', 'src/evf/project/inapp.ts', 'if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;', '', 'open.spec.mjs', 'a modified click on previous or next'],
  ['cold-back-mod-click', 'A2', 'src/evf/project/cold.ts', 'if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;', '', 'open.spec.mjs', 'a modified click on a cold page'],
  ['cold-restore-auto', 'A10', 'src/evf/project/cold.ts', "history.scrollRestoration = 'auto';", '', 'playback.spec.mjs', 'a reload after playback'],
  // WebKit only (run with --project webkit): Chromium restores from the boot write alone
  ['cold-restore-hide', 'A10', 'src/evf/project/cold.ts', "addEventListener('pagehide', autoRestore);", '', 'playback.spec.mjs', 'a reload after playback'],
  // a reference-host plant (GL in Chromium): with no __vfEngine the row skips and this is MISSED
  ['cold-scroll-dirty', 'J3', 'src/evf/project/cold.ts', 'if (!engine) return;\n  const d = dimAt();', "if (!engine) return;\n  document.body.dataset.d = '1';\n  const d = dimAt();", 'cls-gl.spec.mjs', 'reads the scroll before the roll writes'],
  ['typed-hash-pushed', 'A2', 'src/evf/project/inapp.ts', 'if (history.state == null) pushed = false;', '', 'playback.spec.mjs', 'while the project is open in the Viewfinder, then Esc, Esc'],
  // a reference-host plant (GL): with no __vfEngine the row skips and this is MISSED
  ['readout-double', 'A2', 'src/evf/project/inapp.ts', "fl2.style.visibility = 'hidden';", '', 'cls-gl.spec.mjs', 'one focal-length readout'],
  // fix-pass B2
  ['meta-nowrap', 'A1', 'src/evf/style/project.css', '.pj__meta .ph { white-space: normal; max-width: 100%; }', '', 'open.spec.mjs', 'A1 meta cells hold'],
  ['nojs-gap', 'A1', 'src/evf/style/project.css', '.pj-page:not(.pj-js) .pj__head { min-height: 0; padding-top: 8vh; padding-bottom: 48px; }', '.pj-page:not(.pj-js) .pj__head { min-height: 0; padding-bottom: 48px; }', 'playback.spec.mjs', 'no JS: /work/project-01/ is whole at 390'],
  ['bar-covers-focus', 'A2', 'src/evf/style/project.css', 'html.pj-page { scroll-padding-block: var(--top); }', '', 'keys.spec.mjs', 'focus ring: a print reached by keyboard'],
  ['fc-bar-clear', 'A2', 'src/evf/style/project.css', '.proj__bar, .pj-bar { background-color: Canvas; background-image: none; border-bottom: 1px solid CanvasText; }', '', 'roll.spec.mjs', 'forced colours'],
  ['fc-play-block', 'A5', 'src/evf/style/print.css', '.print__play::after { forced-color-adjust: none; border-color: transparent; border-left-color: CanvasText; }', '', 'roll.spec.mjs', 'forced colours'],
  ['calm-nav-open', 'A13', 'src/evf/style.css', '.evf.is-open .meter, .evf.is-open .calm-nav { visibility: hidden; }', '.evf.is-open .meter { visibility: hidden; }', 'open.spec.mjs', 'Previous and Next hide while'],
  ['skip-31px', 'A12', 'src/evf/style.css', 'font-size: 13px; line-height: 32px; letter-spacing: 0.06em;', 'font-size: 13px; letter-spacing: 0.06em;', 'keys.spec.mjs', 'skip link is a 44 px'],
  // fix-pass B3
  ['pb-clip-plays-on', 'A10', 'src/evf/project/playback.ts', "parts.frame?.querySelector('video')?.pause();", '', 'playback.spec.mjs', 'paused when playback closes'],
  ['pb-clip-drag', 'A10', 'src/evf/project/playback.ts', "if ((e.target as Element | null)?.closest?.('video[controls]')) { sid = -1; return; } ", '', 'playback.spec.mjs', 'keeps its own arrow keys and drags'],
  ['pb-flip-empty', 'J4', 'src/evf/project/playback.ts', "const held = rimg?.complete && rimg.naturalWidth > 0 ? rimg.currentSrc : '';", "const held = '';", 'playback.spec.mjs', 'never flies an empty panel'],
  ['pb-rung-92vw', 'J4', 'src/evf/project/playback.ts', "x.setAttribute('sizes', w > 0 ? `${w}px` : '(max-width: 759px) 100vw, 92vw');", "x.setAttribute('sizes', '(max-width: 759px) 100vw, 92vw');", 'playback.spec.mjs', 'never flies an empty panel'],
  ['pb-fill-hidden', 'J4', 'src/evf/project/playback.ts', 'dlg.showModal();\n      // filled once shown: the frame has its layout width for the clone\'s sizes (same task, nothing paints between)\n      fill(n);', 'fill(n);\n      dlg.showModal();', 'playback.spec.mjs', 'never flies an empty panel'],
  ['no-short-phone', 'A10', 'src/evf/style/print.css', '.pb__frame { width: min(100%, calc((100svh - 120px) * var(--ar))); }', '', 'playback.spec.mjs', 'a phone on its side'],
  ['no-short-foot', 'A10', 'src/evf/style/print.css', '.pb__foot { grid-template-columns: auto minmax(0, 1fr); gap: 12px; }', '', 'playback.spec.mjs', 'a phone on its side'],
  ['pb-clip-empty-controls', 'A10', 'src/evf/project/playback.ts', 'v.controls = !!src;', 'v.controls = true;', 'playback.spec.mjs', 'controls only when it has a file'],
  ['pb-one-clip-tab', 'A10', 'src/evf/project/playback.ts', "prev.setAttribute('aria-disabled', String(n === 0));\n    next.setAttribute('aria-disabled', String(n === total - 1));", "prev.toggleAttribute('disabled', n === 0);\n    next.toggleAttribute('disabled', n === total - 1);", 'playback.spec.mjs', 'one-clip roll'],
  // fix-pass B5
  // f12: playback's video never gets the clip's captions track
  ['b5-no-track', 'A10', 'src/evf/project/playback.ts', "const cc = p.querySelector('video')?.dataset.captions; if (cc)", "const cc = ''; if (cc)", 'playback.spec.mjs', 'A10 f12'],
  // f28: sizes without the height cap (the hero print takes 1920 for a 691 or 1152 px frame)
  ['b5-sizes-no-cap', 'A7', 'src/lib/prints/size.ts', 'const cap = (h: number, w: string) => `min(${w}, calc(${h}vh * ${ar}))`;', 'const cap = (h: number, w: string) => w;', 'roll.spec.mjs', 'A7 f28'],
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
