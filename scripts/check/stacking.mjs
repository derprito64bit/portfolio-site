#!/usr/bin/env node
// Stacking-context scan (W-D013): at rest, no ancestor of a [data-gl] slot may create a stacking context, so every
// focus ring and control in content (z 2) paints above the canvas (z 1). Two tests per ancestor, both must pass:
//   static    the computed-style triggers (z-index on a positioned or flex/grid item, opacity, transform, filter,
//             contain, isolation, will-change, clip-path, mask, fixed/sticky, ...);
//   painted   a probe child with z-index:-1 is painted above its ancestor only inside a stacking context
//             (document.elementsFromPoint order), which catches engine-specific triggers the list misses.
// GPU-free: runs in CI. Usage: node scripts/check/stacking.mjs [--json report.json]
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeBrowsers, newContext, serve, waitSettled, writeJson } from '../../tests/harness/lib.mjs';

const ROUTES = ['/', '/work/project-01/', '/bench/', '/bench/swap/'];
const PROFILES = ['D2', 'P2'];

export function scanInPage() {
  const reasons = (el) => {
    const cs = getComputedStyle(el);
    const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
    const r = [];
    if (cs.position === 'fixed' || cs.position === 'sticky') r.push(`position:${cs.position}`);
    if (cs.zIndex !== 'auto' && (cs.position !== 'static' || (parent && /flex|grid/.test(parent.display)))) r.push(`z-index:${cs.zIndex}`);
    if (Number(cs.opacity) < 1) r.push(`opacity:${cs.opacity}`);
    if (cs.mixBlendMode !== 'normal') r.push(`mix-blend-mode:${cs.mixBlendMode}`);
    for (const p of ['transform', 'translate', 'rotate', 'scale', 'filter', 'backdropFilter', 'perspective', 'clipPath', 'maskImage']) {
      const v = cs[p];
      if (v && v !== 'none') r.push(`${p}:${v}`);
    }
    if (cs.isolation === 'isolate') r.push('isolation:isolate');
    if (/layout|paint|strict|content/.test(cs.contain)) r.push(`contain:${cs.contain}`);
    if (/transform|opacity|filter|perspective|clip-path|mask|isolation|z-index|position|mix-blend-mode|translate|rotate|scale/.test(cs.willChange)) r.push(`will-change:${cs.willChange}`);
    if (cs.viewTransitionName && cs.viewTransitionName !== 'none') r.push(`view-transition-name:${cs.viewTransitionName}`);
    return r;
  };
  const painted = (el) => {
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return null;
    // A fixed probe covers the viewport (or the ancestor, when a transform makes it the containing block), so it
    // overlaps the ancestor wherever the ancestor is on screen. Points are taken from that visible part.
    const vis = { l: Math.max(0, box.left), t: Math.max(0, box.top), r: Math.min(innerWidth, box.right), b: Math.min(innerHeight, box.bottom) };
    if (vis.r - vis.l < 2 || vis.b - vis.t < 2) return null;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:auto;background:transparent';
    el.append(probe);
    const pts = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.9], [0.1, 0.9], [0.9, 0.1]];
    let verdict = null;
    for (const [fx, fy] of pts) {
      const x = vis.l + (vis.r - vis.l) * fx;
      const y = vis.t + (vis.b - vis.t) * fy;
      const stack = document.elementsFromPoint(x, y);
      const ip = stack.indexOf(probe);
      const ie = stack.indexOf(el);
      if (ip < 0 || ie < 0) continue;
      verdict = ip < ie; // the probe above its own ancestor: a stacking context
      break;
    }
    probe.remove();
    return verdict;
  };
  const out = [];
  for (const slot of document.querySelectorAll('[data-gl][data-gl-id]')) {
    slot.scrollIntoView({ block: 'center' });
    const ancestors = [];
    for (let a = slot.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const r = reasons(a);
      const p = painted(a);
      if (r.length || p) ancestors.push({ el: a.tagName.toLowerCase() + (a.id ? `#${a.id}` : '') + (a.className && typeof a.className === 'string' ? `.${a.className.trim().split(/\s+/).join('.')}` : ''), reasons: r, painted: p });
    }
    const own = getComputedStyle(slot);
    out.push({ id: slot.dataset.glId, kind: slot.dataset.gl, slotZ: own.zIndex, slotPosition: own.position, offenders: ancestors });
  }
  window.scrollTo(0, 0);
  return out;
}

async function main() {
  const srv = await serve();
  const results = [];
  let failures = 0;
  try {
    for (const profile of PROFILES) {
      for (const route of ROUTES) {
        const ctx = await newContext(profile);
        const page = await ctx.newPage();
        await page.goto(srv.base + route, { waitUntil: 'load' });
        await waitSettled(page);
        const slots = await page.evaluate(scanInPage);
        const bad = slots.filter((s) => s.offenders.length || s.slotZ !== '2');
        failures += bad.length;
        results.push({ profile, route, slots: slots.length, bad });
        await ctx.close();
      }
    }
  } finally {
    await closeBrowsers();
    await srv.close();
  }

  const report = { schema: 1, check: 'stacking-context', routes: ROUTES, profiles: PROFILES, results, pass: failures === 0 };
  const i = process.argv.indexOf('--json');
  if (i > 0) writeJson(process.argv[i + 1], report);
  const total = results.reduce((n, r) => n + r.slots, 0);
  if (failures) {
    console.error(`stacking: ${failures} slot(s) with a stacking-context ancestor or not on z 2:`);
    for (const r of results) for (const b of r.bad) console.error(`  ${r.profile} ${r.route} ${b.id}: z ${b.slotZ}; ${b.offenders.map((o) => `${o.el} [${o.reasons.join(', ')}${o.painted ? ' painted' : ''}]`).join('; ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`stacking: ${total} slot visits on ${ROUTES.length} routes at ${PROFILES.join(', ')}; no ancestor creates a stacking context; every slot is on z 2`);

}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
