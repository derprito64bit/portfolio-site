// W-C13 m1 acceptance: "The poster script output matches the first GL frame at mean diff <= 4/255".
// Reference host only (real GPU, Chrome): node tests/w-c13/poster-parity.mjs --out <evidence dir> [--posters <dir>]
//
// 1. Runs scripts/build/posters/render.mjs into <out>/posters (unless --posters points at existing output).
// 2. For each GES-1 profile (W-D030) plus 1180x820, 600x900 and a landscape phone, it emulates the device, builds a
//    hero stage slot (size: an estimate from tokens.space and tokens.stage.heroRow until W-S1 owns the hero), and
//    screenshots the same slot twice: the live first GL frame (tier from the pointer: mouse = full with MSAA and
//    DPR <= 2, touch = lite without MSAA, DPR <= 1.5, LOD by projected width) and the poster as <img srcset> in
//    AVIF and in WebP.
// 3. Diff = mean absolute difference over R, G and B of every slot pixel, in 0-255 units. Pass: <= 4.
// Writes <out>/poster-diff.json and per-profile crops (gl, poster, diff x8) under <out>/parity/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { launch, repo, runPage, serve, SOFTWARE } from "../../scripts/build/posters/harness.mjs";
import { posterSet } from "../../scripts/build/posters/stage.js";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const out = resolve(opt("--out", join(repo, "evidence/w-c13")));
const LIMIT = 4;

// GES-1 device profiles (W-D030) and the extra sizes from W-S1's acceptance.
const PROFILES = [
  ["D1", 1920, 1080, 1, false], ["D2", 1440, 900, 2, false], ["D3", 1280, 800, 1, false],
  ["T1", 1024, 1366, 2, true], ["T2", 768, 1024, 2, true], ["P1", 430, 932, 3, true], ["P2", 390, 844, 3, true],
  ["S1", 1366, 640, 1, false], ["S2", 390, 664, 3, true],
  ["X1180", 1180, 820, 1, false], ["X600", 600, 900, 2, true], ["L844", 844, 390, 3, true],
].map(([id, w, h, dpr, touch]) => ({ id, w, h, dpr, touch }));

// Estimate of the hero stage slot (W-S1 owns the real one): tokens.space.gutter clamp(16px, 4.2vw, 80px),
// contentMax 1680px, tokens.stage.heroRow (stage 7/12 beside the copy at 64rem+ or on landscape phones).
function slotFor(p) {
  const gutter = Math.min(80, Math.max(16, 0.042 * p.w));
  const content = Math.min(p.w - 2 * gutter, 1680);
  const split = p.w >= 1024 || (p.w > p.h && p.h <= 500);
  if (split) { const w = Math.round((content * 7) / 12); return { band: "split", w, h: Math.round(Math.min(w * 0.8, p.h * 0.62)) }; }
  if (p.w >= 480) return { band: "stacked", w: Math.round(content), h: Math.round(Math.min(content * 0.75, p.h * 0.5)) };
  return { band: "phone", w: Math.round(content), h: Math.round(Math.min(content * 0.8, p.h * 0.42)) };
}

async function raw(png) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

const TABLE = [0xe3, 0xe6, 0xe6]; // page.html's ground (tokens colour.light.table)
const onTable = (px, i) => Math.abs(px[i] - TABLE[0]) <= 3 && Math.abs(px[i + 1] - TABLE[1]) <= 3 && Math.abs(px[i + 2] - TABLE[2]) <= 3;

// mean: the gate metric over the whole slot. meanCamera: the same over pixels where either image shows the camera
// (not the bare table), reported so the slot's empty margin cannot hide a difference.
function diff(a, b) {
  if (a.w !== b.w || a.h !== b.h) throw new Error(`size mismatch ${a.w}x${a.h} vs ${b.w}x${b.h}`);
  let sum = 0, max = 0, over8 = 0, camSum = 0, camN = 0;
  const heat = Buffer.alloc(a.w * a.h);
  for (let i = 0, p = 0; i < a.data.length; i += 3, p++) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    sum += d;
    if (!onTable(a.data, i) || !onTable(b.data, i)) { camSum += d; camN++; }
    const m = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    max = Math.max(max, m);
    if (m > 8) over8++;
    heat[p] = Math.min(255, m * 8);
  }
  const n = a.w * a.h;
  return { mean: +(sum / (3 * n)).toFixed(3), meanCamera: +(camSum / (3 * camN)).toFixed(3),
    cameraPct: +((100 * camN) / n).toFixed(1), max, pctOver8: +((100 * over8) / n).toFixed(3), heat };
}

async function main() {
  const postersDir = resolve(opt("--posters", join(out, "posters")));
  mkdirSync(join(out, "parity"), { recursive: true });
  if (!args.includes("--posters")) {
    const r = spawnSync(process.execPath, [join(repo, "scripts/build/posters/render.mjs"), "--out", postersDir], { encoding: "utf8" });
    process.stdout.write(r.stdout);
    if (r.status !== 0) throw new Error(`render.mjs failed\n${r.stderr}`);
  }
  const posters = JSON.parse(readFileSync(join(postersDir, "posters.json"), "utf8"));
  const { server, origin } = await serve({ posters: postersDir });
  const browser = await launch();
  const results = [];
  try {
    for (const p of PROFILES) {
      const s = slotFor(p);
      const band = posters.bands[s.band];
      const tier = p.touch ? "lite" : "full";
      const context = await browser.newContext({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: p.dpr, isMobile: p.touch && p.w < 1024, hasTouch: p.touch });
      const clip = { x: 0, y: 0, width: s.w, height: s.h };
      const gl = await runPage(context, origin, { mode: "gl", framing: band, w: String(s.w), h: String(s.h), tier }, { keep: true });
      if (SOFTWARE.test(gl.done.renderer)) throw new Error(`software renderer: ${gl.done.renderer}`);
      const glPng = await gl.page.screenshot({ clip });
      await gl.page.close();
      const row = { profile: p.id, viewport: [p.w, p.h], dpr: p.dpr, touch: p.touch, tier, band: s.band, slotCss: [s.w, s.h],
        gl: { lod: gl.done.lod, dpr: +gl.done.dpr.toFixed(3), buffer: gl.done.buffer, rect: gl.done.rect, renderer: gl.done.renderer } };
      const glRaw = await raw(glPng);
      const dir = join(out, "parity", p.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "gl.png"), glPng);
      // The poster set comes from stage.js posterSet(), the call the live stage makes before GL boots.
      const set = posterSet(band, { slotW: s.w, slotH: s.h, glDpr: gl.done.dpr, tier });
      row.posterLod = set.lod;
      if (set.lod !== gl.done.lod) throw new Error(`${p.id}: posterSet() picked lod${set.lod}, GL drew lod${gl.done.lod}`);
      for (const fmt of ["avif", "webp"]) {
        const srcset = set.files.map((f) => ({ url: `/x/posters/${f[fmt]}`, w: f.w }));
        const img = await runPage(context, origin, { mode: "img", framing: band, w: String(s.w), h: String(s.h), srcset }, { keep: true });
        const posterPng = await img.page.screenshot({ clip });
        await img.page.close();
        const d = diff(glRaw, await raw(posterPng));
        writeFileSync(join(dir, `poster-${fmt}.png`), posterPng);
        await sharp(d.heat, { raw: { width: glRaw.w, height: glRaw.h, channels: 1 } }).png().toFile(join(dir, `diff-${fmt}-x8.png`));
        row[fmt] = { src: img.done.currentSrc.split("/").pop(), mean: d.mean, meanCamera: d.meanCamera, cameraPct: d.cameraPct, max: d.max, pctOver8: d.pctOver8, pass: d.mean <= LIMIT };
      }
      row.pass = row.avif.pass && row.webp.pass;
      results.push(row);
      console.log(`${p.id.padEnd(6)} ${s.band.padEnd(8)} ${tier} lod${row.gl.lod} slot ${s.w}x${s.h}@${p.dpr}  ` +
        `avif ${row.avif.mean} (camera ${row.avif.meanCamera}, ${row.avif.src})  webp ${row.webp.mean} (camera ${row.webp.meanCamera})  ${row.pass ? "PASS" : "FAIL"}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  const report = { limitMean255: LIMIT, metric: "mean |gl - poster| over R, G, B of every slot pixel, 0-255",
    slotSizes: "estimate (tokens.space, tokens.stage.heroRow) until W-S1's hero exists", posters: postersDir,
    renderer: results[0]?.gl.renderer, pass: results.every((r) => r.pass), results };
  writeFileSync(join(out, "poster-diff.json"), JSON.stringify(report, null, 1) + "\n");
  console.log(`${report.pass ? "PASS" : "FAIL"}: worst mean ${Math.max(...results.flatMap((r) => [r.avif.mean, r.webp.mean]))} (limit ${LIMIT})`);
  if (!report.pass) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
