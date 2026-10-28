#!/usr/bin/env node
// W-S2 strip instrument (#14 spec v1 row L6; W-D022): the seeded test strip, one spec and two renderers.
//   bytes    each slug's strip SVG is byte-identical across two generations, and the built page's <symbol> holds
//            exactly that body;
//   canvas   src/lib/teststrip's Canvas2D renderer matches the SVG (rasterized by the browser) to a mean |diff| of at
//            most 2/255 per channel, for every slug, at 540 x 860;
//   texture  the GL texture's source (the page's <symbol> as an SVG image, as src/gl/prints builds it) matches the DOM
//            still as the page paints it, to the same bound.
// --plant canvas (the Canvas2D side draws another slug's strip) and --plant bytes (one attribute differs in the second
// generation) must FAIL.
// Usage: node tests/w-s2/strip.mjs [--plant canvas|bytes] [--dist <dir>] [--out <dir>]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { ROOT, closeBrowsers, cliOpts, newContext, serve, sha256, waitSettled } from '../harness/lib.mjs';
import { stripSvg, stripSvgBody } from '../../src/lib/teststrip/index.ts';
import { frameCode } from '../../src/lib/content/validate.js';

/** Mean absolute difference per channel, in 1/255 (#14 acceptance line 6). */
export const MEAN_DIFF_MAX = 2;
const o = cliOpts();
const plant = o.plant ? String(o.plant) : null;
const dist = o.dist ? String(o.dist) : join(ROOT, 'dist');
const projects = JSON.parse(readFileSync(join(ROOT, 'content/projects.json'), 'utf8')).projects.map((p, i) => ({ slug: p.slug, tint: p.tint, frame: frameCode(i), cover: p.cover }));
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const fails = [];

// ---------------------------------------------------------------- bytes
const bytes = projects.map((p) => {
  const a = stripSvg(p.slug, p.tint, p.frame);
  let b = stripSvg(p.slug, p.tint, p.frame);
  if (plant === 'bytes') b = b.replace('stroke-width="0.35"', 'stroke-width="0.36"');
  const inPage = p.cover ? null : html.includes(`>${stripSvgBody(p.slug, p.tint, p.frame)}</symbol>`);
  if (a !== b) fails.push(`bytes: ${p.slug} differs between two generations`);
  if (inPage === false) fails.push(`bytes: ${p.slug}'s <symbol> in dist/index.html is not the spec's body`);
  return { slug: p.slug, sha256: sha256(Buffer.from(a)), length: a.length, identical: a === b, inPage };
});
const distinct = new Set(bytes.map((b) => b.sha256)).size;
if (distinct !== bytes.length) fails.push(`bytes: ${bytes.length - distinct} slugs share a strip`);

// ---------------------------------------------------------------- canvas and texture, in the browser
const lib = stripTypeScriptTypes(readFileSync(join(ROOT, 'src/lib/teststrip/index.ts'), 'utf8')).replace(/^export /gm, '');
const srv = await serve(dist);
let canvas = [];
let texture = [];
try {
  const ctx = await newContext('D3', 'reduced');
  const page = await ctx.newPage();
  await page.goto(`${srv.base}/?view=sheet`, { waitUntil: 'load' });
  await waitSettled(page, 12000);
  await page.addScriptTag({ content: `${lib}\nwindow.__strip = { stripShapes, drawStrip, stripSvg };` });
  canvas = await page.evaluate(
    async ({ projects, plant }) => {
      const W = 540;
      const H = 860;
      const px = (draw) => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const x = c.getContext('2d');
        draw(x);
        return x.getImageData(0, 0, W, H).data;
      };
      const out = [];
      for (const [i, p] of projects.entries()) {
        if (p.cover) continue;
        const svg = window.__strip.stripSvg(p.slug, p.tint, p.frame).replace('<svg ', `<svg width="${W}" height="${H}" `);
        const img = new Image();
        img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        await img.decode();
        const a = px((x) => x.drawImage(img, 0, 0, W, H));
        const q = plant === 'canvas' ? projects[(i + 1) % projects.length] : p;
        const b = px((x) => window.__strip.drawStrip(x, window.__strip.stripShapes(q.slug, q.tint, q.frame), W, H));
        let sum = 0;
        let max = 0;
        for (let k = 0; k < a.length; k += 4) for (let ch = 0; ch < 3; ch++) {
          const d = Math.abs(a[k + ch] - b[k + ch]);
          sum += d;
          if (d > max) max = d;
        }
        out.push({ slug: p.slug, meanDiff: sum / ((a.length / 4) * 3), maxDiff: max });
      }
      return out;
    },
    { projects, plant },
  );
  // The GL texture's source against the DOM still: each strip as the page paints it inline (<use> of its <symbol>,
  // the poster's own markup) at whole pixels (540 x 860 at DPR 1, so no subpixel placement blurs either side), against
  // its <symbol> rasterized as an SVG image the way src/gl/prints builds the texture.
  for (const p of projects.filter((x) => !x.cover)) {
    await page.evaluate((slug) => {
      document.getElementById('w2-probe')?.remove();
      const d = document.createElement('div');
      d.id = 'w2-probe';
      d.style.cssText = 'position:fixed;left:0;top:0;width:540px;height:860px;z-index:100;background:#fff';
      d.innerHTML = `<svg viewBox="0 0 54 86" width="540" height="860" style="display:block"><use href="#ts-${slug}"></use></svg>`;
      document.body.append(d);
    }, p.slug);
    const shot = await page.locator('#w2-probe').screenshot({ animations: 'disabled' });
    texture.push(
      await page.evaluate(
        async ({ b64, slug }) => {
          const shotImg = new Image();
          shotImg.src = `data:image/png;base64,${b64}`;
          await shotImg.decode();
          const [w, h] = [shotImg.naturalWidth, shotImg.naturalHeight];
          const sym = document.getElementById(`ts-${slug}`);
          const img = new Image();
          img.src = URL.createObjectURL(new Blob([sym.outerHTML.replace('<symbol', `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"`).replace('</symbol>', '</svg>')], { type: 'image/svg+xml' }));
          await img.decode();
          const px = (src, bg) => {
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const x = c.getContext('2d');
            if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
            x.drawImage(src, 0, 0, w, h);
            return x.getImageData(0, 0, w, h).data;
          };
          const a = px(shotImg);
          const b = px(img, '#fff');
          let sum = 0;
          for (let k = 0; k < a.length; k += 4) for (let ch = 0; ch < 3; ch++) sum += Math.abs(a[k + ch] - b[k + ch]);
          return { slug, w, h, meanDiff: sum / ((a.length / 4) * 3) };
        },
        { b64: shot.toString('base64'), slug: p.slug },
      ),
    );
  }
  await ctx.close();
} finally {
  await closeBrowsers();
  await srv.close();
}
for (const c of canvas) if (!(c.meanDiff <= MEAN_DIFF_MAX)) fails.push(`canvas: ${c.slug} mean diff ${c.meanDiff.toFixed(3)}/255 > ${MEAN_DIFF_MAX}`);
for (const t of texture) if (!(t.meanDiff <= MEAN_DIFF_MAX)) fails.push(`texture: ${t.slug} mean diff ${t.meanDiff.toFixed(3)}/255 > ${MEAN_DIFF_MAX}`);
const pass = fails.length === 0 && canvas.length > 0 && texture.length > 0;
const summary = `${bytes.length} strips byte-identical: ${bytes.every((b) => b.identical)}; Canvas2D vs SVG mean diff max ${Math.max(...canvas.map((c) => c.meanDiff)).toFixed(3)}/255; GL source vs DOM still max ${Math.max(...texture.map((t) => t.meanDiff)).toFixed(3)}/255`;
if (o.out) {
  mkdirSync(String(o.out), { recursive: true });
  writeFileSync(join(String(o.out), `strip${plant ? `-plant-${plant}` : ''}.json`), JSON.stringify({ schema: 1, instrument: 'w-s2/strip', plant, pass, summary, fails, bytes, canvas, texture }, null, 2));
}
console.log(`strip${plant ? ` (plant ${plant})` : ''}: ${pass ? 'PASS' : 'FAIL'}  ${summary}`);
for (const f of fails.slice(0, 5)) console.log(`  ${f}`);
process.exit(pass ? 0 : 1);
