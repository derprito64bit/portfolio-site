#!/usr/bin/env node
// W-S2 layout instrument (#14 spec v1 rows L1, L2, L5, L6 names, L7, M2), on the built / at every GES-1 profile, in
// the Sheet view and the List view. Every expected value is derived from layout.* (src/lib/tokens.js), the content box
// rule (ruling 1c: min(contentMax, body.clientWidth - 2 x gutter), the gutter from a probe styled width: var(--gutter))
// and the column rule (ruling 1b); nothing is read back from the frames' own padding.
// --plant <name> injects one defect before measuring; every plant must make its row FAIL (the negative controls):
//   share (an enlargement 1% wider), cols (a fifth sheet column), track (a card 12 px narrower than its track),
//   offset (no B1-B2 offset), tilt (a 3 degree tilt), caption (a caption pulled over its print), swell (no reserve),
//   overflow (a 40 px overhang), contact (an 800 px spacer before Awards), names (a duplicate link name), listtrack (the
//   List print without its inline size: round 1's WebKit collapse, run it at WK-P2 or WK-T2).
// L5 and L7 run in WebKit too (WK-P2, WK-T2; the List is iOS Safari's default view): a long title must keep every word
// whole on one line (overflow-wrap: anywhere hides a squeezed cell by breaking letters), and L7 reads contact on a cold
// / with no ?view= and no stored toggle, in the view / opens in, at P2 and WK-P2.
// Usage: node tests/w-s2/layout.mjs [--profiles D1,...] [--plant <name>] [--dist <dir>] [--out <dir>]
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PROFILES, closeBrowsers, cliOpts, newContext, serve, waitSettled } from '../harness/lib.mjs';

/** L1: the largest enlargement at D1 is at least this wide (#14 acceptance line 1). */
export const D1_LARGEST_MIN = 520;
/** L7: contact within this many screens at 390 x 844, as built (D-023). */
export const CONTACT_SCREENS_MAX = 5.0;
/** M2: the third enlargement renders at least this multiple of the sheet print at B4 and B5 (report-only). */
export const M2_RATIO = 1.2;
/** L1 columns at 100% zoom (ruling 1b); R1, Z-D2 and Z-P2 are the derivation. */
export const COLUMNS = { D1: 4, D2: 4, D3: 4, S1: 4, T1: 4, T2: 3, 'WK-T2': 3, P1: 2, P2: 2, 'WK-P2': 2, S2: 2, 'Z-D2': 2, 'Z-P2': 1 };
const TOL = 0.5;

const o = cliOpts();
const plant = o.plant ? String(o.plant) : null;
// --tokens <tokens.js>: a rebuilt tree's tokens (the tokens-only rebuild); the fixed tables then do not apply.
const altTokens = o.tokens ? String(o.tokens) : null;
const { layout } = await import(altTokens ? pathToFileURL(altTokens).href : '../../src/lib/tokens.js');
const profiles = String(o.profiles ?? Object.keys(PROFILES).join(',')).split(',');
const band = (w) => (w < 480 ? 'B1' : w < 768 ? 'B2' : w < 1024 ? 'B3' : w < 1440 ? 'B4' : 'B5');
const bandKey = (b) => (b === 'B1' || b === 'B2' ? 'B1-B2' : b === 'B3' ? 'B3' : 'B4-B5');
const phone = String(layout.phoneSheet);
const OFFSET = Number(phone.match(/offset\s+([\d.]+)px/)[1]);
const TILT = Number(phone.match(/tilt up to\s+([\d.]+)deg/)[1]);

const PLANTS = {
  share: '.enl-1 .print { --w: calc(clamp(var(--min), calc(var(--s) * 100cqi), min(100cqi, var(--max))) + 1cqi) !important; }',
  cols: '.sheet-grid { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; }',
  track: '.sheet-item .print-card { inline-size: calc(100% - 12px) !important; }',
  offset: '.sheet-grid > li { margin-block-start: 0 !important; }',
  tilt: '.sheet-item:nth-child(2) .print-card { rotate: 3deg !important; }',
  caption: '.sheet-item:nth-child(1) .print-cap { margin-block-start: -40px !important; }',
  swell: '.row-res { display: none !important; } .row-title { min-block-size: 0 !important; }',
  overflow: '.sheet-item:nth-child(1) .print-name { margin-inline-end: -40px; white-space: nowrap; display: block; inline-size: 120vw; }',
  contact: '#honours { margin-block-start: 800px !important; }',
  listtrack: '.row .print--list { inline-size: auto !important; aspect-ratio: 54 / 86 !important; }',
};
/** L7 runs on a cold / at these profiles (390 x 844, Chromium and WebKit). */
const L7_PROFILES = ['P2', 'WK-P2'];

/** Everything measured in the page (one evaluate per profile and view). */
function measure({ view, offset, tiltMax, minPx, maxPx, shares, colsMax }) {
  const r = (el) => el.getBoundingClientRect();
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;inline-size:var(--gutter);block-size:0;visibility:hidden';
  document.body.append(probe);
  const gutter = probe.getBoundingClientRect().width;
  probe.remove();
  const vw = document.body.clientWidth;
  const W = Math.min(1680, vw - 2 * gutter);
  const out = { view, vw, innerWidth, gutter, W, enl: [], sheet: null, list: null, captionsOverImages: [], outside: [], names: [] };
  const left = (vw - W) / 2;
  const inside = (el, what) => {
    const b = r(el);
    if (b.width && (b.left < left - 0.5 || b.right > left + W + 0.5) && !el.closest('.print-defs')) out.outside.push({ what, left: b.left, right: b.right, boxLeft: left, boxRight: left + W });
  };
  const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  document.querySelectorAll('[data-print="enl"]').forEach((p, i) => {
    const card = p.querySelector('.print-card');
    const still = p.querySelector('[data-poster]');
    const share = shares[i];
    const expected = Math.max(minPx, Math.min(share * W, Math.min(W, maxPx)));
    out.enl.push({ id: p.dataset.glId, width: card.offsetWidth, still: still.offsetWidth, expected, share });
    if (overlap(r(card), r(p.querySelector('.print-cap')))) out.captionsOverImages.push(p.dataset.glId);
    inside(card, `enl ${i + 1}`);
  });
  const grid = document.querySelector('[data-sheet-grid]');
  if (view === 'sheet' && grid && grid.offsetParent) {
    const cs = getComputedStyle(grid);
    const tracks = cs.gridTemplateColumns.split(' ').map(parseFloat);
    const g = parseFloat(cs.columnGap);
    const Wg = grid.clientWidth;
    const items = [...grid.children];
    const cols = new Map();
    for (const li of items) {
      const k = Math.round(li.offsetLeft);
      cols.set(k, [...(cols.get(k) ?? []), li]);
    }
    const lefts = [...cols.keys()].sort((a, b) => a - b);
    // The derivation (ruling 1b) with the inset i = 0 (each card fills its track).
    let derived = 1;
    for (let n = colsMax; n >= 1; n--) if (n * minPx + (n - 1) * g <= Wg + 0.01) { derived = n; break; }
    const cards = items.map((li) => {
      const p = li.querySelector('[data-print]');
      const card = p.querySelector('.print-card');
      const col = lefts.indexOf(Math.round(li.offsetLeft));
      const cap = p.querySelector('.print-cap');
      if (overlap(r(card), r(cap))) out.captionsOverImages.push(p.dataset.glId);
      inside(li, `sheet ${p.dataset.glId}`);
      const rotate = getComputedStyle(card).rotate;
      const pencil = li.querySelector('.pencil');
      return { id: p.dataset.glId, pencilRotate: pencil ? getComputedStyle(pencil).rotate : null, col, top: li.offsetTop, marginTop: parseFloat(getComputedStyle(li).marginBlockStart), width: card.offsetWidth, track: tracks[col], tilt: Number(p.dataset.tilt) || 0, rotate, origin: getComputedStyle(card).transformOrigin, cardW: card.offsetWidth, cardH: card.offsetHeight };
    });
    const title = document.getElementById('sheet');
    out.sheet = { tracks, gap: g, Wg, columns: lefts.length, derived, cards, headingBeside: r(title).right <= r(grid).left + 0.5 && innerWidth >= 1024, headingOverlap: overlap(r(title), r(grid)) };
  }
  const list = document.querySelector('[data-sheet-list]');
  if (view === 'list' && list && list.offsetParent) {
    // Words of the shown title that the line breaker split across lines (each word's range spans more than one line).
    const broken = (el) => {
      const texts = [];
      const walk = (n) => (n.nodeType === 3 ? texts.push(n) : n.childNodes.forEach(walk));
      walk(el);
      const out = [];
      for (const t of texts) {
        for (const m of t.data.matchAll(/\S+/g)) {
          const rg = document.createRange();
          rg.setStart(t, m.index);
          rg.setEnd(t, m.index + m[0].length);
          const lines = new Set([...rg.getClientRects()].filter((b) => b.width > 0.5).map((b) => Math.round(b.top)));
          if (lines.size > 1) out.push(m[0]);
        }
      }
      return out;
    };
    out.list = [...list.querySelectorAll('.row')].map((row) => {
      const pr = row.querySelector('.print--list');
      const title = row.querySelector('.row-title');
      inside(row, `row ${row.dataset.glId}`);
      row.querySelectorAll('.row-t, .row-meta > *, .print--list').forEach((el) => inside(el, `row ${row.dataset.glId} ${el.className}`));
      return { id: row.dataset.glId, h: row.offsetHeight, printH: pr.offsetHeight, printW: pr.offsetWidth, titleW: Math.round(title.getBoundingClientRect().width * 10) / 10, brokenWords: broken(title.querySelector('.row-t:not(.row-res)')), lh: parseFloat(getComputedStyle(title).lineHeight), name: row.getAttribute('aria-label') };
    });
  }
  // Accessible names of the print links (the aria-hidden parts left out), with their URLs.
  for (const a of document.querySelectorAll('section.work a[href], section.sheet a[href]')) {
    if (!a.offsetParent && !a.closest('[data-sheet-list]')) continue;
    let name = a.getAttribute('aria-label');
    if (name === null) {
      const c = a.cloneNode(true);
      c.querySelectorAll('[aria-hidden="true"], [hidden]').forEach((x) => x.remove());
      name = c.textContent;
    }
    out.names.push({ name: name.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') });
  }
  const contact = document.getElementById('contact');
  out.contactTop = contact ? contact.getBoundingClientRect().top + scrollY : null;
  out.door = document.querySelector('[data-door], .door, #door')?.getBoundingClientRect().height ?? 0;
  out.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  return out;
}

/** The swell (W-D025): every row's height at wght 320, 560 and 700 must be the same. */
async function swell(page) {
  const h = () => page.evaluate(() => [...document.querySelectorAll('[data-sheet-list] .row')].map((r) => r.offsetHeight));
  const base = await h();
  const at = {};
  for (const w of [560, 700]) {
    await page.addStyleTag({ content: `.row-t:not(.row-res){font-weight:${w} !important;transition:none !important}`.replace('!important;transition', '!important;transition') });
    at[w] = await h();
  }
  return { base, at, maxDeltaPx: Math.max(...[560, 700].flatMap((w) => at[w].map((v, i) => Math.abs(v - base[i])))) };
}

/** A 24-character title and the placeholder token, in every row's title and reserve (L5). */
async function longTitle(page) {
  await page.evaluate(() => {
    const t = 'Lighthouse keepers notes';
    // The title and its reserve get the same text: a 24-character title, and on alternate rows the token after it.
    document.querySelectorAll('[data-sheet-list] .row-title').forEach((cell, i) => cell.querySelectorAll('.row-t').forEach((el) => (el.textContent = i % 2 ? t : `${t} [PLACEHOLDER: kind]`)));
  });
}

const rows = [];
const srv = await serve(o.dist ? String(o.dist) : undefined);
try {
  for (const p of profiles) {
    if (!PROFILES[p]) continue;
    const prof = PROFILES[p];
    const b = band(prof.viewport.width);
    const shares = layout.enlargementsPctOfContent[bandKey(b)].map((v) => v / 100);
    const colsMax = layout.sheetColumns[bandKey(b)];
    const res = { profile: p, band: b, browser: prof.browser };
    for (const view of ['sheet', 'list']) {
      const ctx = await newContext(p, 'reduced');
      const page = await ctx.newPage();
      await page.goto(`${srv.base}/?view=${view}`, { waitUntil: 'load' });
      await waitSettled(page, 12000);
      if (plant && PLANTS[plant]) await page.addStyleTag({ content: PLANTS[plant] });
      if (plant === 'names') await page.evaluate(() => document.querySelector('[data-print="sheet"] .print-frame').replaceChildren('2A'));
      // L7 is measured as built, before the long titles go in.
      const asBuilt = await page.evaluate(() => document.getElementById('contact')?.getBoundingClientRect().top + scrollY);
      if (view === 'list' && ['P2', 'P1', 'T2', 'WK-P2', 'WK-T2'].includes(p)) await longTitle(page);
      res[view] = await page.evaluate(measure, { view, offset: OFFSET, tiltMax: TILT, minPx: layout.minPrintPx, maxPx: layout.enlargementsPctOfContent.maxPx, shares, colsMax });
      res[view].contactTop = asBuilt;
      if (view === 'list') res.swell = await swell(page);
      res[view].longTitles = view === 'list' && ['P2', 'P1', 'T2', 'WK-P2', 'WK-T2'].includes(p);
      await ctx.close();
    }
    // L7 as built: a cold / (no ?view=, nothing stored), in the view it opens in (not on the tokens-only rebuild, whose
    // page is not the built site).
    if (L7_PROFILES.includes(p) && !altTokens) {
      const ctx = await newContext(p, 'reduced');
      const page = await ctx.newPage();
      await page.goto(`${srv.base}/`, { waitUntil: 'load' });
      await waitSettled(page, 12000);
      if (plant && PLANTS[plant]) await page.addStyleTag({ content: PLANTS[plant] });
      res.cold = await page.evaluate(() => {
        let stored = null;
        try {
          stored = localStorage.getItem('ion.view');
        } catch {}
        const c = document.getElementById('contact');
        return { search: location.search, stored, view: document.querySelector('section.sheet')?.dataset.view ?? null, contactTop: c ? c.getBoundingClientRect().top + scrollY : null, innerHeight, door: document.querySelector('[data-door], .door, #door')?.getBoundingClientRect().height ?? 0, titleW: [...document.querySelectorAll('[data-sheet-list] .row-title')].map((t) => Math.round(t.getBoundingClientRect().width)) };
      });
      await ctx.close();
    }
    // Two fresh loads give the same tilt per slug (seeded).
    const ctx2 = await newContext(p, 'reduced');
    const page2 = await ctx2.newPage();
    await page2.goto(`${srv.base}/?view=sheet`, { waitUntil: 'load' });
    res.tiltsAgain = await page2.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-print="sheet"]')].map((a) => [a.dataset.glId, Number(a.dataset.tilt) || 0])));
    await ctx2.close();
    rows.push(res);
  }
} finally {
  await closeBrowsers();
  await srv.close();
}

// ---------------------------------------------------------------- verdicts per row id
const fail = {};
const note = (row, msg) => (fail[row] ??= []).push(msg);
const report = { M2: [] };
for (const r of rows) {
  const s = r.sheet;
  const tag = (m) => `${r.profile}: ${m}`;
  for (const e of s.enl) {
    if (Math.abs(e.width - e.expected) > TOL) note('L1', tag(`${e.id} is ${e.width.toFixed(2)} px, its share gives ${e.expected.toFixed(2)}`));
    if (e.still < layout.minPrintPx - TOL) note('L1', tag(`${e.id} still ${e.still} px < ${layout.minPrintPx}`));
  }
  if (!altTokens && r.profile === 'D1' && Math.max(...s.enl.map((e) => e.width)) < D1_LARGEST_MIN) note('L1', tag(`largest enlargement ${Math.max(...s.enl.map((e) => e.width))} < ${D1_LARGEST_MIN}`));
  for (const v of [r.sheet, r.list]) {
    if (v.overflow !== 0) note('L1', tag(`${v.view}: horizontal overflow ${v.overflow} px`));
    if (v.captionsOverImages.length) note('L1', tag(`${v.view}: caption over image ${v.captionsOverImages.join(', ')}`));
    for (const x of v.outside) note(v.view === 'list' ? 'L5' : 'L1', tag(`${v.view}: ${x.what} outside the content box (${x.left.toFixed(1)}..${x.right.toFixed(1)} vs ${x.boxLeft.toFixed(1)}..${x.boxRight.toFixed(1)})`));
  }
  const sh = s.sheet;
  if (!sh) note('L1', tag('no sheet rendered in the Sheet view'));
  else {
    const want = (!altTokens && COLUMNS[r.profile]) || sh.derived;
    if (sh.columns !== sh.derived) note('L1', tag(`${sh.columns} columns, the derivation gives ${sh.derived} (W ${sh.Wg}, g ${sh.gap})`));
    if (!altTokens && COLUMNS[r.profile] && sh.columns !== want) note('L1', tag(`${sh.columns} columns, ruling 1b says ${want}`));
    if (r.profile === 'R1' && sh.columns !== (sh.gap <= 8 ? 2 : 1)) note('L1', tag(`R1 ${sh.columns} columns with g ${sh.gap}`));
    if (r.innerWidth >= 1024 && !s.sheet.headingBeside) note('L1', tag('the heading is not beside the sheet at 1024+'));
    if (sh.headingOverlap) note('L1', tag('the heading overlaps the sheet'));
    for (const c of sh.cards) {
      if (Math.abs(c.width - c.track) > TOL) note('L1', tag(`${c.id} card ${c.width} px in a ${c.track} px track`));
      if (c.width < layout.minPrintPx - TOL) note('L1', tag(`${c.id} card ${c.width} px < ${layout.minPrintPx}`));
      if (Math.abs(c.tilt) > TILT + 1e-9) note('L2', tag(`${c.id} tilt ${c.tilt} > ${TILT}`));
      const deg = c.rotate === 'none' ? 0 : parseFloat(c.rotate);
      if (Math.abs(deg - c.tilt) > 0.01) note('L2', tag(`${c.id} renders ${c.rotate}, its seed says ${c.tilt}deg`));
      const [ox, oy] = c.origin.split(' ').map(parseFloat);
      if (Math.abs(ox - c.cardW / 2) > TOL || Math.abs(oy - c.cardH / 2) > TOL) note('L2', tag(`${c.id} turns about ${c.origin}, not its centre`));
      if (r.tiltsAgain[c.id] !== c.tilt) note('L2', tag(`${c.id} tilt ${c.tilt} then ${r.tiltsAgain[c.id]} on a second load`));
      // A pencil box turns with the card it frames (and is rotate: none, no stacking context, when the card is untilted).
      if (c.pencilRotate !== null && c.pencilRotate !== c.rotate) note('L2', tag(`${c.id} pencil box turns ${c.pencilRotate}, its card ${c.rotate}`));
    }
    const phoneBand = r.band === 'B1' || r.band === 'B2';
    for (const c of sh.cards) {
      const want = phoneBand && sh.columns >= 2 && c.col % 2 === 1 ? OFFSET : 0;
      if (Math.abs(c.marginTop - want) > TOL) note('L2', tag(`${c.id} (column ${c.col + 1}) is offset ${c.marginTop} px, want ${want}`));
    }
    if (['B4', 'B5'].includes(r.band)) {
      const third = s.enl[2]?.width ?? 0;
      const ratio = third / sh.cards[0].width;
      report.M2.push({ profile: r.profile, third, sheetPrint: sh.cards[0].width, ratio: Math.round(ratio * 1000) / 1000, pass: ratio >= M2_RATIO });
    }
  }
  if (!r.list.list) note('L5', tag('no List rendered in the List view'));
  else {
    for (const row of r.list.list) {
      if (r.list.longTitles && row.brokenWords.length) note('L5', tag(`${row.id}: the title cell (${row.titleW} px) breaks ${row.brokenWords.slice(0, 3).join(' ')}`));
      if (row.h < 44) note('L5', tag(`${row.id} row ${row.h} px < 44`));
      if (Math.abs(row.printH - row.lh) > 1) note('L5', tag(`${row.id} print ${row.printH} px tall, 1lh is ${row.lh}`));
      if (Math.abs(row.printW / row.printH - 54 / 86) > 0.02) note('L5', tag(`${row.id} print ${row.printW} x ${row.printH} is not 54:86`));
    }
    if (r.swell.maxDeltaPx > 0) note('L5', tag(`the swell changes a row by ${r.swell.maxDeltaPx} px`));
  }
  // L6: one name, one destination; names are '{frame}, {title}'.
  for (const v of [r.sheet, r.list]) {
    const by = new Map();
    for (const n of v.names) {
      if (by.has(n.name) && by.get(n.name) !== n.href) note('L6', tag(`${v.view}: "${n.name}" names ${by.get(n.name)} and ${n.href}`));
      by.set(n.name, n.href);
      if (!/^\d+A, \S/.test(n.name)) note('L6', tag(`${v.view}: link name "${n.name}" is not '{frame}, {title}'`));
    }
  }
  if (r.cold) {
    const screens = r.cold.contactTop / 844;
    (report.L7 ??= {})[r.profile] = { contactTop: r.cold.contactTop, screens: Math.round(screens * 100) / 100, doorStubPx: r.cold.door, opensIn: r.cold.view, search: r.cold.search, stored: r.cold.stored, sheetScreens: Math.round((r.sheet.contactTop / 844) * 100) / 100 };
    if (r.cold.view !== 'list' || r.cold.search || r.cold.stored) note('L7', tag(`cold / opens in ${r.cold.view} (search '${r.cold.search}', stored ${r.cold.stored}), want the List with neither`));
    if (!(screens <= CONTACT_SCREENS_MAX)) note('L7', tag(`contact at ${screens.toFixed(2)} screens on a cold / > ${CONTACT_SCREENS_MAX}`));
  }
}
const verdict = Object.fromEntries(['L1', 'L2', 'L5', 'L6', 'L7'].map((k) => [k, fail[k] ? 'fail' : 'pass']));
const pass = Object.values(verdict).every((v) => v === 'pass');
const result = { schema: 1, instrument: 'w-s2/layout', plant, tokens: altTokens, profiles, verdict, failures: fail, report, pass, summary: Object.entries(verdict).map(([k, v]) => `${k} ${v}`).join(', ') + (report.L7 ? `; contact ${Object.entries(report.L7).map(([k, v]) => `${v.screens} screens at ${k}`).join(', ')}` : '') + (report.M2.length ? `; M2 ${report.M2.map((m) => `${m.profile} ${m.ratio}`).join(' ')}` : ''), rows };
if (o.out) {
  mkdirSync(String(o.out), { recursive: true });
  writeFileSync(join(String(o.out), `layout${plant ? `-plant-${plant}` : ''}${altTokens ? '-tokens-alt' : ''}.json`), JSON.stringify(result, null, 2));
}
console.log(`layout${plant ? ` (plant ${plant})` : ''}: ${pass ? 'PASS' : 'FAIL'}  ${result.summary}`);
for (const [k, v] of Object.entries(fail)) console.log(`  ${k}: ${v.slice(0, 4).join(' | ')}${v.length > 4 ? ` (+${v.length - 4})` : ''}`);
process.exit(pass ? 0 : 1);
