// Flash instrument (W-D030): WCAG 2.3.1 general and red flash analysis.
//   --self-test           synthetic sequences with known answers (GPU-free; CI runs this): the analyser must fail a
//                         5 Hz full-screen flash and a 5 Hz red flash, and pass a 2 Hz flash and a small-area flash.
//   --url <route> --seek  capture a seeked 60 fps filmstrip through __stage.seek on <route>?t=0 (reference host)
//                         over --ms (default 2000) after --trigger (a JS expression run once), then analyse it.
//   --frames <dir>        analyse PNG frames already on disk (name order), at --fps (default 60).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { analyse } from './analyse.mjs';
import { cliMain, closeBrowsers, newContext, serve, waitSettled } from '../lib.mjs';

const W = 256;
const H = 192;
function solid(rgb, area = 1) {
  const data = new Uint8Array(W * H * 3);
  const xMax = Math.round(W * Math.sqrt(area));
  const yMax = Math.round(H * Math.sqrt(area));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const on = x < xMax && y < yMax;
    data[i] = on ? rgb[0] : 20;
    data[i + 1] = on ? rgb[1] : 20;
    data[i + 2] = on ? rgb[2] : 20;
  }
  return { data, width: W, height: H, channels: 3 };
}
/** 60 fps for 1 s, toggling between two frames at `hz` flashes per second. */
function sequence(hz, a, b) {
  const frames = [];
  for (let i = 0; i < 60; i++) frames.push(Math.floor((i * hz * 2) / 60) % 2 ? b : a);
  return frames;
}

function selfTest() {
  const black = solid([20, 20, 20]);
  const white = solid([240, 240, 240]);
  const cases = [
    { name: '5 Hz full-screen white flash', frames: sequence(5, black, white), expect: false },
    { name: '2 Hz full-screen white flash', frames: sequence(2, black, white), expect: true },
    // 25% of a 10-degree field is about 2.8% of a 1024 x 768 screen: 1% stays under it, 4% does not.
    { name: '5 Hz flash over 1% of the screen', frames: sequence(5, black, solid([240, 240, 240], 0.01)), expect: true },
    { name: '5 Hz flash over 4% of the screen', frames: sequence(5, black, solid([240, 240, 240], 0.04)), expect: false },
    { name: '5 Hz saturated red flash', frames: sequence(5, black, solid([200, 0, 0])), expect: false },
    { name: 'no change', frames: sequence(0, black, white), expect: true },
  ];
  const rows = cases.map((c) => {
    const r = analyse(c.frames, 60);
    return { case: c.name, expectPass: c.expect, analyserPass: r.pass, generalPerSecond: r.generalPerSecond, redPerSecond: r.redPerSecond, correct: r.pass === c.expect };
  });
  return { schema: 1, instrument: 'flash', mode: 'self-test', pass: rows.every((r) => r.correct), rows, summary: `${rows.filter((r) => r.correct).length}/${rows.length} known sequences judged correctly` };
}

async function decode(buf, width = 512) {
  const { data, info } = await sharp(buf).resize({ width }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

export async function capture({ route, profile = 'D2', ms = 2000, fps = 60, trigger = '' }) {
  const srv = await serve();
  try {
    const ctx = await newContext(profile);
    const page = await ctx.newPage();
    await page.goto(`${srv.base}${route}${route.includes('?') ? '&' : '?'}t=0`, { waitUntil: 'load' });
    await waitSettled(page, 5000);
    if (trigger) await page.evaluate(trigger);
    const frames = [];
    for (let i = 0; i <= (ms * fps) / 1000; i++) {
      await page.evaluate((t) => window.__stage.seek(t), (i * 1000) / fps);
      frames.push(await decode(await page.screenshot()));
    }
    await ctx.close();
    return frames;
  } finally {
    await srv.close();
  }
}

export async function run(opts = {}) {
  if (opts['self-test']) return selfTest();
  let frames;
  if (opts.frames) {
    const files = readdirSync(opts.frames).filter((f) => f.endsWith('.png')).sort();
    frames = await Promise.all(files.map((f) => decode(readFileSync(join(opts.frames, f)))));
  } else if (opts.url) {
    frames = await capture({ route: opts.url, profile: opts.profile, ms: Number(opts.ms) || 2000, trigger: opts.trigger || '' });
    await closeBrowsers();
  } else {
    return selfTest();
  }
  const r = analyse(frames, Number(opts.fps) || 60);
  return { schema: 1, instrument: 'flash', mode: opts.url ? 'capture' : 'frames', ...r, summary: `${r.frames} frames: ${r.generalPerSecond} general and ${r.redPerSecond} red flashes in the worst second` };
}

await cliMain(import.meta.url, run);
