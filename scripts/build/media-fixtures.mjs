#!/usr/bin/env node
// Placeholder media fixtures (D-045, W-V1 spec A4). Every placeholder media entry in content/projects.json renders at
// build as an EVF test chart (a grey ramp, a focus star, frame lines and its own w x h), drawn as SVG and encoded by
// sharp into the same AVIF and WebP ladder as real media (src/lib/prints/ladder.ts). Deterministic, cached by content
// hash in node_modules/.cache/portfolio-fixtures, copied into dist/media/fixtures/ by astro.config.mjs: never committed,
// never AI-made. The manifest there holds each chart's LQIP; src/lib/content/fixtures.ts reads it at build.
// Usage: node scripts/build/media-fixtures.mjs [--out <dir>]   (astro.config.mjs runs it at astro:build:start)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ABSENT, sizeOf } from '../../src/lib/prints/size.ts';
import { FIXTURE_DIR, LQIP_MAX, heightAt, ladder, pad2 } from '../../src/lib/prints/ladder.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CACHE = join(ROOT, 'node_modules/.cache/portfolio-fixtures');
export const MANIFEST = 'manifest.json';
/** Bump to re-render every chart. */
const VERSION = 4;
const PREFIX = '/media/fixtures/';
const rel = (u) => u.slice(PREFIX.length);
const AVIF = { quality: 50, effort: 3 };
const WEBP = { quality: 72, effort: 4 };

/** Every chart to render: one per placeholder image or video entry (a video's chart is its poster). */
export function plan(projects) {
  const out = [];
  for (const p of projects) {
    p.media.forEach((m, k) => {
      if (!m.placeholder || (m.type !== 'image' && m.type !== 'video')) return;
      const n = k + 1;
      const { w, h } = sizeOf(m);
      const poster = m.type === 'video';
      out.push({ slug: p.slug, n, w, h, declared: m.w > 0 && m.h > 0, poster, loop: Boolean(m.loop), tint: p.tint, files: ladder(FIXTURE_DIR(p.slug), pad2(n), w, h, { first: n === 1, poster }) });
    });
  }
  return out;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const mix = (hex, k) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const base = [11, 11, 10];
  return `rgb(${c.map((v, i) => Math.round(base[i] + (v - base[i]) * k)).join(',')})`;
};

/** The test chart for one rung, as SVG: the frame lines, a focus star, a grey ramp and the source size. */
export function chartSvg({ W, H, w, h, n, tint, poster, loop }) {
  const m = Math.min(W, H);
  const ins = Math.round(m * 0.06);
  const sw = Math.max(1, Math.round(m / 400));
  const cx = W / 2, cy = H / 2 - m * 0.04;
  const R = m * 0.26;
  const spokes = 36;
  let star = '';
  for (let i = 0; i < spokes; i += 2) {
    const a0 = (i / spokes) * Math.PI * 2, a1 = ((i + 1) / spokes) * Math.PI * 2;
    star += `M${cx.toFixed(1)} ${cy.toFixed(1)}L${(cx + R * Math.cos(a0)).toFixed(1)} ${(cy + R * Math.sin(a0)).toFixed(1)}L${(cx + R * Math.cos(a1)).toFixed(1)} ${(cy + R * Math.sin(a1)).toFixed(1)}Z`;
  }
  const steps = 11;
  const rw = (W - ins * 4) / steps, rh = Math.max(4, Math.round(m * 0.06)), ry = H - ins * 2 - rh;
  let ramp = '';
  for (let i = 0; i < steps; i++) {
    const v = Math.round(12 + (243 * i) / (steps - 1));
    ramp += `<rect x="${(ins * 2 + i * rw).toFixed(1)}" y="${ry}" width="${Math.ceil(rw)}" height="${rh}" fill="rgb(${v},${v},${v})"/>`;
  }
  const arm = Math.round(m * 0.07);
  const corners = [[ins, ins, 1, 1], [W - ins, ins, -1, 1], [ins, H - ins, 1, -1], [W - ins, H - ins, -1, -1]]
    .map(([x, y, dx, dy]) => `M${x + dx * arm} ${y}H${x}V${y + dy * arm}`).join('');
  const fs = Math.max(9, Math.round(m * 0.055));
  const label = `${w} × ${h}${poster ? (loop ? ' · LOOP' : ' · CLIP') : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="${mix(tint, 0.34)}"/>`
    + `<rect x="${ins}" y="${ins}" width="${W - ins * 2}" height="${H - ins * 2}" fill="${mix(tint, 0.18)}"/>`
    + `<path d="${star}" fill="#d8d4cb"/>`
    + `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(R * 0.08).toFixed(1)}" fill="${mix(tint, 0.18)}"/>`
    + `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${R.toFixed(1)}" fill="none" stroke="#817d76" stroke-width="${sw}"/>`
    + `<path d="M${cx - R * 1.35} ${cy}H${cx - R * 1.1}M${cx + R * 1.1} ${cy}H${cx + R * 1.35}M${cx} ${cy - R * 1.35}V${cy - R * 1.1}M${cx} ${cy + R * 1.1}V${cy + R * 1.35}" stroke="#ece9e2" stroke-width="${sw}"/>`
    + `<path d="${corners}" fill="none" stroke="#ece9e2" stroke-width="${sw * 2}"/>`
    + ramp
    + `<text x="${ins * 2}" y="${ins * 2 + fs}" font-family="Consolas, 'DejaVu Sans Mono', 'Liberation Mono', 'Courier New', monospace" font-size="${fs}" fill="#ece9e2">${pad2(n)}</text>`
    + `<text x="${W - ins * 2}" y="${ins * 2 + fs}" font-family="Consolas, 'DejaVu Sans Mono', 'Liberation Mono', 'Courier New', monospace" font-size="${fs}" fill="#a29e95" text-anchor="end">${esc(label)}</text>`
    + '</svg>';
}

/** A tiny WebP LQIP at most LQIP_MAX bytes, as a data URI. */
export async function lqip(sharp, input) {
  for (const [width, quality] of [[16, 40], [12, 30], [8, 20]]) {
    const buf = await sharp(input).resize({ width }).webp({ quality }).toBuffer();
    if (buf.length <= LQIP_MAX) return `data:image/webp;base64,${buf.toString('base64')}`;
  }
  return '';
}

/** Renders every chart into `out` (skipping files already there for the same hash) and writes the manifest. */
export async function build({ projects, out = CACHE, log = () => {} } = {}) {
  const sharp = (await import('sharp')).default;
  const list = plan(projects ?? JSON.parse(readFileSync(join(ROOT, 'content/projects.json'), 'utf8')).projects);
  const prev = existsSync(join(out, MANIFEST)) ? JSON.parse(readFileSync(join(out, MANIFEST), 'utf8')) : { entries: {} };
  const entries = {};
  let made = 0;
  for (const c of list) {
    const key = `${c.slug}/${pad2(c.n)}`;
    const hash = createHash('sha256').update(JSON.stringify([VERSION, AVIF, WEBP, c.w, c.h, c.n, c.tint, c.poster, c.loop, c.files.map((f) => f.avif)])).digest('hex').slice(0, 16);
    const dir = join(out, c.slug);
    mkdirSync(dir, { recursive: true });
    const have = prev.entries?.[key]?.hash === hash && c.files.every((f) => existsSync(join(out, rel(f.avif))) && existsSync(join(out, rel(f.webp))));
    let lq = prev.entries?.[key]?.lqip ?? '';
    if (!have) {
      for (const f of c.files) {
        const svg = Buffer.from(chartSvg({ W: f.rung, H: heightAt(f.rung, c.w, c.h), w: c.w, h: c.h, n: c.n, tint: c.tint, poster: c.poster, loop: c.loop }));
        const img = sharp(svg, { density: 72 });
        await img.clone().avif(AVIF).toFile(join(out, rel(f.avif)));
        await img.clone().webp(WEBP).toFile(join(out, rel(f.webp)));
        made += 2;
      }
      lq = await lqip(sharp, Buffer.from(chartSvg({ W: 64, H: heightAt(64, c.w, c.h), w: c.w, h: c.h, n: c.n, tint: c.tint, poster: c.poster, loop: c.loop })));
    }
    entries[key] = { hash, w: c.w, h: c.h, declared: c.declared, lqip: lq, files: c.files.map((f) => f.avif.split('/').pop().replace(/\.avif$/, '')) };
  }
  const manifest = { schema: 1, note: 'generated by scripts/build/media-fixtures.mjs at build; never committed', absent: ABSENT, entries };
  writeFileSync(join(out, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  log(`media-fixtures: ${list.length} test charts, ${made} files rendered (${list.length ? 'the rest cached' : 'no placeholder media'})`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : CACHE;
  await build({ out, log: console.log });
}
