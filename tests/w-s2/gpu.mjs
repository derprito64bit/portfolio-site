#!/usr/bin/env node
// W-S2 GPU worst moment (#14 spec v1 row L8; the measurement ruling, #14 comment 5996745925; budgets.md's GPU worst
// moment and D-028). A port of portfolio-evidence/rulings/gpu-worst-moment/scripts: probe7 (the scout over every anchor
// rail.ts place() can give, the one-step jump), probe6 (capture one __stage.seek frame's WebGL2 calls, sentinel-fill,
// replay, compare bytes, then timed replays back to back) and probe5 (the cross-context ramp and the three-plant
// control). GPU-only ms come from EXT_disjoint_timer_query_webgl2 TIME_ELAPSED, Chrome on /RX 6700 XT/.
//   control  3 loads in a probe canvas (bench sheet8: 8 x 300x478 CSS px, 1366x960, DPR 1, no MSAA): flat <= 0.025 ms,
//            the stand-in 0.208 to 0.252 ms, heavy4 3.0 to 5.0x the stand-in. Every mode runs it first; a miss makes
//            every GPU row invalid (exit 75).
//   igpu     the lite cap: mouse 1366x768, DPR 1, /?tier=lite&t; renderer, tier, dpr and canvas <= 1.5 Mpx asserted.
//            10 loads, m = their median of each load's figure (the max over 5 frames of the median of 60 replays).
//            m x 30 <= 4 ms pass; m x 10 <= 4 ms accepted 'at risk' (owner, D-028; exit 0); above, fail.
//   ratio    D2 (1440x900, DPR 2, /?t, full tier, the capped canvas). Numerator loads time W-S2's prints and S (the
//            same capture with the tagged print draws skipped); denominator loads plant the stand-in wetMaterial on the
//            same meshes (probe.ts as at 0ff62c2; draws match one for one) and time it and S. Ratio =
//            (T_prints - S) / (T_standin - S) on medians, S the set's lowest; 5 loads each, 10 under R5; <= 1.5.
// One load: scout A(a) = dpr^2 x the area of the 8 sheet print slots in the canvas window [a, a + Hc] at every anchor
// on the device-pixel lattice; a* = the first argmax; one scroll step to a* + trail (invalidate before each seek);
// 1000/60 ms seeks at a* until the 'prints:develop' mark of group 's' (cap 2 s); from the mark the clock moves only in
// 1000/60 ms seeks; the 5 frames nearest k/6 (k = 1..5) of the window where all 8 are wet are captured and timed.
// Void (the load is replaced, at most --extra 5 per set, R3; unfillable means blocked): an error; disjoint or a missing
// result; 4+ bad samples in a frame (up to 3 dropped); replay bytes differing; a sheet print in the canvas not .is-gl
// or with no tagged draw; the anchor more than 1 device px off a*, or A under 0.99 A*; no trigger mark; any change of
// tier, tierLog or governorSteps; issue time over 4x the median on an iGPU frame over 0.1333 ms, a stand-in frame, or
// a numerator or S frame of a ratio over 1.5.
// Exit: 0 pass or accepted 'at risk', 1 fail, 75 blocked (host: no Chrome, the wrong renderer or tier, a control miss,
// a set that cannot fill). The perf queue (scripts/fleet/perfq.mjs, sets L8I and L8R) runs it at the approval candidate
// under the R1 precheck and the R2 watch; a fail or 'at risk' counts only on a clean set.
// --plant <name> (negative controls): heavy (W-S2's prints draw 4x the stand-in: igpu and ratio must FAIL, exit 1);
// fidelity (one tagged draw is skipped in the fidelity replay: every load void, exit 75); untag (no draw is tagged:
// void, exit 75); anchor (the jump lands 48 px past a* + trail: void, exit 75); control (the control's stand-in leg
// draws flat: a control miss, exit 75).
// Usage: node tests/w-s2/gpu.mjs --mode control|igpu|ratio --out <dir> [--dist <dir>] [--loads n] [--extra n]
//        [--plant name]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, browser, closeBrowsers, cliOpts, gitSha, median, readBudgets, serve } from '../harness/lib.mjs';
import { durations } from '../../src/lib/tokens.js';

const o = cliOpts();
const MODE = String(o.mode ?? 'igpu');
if (!['control', 'igpu', 'ratio'].includes(MODE)) {
  console.error(`gpu.mjs: --mode control|igpu|ratio, not ${MODE}`);
  process.exit(2);
}
const OUT = String(o.out ?? join(ROOT, 'w-s2-evidence'));
mkdirSync(OUT, { recursive: true });
const PLANT = o.plant ? String(o.plant) : null;
const EXTRA = o.extra !== undefined ? Number(o.extra) : 5;
const G = readBudgets().site.gpu;
/** The iGPU check's bars (budgets.md GPU worst moment): m x 30 <= 4 ms passes, m x 10 <= 4 ms is 'at risk'. */
const PASS_MS = G.worstMomentMs / G.hostMedianFactor;
const AT_RISK_MS = G.worstMomentMs / G.atRiskFactor;
const RATIO_MAX = G.crewRatioMax;
const RENDERER = /RX 6700 XT/;
/** The control's bands (ruling item 4). */
const BANDS = { flatMaxMs: 0.025, standinMs: [0.208, 0.252], heavy4OverStandin: [3.0, 5.0] };
const LITE_MAX_PX = 1.5e6;
const FULL_MAX_PX = 4.5e6;

// ---------------------------------------------------------------- shaders (raw WebGL2 for the probe canvas; the
// three.js stand-in is probe.ts's WET_VERT / WET_FRAG as at 0ff62c2, word for word)
const NOISE = 'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
  'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y); }\n' +
  'float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s += a*noise(p); p *= 2.03; a *= 0.5; } return s; }\n';
const WET = 'vec3 wet(vec2 p){ float n = fbm(p+fbm(p*0.7)); float d = smoothstep(n*0.6, n*0.6+0.4, uDev);\n' +
  ' vec3 dye = vec3(fbm(p+1.7), fbm(p+3.1), fbm(p+5.3)); vec3 base = vec3(0.06,0.09,0.1)+0.08*n; return mix(base, dye, d); }\n';
const RAW = {
  vs: '#version 300 es\nin vec2 aPos; in vec2 aUv; uniform vec4 uRect; uniform vec2 uView; out vec2 vUv;\nvoid main(){ vUv=aUv; vec2 p = uRect.xy + aPos*uRect.zw; gl_Position = vec4(p/uView*2.0-1.0, 0.0, 1.0); }',
  head: '#version 300 es\nprecision highp float;\nuniform float uDev; uniform float uSeed; in vec2 vUv; out vec4 o;\n' + NOISE,
  standin: WET + 'void main(){ o = vec4(wet(vUv*9.0+uSeed), 1.0); }',
  heavy4: WET + 'void main(){ vec2 p = vUv*9.0+uSeed; vec3 c = wet(p)+wet(p+11.3)+wet(p+23.9)+wet(p+37.1); o = vec4(c*0.25, 1.0); }',
  flat: 'void main(){ o = vec4(0.5,0.5,0.5,1.0) + 0.0*vec4(uDev+uSeed+vUv.x); }',
};
const THREE_WET = {
  vert: '\nvarying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  head: '\nprecision highp float;\nuniform float uDev;\nuniform float uSeed;\nvarying vec2 vUv;\n' + NOISE,
  standin: 'void main() {\n  vec2 p = vUv * 9.0 + uSeed;\n  float n = fbm(p + fbm(p * 0.7));\n  float d = smoothstep(n * 0.6, n * 0.6 + 0.4, uDev);\n  vec3 dye = vec3(fbm(p + 1.7), fbm(p + 3.1), fbm(p + 5.3));\n  vec3 base = vec3(0.06, 0.09, 0.1) + 0.08 * n;\n  gl_FragColor = vec4(mix(base, dye, d), 1.0);\n}',
  heavy4: WET + 'void main() { vec2 p = vUv * 9.0 + uSeed; vec3 c = wet(p) + wet(p + 11.3) + wet(p + 23.9) + wet(p + 37.1); gl_FragColor = vec4(c * 0.25, 1.0); }',
};

// ---------------------------------------------------------------- page side
/** Installed in every page first: the probe canvas's ramp and the timed-replay collector (probe5 / probe6). */
function LIB() {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const r5 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? x : Math.round(x * 100000) / 100000);
  /** A probe-owned raw WebGL2 context: bench sheet8 rects at 1366x960 CSS px, DPR 1, no MSAA. */
  function probeCtx(raw, w = 1366, h = 960, hidden = true) {
    const c = document.createElement('canvas');
    c.__probe = true;
    c.width = w;
    c.height = h;
    if (hidden) c.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(c);
    const gl = c.getContext('webgl2', { alpha: true, antialias: false, stencil: false, depth: true, powerPreference: 'high-performance', premultipliedAlpha: true, preserveDrawingBuffer: false });
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1]), gl.STATIC_DRAW);
    const mk = (body) => {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, raw.vs));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, raw.head + body));
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.bindAttribLocation(p, 1, 'aUv');
      gl.linkProgram(p);
      return { p, rect: gl.getUniformLocation(p, 'uRect'), view: gl.getUniformLocation(p, 'uView'), dev: gl.getUniformLocation(p, 'uDev'), seed: gl.getUniformLocation(p, 'uSeed') };
    };
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.viewport(0, 0, w, h);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0, 0, 0, 0);
    const rects = Array.from({ length: 8 }, (_, i) => [24 + (i % 4) * 324, h - 24 - Math.floor(i / 4) * 502 - 478, 300, 478]);
    const px = new Uint8Array(4);
    const frame = (P, i, k = 1) => {
      gl.useProgram(P.p);
      gl.uniform2f(P.view, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      for (let r = 0; r < k; r++) rects.forEach((rc, j) => { gl.uniform4f(P.rect, ...rc); gl.uniform1f(P.dev, ((i + j * 7) % 60) / 60); gl.uniform1f(P.seed, j * 3.7); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); });
    };
    const fence = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { gl, mk, frame, fence, renderer: (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })() };
  }
  /** probe5's cross-context ramp: the stand-in x4 with a 1x1 readPixels for >= 150 ms, then 40 frames without. */
  function ramper(raw) {
    const R = probeCtx(raw);
    const P = R.mk(raw.standin);
    return { ramp() { const t = performance.now(); let i = 0; while (performance.now() - t < 150) { R.frame(P, i++, 4); R.fence(); } for (let k = 0; k < 40; k++) R.frame(P, k, 4); return i; } };
  }
  /** 30 warm-up + 60 timed `work` calls back to back in TIME_ELAPSED queries, after the ramp. */
  async function timed(gl, work, X, fence) {
    const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const rampIters = X.ramp();
    const qs = [];
    const t0 = performance.now();
    for (let i = 0; i < 90; i++) {
      const q = gl.createQuery();
      gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
      work(i);
      gl.endQuery(tq.TIME_ELAPSED_EXT);
      if (i >= 30) qs.push(q);
      else gl.deleteQuery(q);
    }
    const issue = (performance.now() - t0) / 90;
    fence();
    const res = [];
    let disjoint = 0;
    let missing = 0;
    const cap = performance.now() + 2000;
    for (const q of qs) {
      while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && performance.now() < cap) await tick();
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { missing++; continue; }
      if (gl.getParameter(tq.GPU_DISJOINT_EXT)) disjoint++;
      res.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    const good = res.filter((x) => x >= 0 && x < 1000);
    const bad = res.length - good.length;
    const s = [...good].sort((a, b) => a - b);
    const m = med(good);
    const why = disjoint ? `disjoint ${disjoint}` : missing ? `missing ${missing}` : bad >= 4 ? `${bad} bad samples` : null;
    return { medianMs: r5(m), minMs: r5(s[0]), p90Ms: r5(s[Math.floor(s.length * 0.9)]), maxMs: r5(s[s.length - 1]), n: res.length, bad, disjoint, missing, issueMsPerReplay: r5(issue), issueOverMedian: m ? r5(issue / m) : null, rampIters, void: why };
  }
  window.__gpuLib = { tick, sleep, med, r5, probeCtx, ramper, timed };
}

/** Collect every stage WebGL2 context (not the probe's) as it is made. */
function INIT() {
  window.__gls = [];
  const og = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const c = og.call(this, type, attrs);
    if (c && type === 'webgl2' && !this.__probe && !window.__gls.includes(c)) window.__gls.push(c);
    return c;
  };
}

/** The control: per load, flat, the stand-in and heavy4, each in a fresh probe context after the ramp. */
async function CONTROL(cfg) {
  const L = window.__gpuLib;
  const X = L.ramper(cfg.raw);
  const out = { legs: {} };
  for (const leg of ['flat', 'standin', 'heavy4']) {
    const B = L.probeCtx(cfg.raw, 1366, 960, false);
    out.renderer = B.renderer;
    const P = B.mk(cfg.raw[cfg.plantControl && leg === 'standin' ? 'flat' : leg]);
    B.frame(P, 0);
    B.fence();
    out.legs[leg] = await L.timed(B.gl, (i) => B.frame(P, i), X, B.fence);
    B.gl.getExtension('WEBGL_lose_context')?.loseContext();
    await L.tick();
  }
  return out;
}

/** One stage load: scout, jump, trigger, the develop on 1000/60 ms seeks, 5 captures timed (and S when cfg.s). */
async function LOAD(cfg) {
  const L = window.__gpuLib;
  const { sleep, tick, r5 } = L;
  const FRAME = 1000 / 60;
  const S = window.__stage;
  const out = { voids: [] };
  const voidIt = (why) => out.voids.push(why);
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const live = () => window.__gls.filter((c) => c.canvas.isConnected && !c.isContextLost());
  const t0 = performance.now();
  while (!(S.gl && live().length && performance.getEntriesByName('prints:ready').length) && performance.now() - t0 < 20000) await sleep(50);
  if (!S.gl || !live().length) return { error: 'no live stage WebGL2 context', glState: S.glState, tier: S.tier };
  if (!performance.getEntriesByName('prints:ready').length) return { error: "no 'prints:ready' mark: the develop never registered", tier: S.tier };
  const gl = live()[live().length - 1];
  const dri = gl.getExtension('WEBGL_debug_renderer_info');
  out.renderer = dri ? gl.getParameter(dri.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  out.samples = gl.getParameter(gl.SAMPLES);
  if (!gl.getExtension('EXT_disjoint_timer_query_webgl2')) return { ...out, error: 'no EXT_disjoint_timer_query_webgl2' };
  await sleep(1500); // the camera GLB and posters settle (probe7)
  out.tier0 = S.tier;
  const tierLog0 = S.tierLog.length;
  const gov0 = S.stats.governorSteps;
  const v = { ...S.view };
  const dpr = v.dpr;
  out.view = v;
  out.canvas = { w: gl.drawingBufferWidth, h: gl.drawingBufferHeight, px: gl.drawingBufferWidth * gl.drawingBufferHeight };

  // ---- the capture wrapper (instance properties shadow the prototype; three.js looks gl.method up on every call)
  const CAP = { on: false, log: [], tag: null, slots: [] };
  const ORIG = {};
  const copy = (a) => (a instanceof DataView ? a : ArrayBuffer.isView(a) || Array.isArray(a) ? a.slice() : a);
  for (const name of Object.getOwnPropertyNames(WebGL2RenderingContext.prototype)) {
    const d = Object.getOwnPropertyDescriptor(WebGL2RenderingContext.prototype, name);
    if (!d || typeof d.value !== 'function' || name === 'constructor') continue;
    const f = d.value;
    ORIG[name] = f;
    const drop = /^(get|is|check)/.test(name);
    gl[name] = function (...a) {
      if (CAP.on && !drop) CAP.log.push([name, a.map(copy), CAP.tag]);
      return f.apply(this, a);
    };
  }
  const DRAW = new Set(['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']);
  const BW = gl.drawingBufferWidth;
  const BH = gl.drawingBufferHeight;
  const read = () => {
    const rb = ORIG.getParameter.call(gl, gl.READ_FRAMEBUFFER_BINDING);
    ORIG.bindFramebuffer.call(gl, gl.READ_FRAMEBUFFER, null);
    const px = new Uint8Array(BW * BH * 4);
    ORIG.readPixels.call(gl, 0, 0, BW, BH, gl.RGBA, gl.UNSIGNED_BYTE, px);
    ORIG.bindFramebuffer.call(gl, gl.READ_FRAMEBUFFER, rb);
    return px;
  };
  const px1 = new Uint8Array(4);
  const fence = () => {
    const rb = ORIG.getParameter.call(gl, gl.READ_FRAMEBUFFER_BINDING);
    ORIG.bindFramebuffer.call(gl, gl.READ_FRAMEBUFFER, null);
    ORIG.readPixels.call(gl, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);
    ORIG.bindFramebuffer.call(gl, gl.READ_FRAMEBUFFER, rb);
  };
  const sentinel = () => {
    const g = (p) => ORIG.getParameter.call(gl, p);
    const db = g(gl.DRAW_FRAMEBUFFER_BINDING);
    const sc = ORIG.isEnabled.call(gl, gl.SCISSOR_TEST);
    const cm = g(gl.COLOR_WRITEMASK);
    const cc = g(gl.COLOR_CLEAR_VALUE);
    ORIG.bindFramebuffer.call(gl, gl.DRAW_FRAMEBUFFER, null);
    ORIG.disable.call(gl, gl.SCISSOR_TEST);
    ORIG.colorMask.call(gl, true, true, true, true);
    ORIG.clearColor.call(gl, 1, 0, 1, 1);
    ORIG.clear.call(gl, gl.COLOR_BUFFER_BIT);
    ORIG.clearColor.call(gl, cc[0], cc[1], cc[2], cc[3]);
    ORIG.colorMask.call(gl, cm[0], cm[1], cm[2], cm[3]);
    if (sc) ORIG.enable.call(gl, gl.SCISSOR_TEST);
    ORIG.bindFramebuffer.call(gl, gl.DRAW_FRAMEBUFFER, db);
  };
  const diff = (a, b) => { let n = 0; let mx = 0; for (let i = 0; i < a.length; i++) { const x = Math.abs(a[i] - b[i]); if (x) { n++; if (x > mx) mx = x; } } return { bytes: n, maxAbs: mx }; };
  /** mode 'full' replays the frame; 'S' skips the tagged print draws (the frame's shared work); 'fid' is the
   *  fidelity replay (the fidelity plant skips its first tagged draw there). */
  const replay = (log, mode) => {
    let skipped = false;
    for (const [n, a, tag] of log) {
      if (tag && DRAW.has(n) && (mode === 'S' || (mode === 'plant' && !skipped))) { skipped = true; continue; }
      ORIG[n].apply(gl, a);
    }
  };

  // ---- scout (probe7): A(a) for every anchor on the device-pixel lattice
  const isSheet = (s) => s.kind === 'print' && /^project-\d+$/.test(s.id);
  const rect = (s) => ({ id: s.id, x0: s.cx - s.w / 2, x1: s.cx + s.w / 2, y0: s.cy - s.h / 2, y1: s.cy + s.h / 2, isGl: s.isGl });
  const sheetNow = () => S.slots().filter(isSheet).map(rect);
  const area = (sheet, x0, x1, top, bot) => dpr * dpr * sheet.reduce((acc, s) => acc + Math.max(0, Math.min(s.x1, x1) - Math.max(s.x0, x0)) * Math.max(0, Math.min(s.y1, bot) - Math.max(s.y0, top)), 0);
  const trail = Math.round(Math.max(0, v.Hc - v.H) * 0.25);
  const docH = document.documentElement.scrollHeight;
  const aMax = docH - v.H - trail;
  const sheet0 = sheetNow();
  out.sheetSlots = sheet0.length;
  if (sheet0.length !== cfg.sheetCount) voidIt(`${sheet0.length} sheet print slots, want ${cfg.sheetCount}`);
  const A = (a) => area(sheet0, 0, v.W, a, a + v.Hc);
  const N = Math.floor(aMax * dpr + 1e-6);
  let best = { j: 0, a: 0, A: -1 };
  for (let j = 0; j <= N; j++) { const x = A(j / dpr); if (x > best.A + 1e-6) best = { j, a: j / dpr, A: x }; }
  out.scout = { trail, docH, aMax, lattice: N + 1, aStar: best.a, AStar: Math.round(best.A) };

  // ---- the jump: seek at the top, then ONE scroll step to a* + trail (the re-anchor puts the anchor at a*)
  let T = 0;
  const go = (y) => { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); S.invalidate(); S.seek(T); };
  const before = new Set(S.gl.pageScene.children);
  go(0);
  await raf();
  go(best.a + trail + (cfg.plant === 'anchor' ? 48 : 0));
  await raf();
  const guardA = () => {
    const r = gl.canvas.getBoundingClientRect();
    return area(sheetNow(), r.left, r.right, r.top + scrollY, r.bottom + scrollY);
  };
  const Aj = guardA();
  out.jump = { scrollY, anchor: S.view.anchor, anchorErrDevPx: r5(Math.abs(S.view.anchor - best.a) * dpr), AOverAStar: r5(Aj / best.A) };
  if (out.jump.anchorErrDevPx > 1) voidIt(`anchor ${out.jump.anchorErrDevPx} device px off a*`);
  if (Aj < 0.99 * best.A) voidIt(`A ${Math.round(Aj)} under 0.99 A* ${Math.round(best.A)}`);

  // ---- 1000/60 ms seeks at a* until the sheet's develop trigger (cap 2 s)
  const sheetMark = () => performance.getEntriesByName('prints:develop').find((m) => m.detail?.group === 's');
  let pre = 0;
  while (!sheetMark() && pre < 120) {
    T += FRAME;
    S.invalidate();
    S.seek(T);
    pre++;
    await raf();
  }
  out.trigger = { framesBefore: pre, mark: Boolean(sheetMark()) };
  if (!sheetMark()) { voidIt('no prints:develop mark for the sheet within 2 s'); return out; }
  // The texture of each print is built in real time before its first develop frame; the clock does not move meanwhile.
  const fresh = () => S.gl.pageScene.children.filter((c) => c.isMesh && !before.has(c) && c.material?.uniforms?.uMap);
  const tb = performance.now();
  let n0 = -1;
  let steady = 0;
  while (performance.now() - tb < 4000) {
    await sleep(50);
    const n = fresh().length;
    steady = n === n0 ? steady + 1 : 0;
    n0 = n;
    if (n >= cfg.sheetCount && steady >= 4) break;
  }
  const meshes = fresh();
  out.printMeshes = meshes.length;
  if (meshes.length < cfg.sheetCount) { voidIt(`${meshes.length} print meshes built, want ${cfg.sheetCount}`); return out; }
  // The stand-in plant (the ratio's denominator) or the heavy plant: the same meshes, so the draws match one for one.
  if (cfg.plantMat) {
    meshes.forEach((m, k) => {
      const old = m.material;
      const u = old.uniforms;
      const mat = new old.constructor({ vertexShader: cfg.wet.vert, fragmentShader: cfg.wet.head + cfg.wet[cfg.plantMat], uniforms: { uDev: { value: 0.5 }, uSeed: { value: k * 7.3 }, uMap: u.uMap, uD: u.uD, uShadow: u.uShadow, uPad: u.uPad, uRadius: u.uRadius }, toneMapped: false });
      Object.assign(mat, { transparent: old.transparent, depthTest: old.depthTest, depthWrite: old.depthWrite, blending: old.blending, side: old.side });
      m.material = mat;
    });
    // Compiled now, outside a stage frame, so the plant adds no compile to the develop's frames.
    const vis = meshes.map((m) => m.visible);
    meshes.forEach((m) => (m.visible = true));
    S.gl.renderer.compile(S.gl.pageScene, S.gl.pageCamera);
    meshes.forEach((m, k) => (m.visible = vis[k]));
    out.planted = cfg.plantMat;
  }
  // Tags: each W-S2 print mesh's draws carry its slot id (the slot holding its card's centre this frame).
  const idAt = (x, y) => { for (const s of CAP.slots) if (Math.abs(x - s.cx) <= s.w / 2 && Math.abs(y - s.cy) <= s.h / 2) return s.id; return 'print?'; };
  if (cfg.plant !== 'untag') {
    for (const m of meshes) {
      m.onBeforeRender = function () { if (CAP.on) CAP.tag = idAt(this.position.x + S.view.W / 2 + scrollX, scrollY + S.view.H / 2 - this.position.y); };
      m.onAfterRender = function () { CAP.tag = null; };
    }
  }

  // ---- the develop on 1000/60 ms seeks; the window where all 8 are wet; captures at its k/6 points
  const ids = sheet0.map((s) => s.id);
  const first = {};
  let f0 = -1;
  let fEnd = -1;
  let observedEnd = -1;
  let targets = [];
  const X = L.ramper(cfg.raw);
  out.frames = [];
  const DEV = Math.round(cfg.developSheet / FRAME);
  for (let f = 1; f <= 400; f++) {
    const k = targets.indexOf(f);
    T += FRAME;
    S.invalidate();
    if (k >= 0) { CAP.slots = S.slots().filter((s) => s.kind === 'print'); CAP.log = []; CAP.tag = null; CAP.on = true; }
    S.seek(T);
    CAP.on = false;
    const cap = k >= 0 ? read() : null;
    const sl = S.slots().filter(isSheet);
    for (const s of sl) if (s.isGl && first[s.id] === undefined) first[s.id] = f;
    const all = ids.every((id) => sl.find((s) => s.id === id)?.isGl);
    if (all && f0 < 0) {
      f0 = f;
      // Each print is taken one frame after its first develop frame and handed back DEV frames after that frame.
      fEnd = Math.min(...ids.map((id) => first[id] - 1)) + DEV - 1;
      targets = [1, 2, 3, 4, 5].map((q) => f0 + Math.round((q / 6) * (fEnd - f0)));
    }
    if (f0 > 0 && !all && observedEnd < 0) observedEnd = f - 1;
    if (k >= 0) {
      const log = CAP.log;
      const tagged = {};
      for (const [n, , tag] of log) if (tag && DRAW.has(n)) tagged[tag] = (tagged[tag] || 0) + 1;
      const r = gl.canvas.getBoundingClientRect();
      const top = r.top + scrollY;
      const bot = r.bottom + scrollY;
      const inCanvas = sl.map(rect).filter((s) => Math.min(s.x1, r.right) > Math.max(s.x0, r.left) && Math.min(s.y1, bot) > Math.max(s.y0, top));
      const rec = { k: k + 1, f, t: r5(T), calls: log.length, draws: log.filter(([n]) => DRAW.has(n)).length, createsOrDeletes: log.filter(([n]) => /^(create|delete|compile|link)/.test(n)).length, tagged, inCanvas: inCanvas.length, A: Math.round(area(sl.map(rect), r.left, r.right, top, bot)) };
      const notGl = inCanvas.filter((s) => !s.isGl).map((s) => s.id);
      const untagged = inCanvas.filter((s) => !tagged[s.id]).map((s) => s.id);
      if (notGl.length) voidIt(`frame k=${k + 1}: ${notGl.join(',')} in the canvas and not .is-gl`);
      if (untagged.length) voidIt(`frame k=${k + 1}: ${untagged.join(',')} in the canvas with no tagged draw`);
      sentinel();
      replay(log, cfg.plant === 'fidelity' ? 'plant' : 'full');
      rec.fidelity = diff(cap, read());
      if (rec.fidelity.bytes) voidIt(`frame k=${k + 1}: the replay differs from the capture in ${rec.fidelity.bytes} bytes`);
      rec.full = await L.timed(gl, () => replay(log, 'full'), X, fence);
      if (rec.full.void) voidIt(`frame k=${k + 1}: ${rec.full.void}`);
      if (cfg.s) {
        rec.S = await L.timed(gl, () => replay(log, 'S'), X, fence);
        if (rec.S.void) voidIt(`frame k=${k + 1} S: ${rec.S.void}`);
      }
      out.frames.push(rec);
    }
    if (f0 > 0 && out.frames.length === 5 && observedEnd >= 0) break;
    if (f0 < 0 && f > 200) { voidIt('the 8 sheet prints were never all wet together'); break; }
    await tick();
  }
  out.window = { f0, predictedEnd: fEnd, observedEnd, targets, firstGl: first };
  if (out.frames.length < 5 && !out.voids.length) voidIt(`${out.frames.length} of 5 frames captured`);
  out.tier1 = S.tier;
  if (S.tier !== out.tier0 || S.tierLog.length !== tierLog0 || S.stats.governorSteps !== gov0) voidIt(`tier ${out.tier0} -> ${S.tier}, tierLog ${tierLog0} -> ${S.tierLog.length}, governorSteps ${gov0} -> ${S.stats.governorSteps}`);
  return out;
}

// ---------------------------------------------------------------- node side
const sha = (() => { try { return gitSha(); } catch { return null; } })();
const result = { schema: 1, suite: 'w-s2/gpu', mode: MODE, sha, at: new Date().toISOString(), plant: PLANT, ruling: '#14 comment 5996745925', bars: { passMs: PASS_MS, atRiskMs: AT_RISK_MS, ratioMax: RATIO_MAX, control: BANDS }, renderer: null };
try { result.amdDriver = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController | Where-Object Name -like \'*6700*\').DriverVersion"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null; } catch { result.amdDriver = null; }
let srv = null;
function finish(verdict, exit, reason) {
  Object.assign(result, { verdict, exit, reason });
  writeFileSync(join(OUT, 'gpu.json'), JSON.stringify(result, null, 1));
  const word = exit === 0 ? 'PASS' : exit === 1 ? 'FAIL' : 'BLOCKED';
  console.log(`w-s2 gpu --mode ${MODE}${PLANT ? ` --plant ${PLANT}` : ''}: ${word} (${verdict}) ${reason}`);
  return exit;
}
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: no result in ${ms / 1000} s`)), ms))]);

async function controlSet(b) {
  const loads = [];
  const voids = [];
  while (loads.length < 3 && voids.length <= EXTRA) {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    try {
      await page.goto('about:blank');
      await page.evaluate(LIB);
      const r = await withTimeout(page.evaluate(CONTROL, { raw: RAW, plantControl: PLANT === 'control' }), 60000, 'control load');
      const why = Object.entries(r.legs).filter(([, l]) => l.void).map(([k, l]) => `${k}: ${l.void}`);
      result.renderer ??= r.renderer;
      if (why.length) voids.push({ why: why.join('; '), r });
      else loads.push(r);
    } catch (e) {
      voids.push({ why: String(e.message ?? e) });
    }
    await ctx.close();
  }
  const m = (leg) => median(loads.map((l) => l.legs[leg].medianMs));
  const c = { loads: loads.map((l) => Object.fromEntries(Object.entries(l.legs).map(([k, x]) => [k, x.medianMs]))), voids, flatMs: m('flat'), standinMs: m('standin'), heavy4Ms: m('heavy4') };
  c.heavy4OverStandin = c.standinMs ? Math.round((c.heavy4Ms / c.standinMs) * 1000) / 1000 : null;
  const miss = [];
  if (loads.length < 3) miss.push(`${loads.length} of 3 control loads valid`);
  else {
    if (!(c.flatMs <= BANDS.flatMaxMs)) miss.push(`flat ${c.flatMs} ms > ${BANDS.flatMaxMs}`);
    if (!(c.standinMs >= BANDS.standinMs[0] && c.standinMs <= BANDS.standinMs[1])) miss.push(`stand-in ${c.standinMs} ms outside ${BANDS.standinMs.join(' to ')}`);
    if (!(c.heavy4OverStandin >= BANDS.heavy4OverStandin[0] && c.heavy4OverStandin <= BANDS.heavy4OverStandin[1])) miss.push(`heavy4 ${c.heavy4OverStandin}x the stand-in outside ${BANDS.heavy4OverStandin.join(' to ')}`);
  }
  c.pass = !miss.length;
  c.miss = miss;
  return c;
}

const SHEET_COUNT = 8;
async function stageLoad(b, kind) {
  const igpu = kind === 'igpu';
  const ctx = await b.newContext({ viewport: igpu ? { width: 1366, height: 768 } : { width: 1440, height: 900 }, deviceScaleFactor: igpu ? 1 : 2, hasTouch: false, isMobile: false, reducedMotion: 'no-preference', colorScheme: 'light', serviceWorkers: 'block' });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  let r;
  try {
    await page.goto(`${srv.base}${igpu ? '/?tier=lite&t' : '/?t'}`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__stage), null, { timeout: 15000 });
    await page.evaluate(LIB);
    const plantMat = kind === 'den' ? 'standin' : PLANT === 'heavy' ? 'heavy4' : null;
    r = await withTimeout(page.evaluate(LOAD, { raw: RAW, wet: THREE_WET, plantMat, plant: PLANT, s: !igpu, developSheet: durations.developSheet, sheetCount: SHEET_COUNT }), 120000, `${kind} load`);
  } catch (e) {
    r = { error: String(e.message ?? e) };
  }
  await ctx.close();
  r.kind = kind;
  r.pageErrors = errors;
  if (r.error) r.voids = [...(r.voids ?? []), r.error];
  r.figureMs = r.frames?.length === 5 ? Math.max(...r.frames.map((f) => f.full.medianMs)) : null;
  const at = r.frames?.findIndex((f) => f.full.medianMs === r.figureMs) ?? -1;
  r.figureFrame = at >= 0 ? r.frames[at].k : null;
  r.sMs = at >= 0 && r.frames[at].S ? r.frames[at].S.medianMs : null;
  return r;
}
/** The ruling's assertions (a configuration that cannot be judged here: blocked, host). */
function assertConfig(r, kind) {
  const bad = [];
  if (!RENDERER.test(String(r.renderer ?? ''))) bad.push(`renderer '${r.renderer}' is not ${RENDERER}`);
  if (r.tier0 !== (kind === 'igpu' ? 'lite' : 'full')) bad.push(`tier ${r.tier0}, want ${kind === 'igpu' ? 'lite' : 'full'}`);
  if (kind === 'igpu' && Math.abs((r.view?.dpr ?? 0) - 1) > 0.01) bad.push(`dpr ${r.view?.dpr}, want 1`);
  if (kind === 'igpu' && !(r.canvas?.px <= LITE_MAX_PX)) bad.push(`canvas ${r.canvas?.px} px > ${LITE_MAX_PX}`);
  if (kind !== 'igpu' && !(r.canvas?.px <= FULL_MAX_PX * 1.001 && r.view?.dpr < 2)) bad.push(`canvas ${r.canvas?.px} px at dpr ${r.view?.dpr}: not the capped canvas (<= ${FULL_MAX_PX} px, dpr < 2)`);
  return bad;
}
const brief = (r) => ({ kind: r.kind, figureMs: r.figureMs, figureFrame: r.figureFrame, sMs: r.sMs, voids: r.voids, renderer: r.renderer, tier: [r.tier0, r.tier1], view: r.view && { W: r.view.W, H: r.view.H, Hc: r.view.Hc, dpr: r.view.dpr, anchor: r.view.anchor }, canvas: r.canvas, scout: r.scout, jump: r.jump, trigger: r.trigger, window: r.window, printMeshes: r.printMeshes, planted: r.planted ?? null, frames: r.frames?.map((f) => ({ k: f.k, f: f.f, calls: f.calls, draws: f.draws, createsOrDeletes: f.createsOrDeletes, tagged: f.tagged, inCanvas: f.inCanvas, A: f.A, fidelity: f.fidelity, full: f.full, S: f.S ?? null })), pageErrors: r.pageErrors });

/** Loads of one kind until `need` valid ones, replacing void loads (R3: at most EXTRA). */
async function fill(b, kind, need, set, check) {
  while (set.valid.length < need) {
    if (set.voided.length > EXTRA) return false;
    const r = await stageLoad(b, kind);
    if (!r.error || r.renderer) {
      const cfgBad = r.tier0 !== undefined || r.renderer ? assertConfig(r, kind) : [];
      if (cfgBad.length) {
        set.config = cfgBad;
        set.voided.push(brief(r));
        return 'config';
      }
    }
    const extra = check ? check(r) : [];
    r.voids = [...(r.voids ?? []), ...extra];
    if (r.voids.length || r.figureMs === null) set.voided.push(brief(r));
    else set.valid.push(r);
    console.log(`  ${kind} load ${set.valid.length + set.voided.length}: ${r.voids.length ? `VOID (${r.voids.slice(0, 2).join('; ')})` : `figure ${r.figureMs} ms at k=${r.figureFrame}${r.sMs !== null ? `, S ${r.sMs}` : ''}`}`);
  }
  return true;
}

async function main() {
  let b;
  try {
    srv = await serve(o.dist ? String(o.dist) : join(ROOT, 'dist'));
    b = await browser('chromium');
    result.chrome = b.version();
  } catch (e) {
    return finish('blocked', 75, `no Chrome or no built dist: ${e.message ?? e}`);
  }
  // ---- the control, first
  const control = await controlSet(b);
  result.control = control;
  console.log(`  control: flat ${control.flatMs}, stand-in ${control.standinMs}, heavy4 ${control.heavy4OverStandin}x ${control.pass ? 'in band' : `MISS (${control.miss.join('; ')})`}`);
  if (result.renderer && !RENDERER.test(result.renderer)) return finish('blocked', 75, `renderer '${result.renderer}' is not ${RENDERER}`);
  if (!control.pass) return finish('invalid', 75, `the control missed: ${control.miss.join('; ')} (every GPU row is invalid)`);
  if (MODE === 'control') return finish('pass', 0, 'the control is in band');
  const baseline = ['gpu-baseline.json', 'docs/agents/gpu-baseline.json'].map((p) => join(ROOT, p)).find((p) => existsSync(p));
  result.regression = baseline ? { baseline, note: 'compare by hand: the 20% rule on timer values' , data: JSON.parse(readFileSync(baseline, 'utf8')) } : { baseline: null, note: 'gpu-baseline.json is absent: no comparison yet (ruling item 5)' };

  if (MODE === 'igpu') {
    const need = o.loads ? Number(o.loads) : 10;
    // Issue time over 4x the median voids an iGPU frame over the pass bar (it only raises readings).
    const check = (r) => (r.frames ?? []).filter((f) => f.full.medianMs > PASS_MS && f.full.issueOverMedian > 4).map((f) => `frame k=${f.k}: issue ${f.full.issueOverMedian}x the median over ${PASS_MS.toFixed(4)} ms`);
    const set = { valid: [], voided: [] };
    const ok = await fill(b, 'igpu', need, set, check);
    result.igpu = { need, loads: set.valid.map(brief), voided: set.voided, config: set.config ?? null };
    if (ok === 'config') return finish('blocked', 75, `configuration: ${set.config.join('; ')}`);
    if (!ok) return finish('invalid', 75, `${set.valid.length} of ${need} valid loads after ${set.voided.length} void (R3's budget is ${EXTRA})`);
    const m = median(set.valid.map((r) => r.figureMs));
    Object.assign(result.igpu, { mMs: m, x30Ms: m * 30, x10Ms: m * 10 });
    if (m <= PASS_MS) return finish('pass', 0, `m ${m.toFixed(5)} ms: x30 ${(m * 30).toFixed(3)} ms <= ${G.worstMomentMs}`);
    if (m <= AT_RISK_MS) return finish("accepted 'at risk' (owner, D-028)", 0, `m ${m.toFixed(5)} ms: x30 ${(m * 30).toFixed(3)} ms > ${G.worstMomentMs}, x10 ${(m * 10).toFixed(3)} ms <= ${G.worstMomentMs}; sent to the owner`);
    return finish('fail', 1, `m ${m.toFixed(5)} ms: x10 ${(m * 10).toFixed(3)} ms > ${G.worstMomentMs}`);
  }

  // ---- ratio
  let need = o.loads ? Number(o.loads) : 5;
  const N = { valid: [], voided: [] };
  const D = { valid: [], voided: [] };
  // A stand-in frame with issue time over 4x its median is void (it only raises readings).
  const checkD = (r) => (r.frames ?? []).filter((f) => f.full.issueOverMedian > 4).map((f) => `stand-in frame k=${f.k}: issue ${f.full.issueOverMedian}x the median`);
  const compute = () => {
    const sAll = [...N.valid, ...D.valid].map((r) => r.sMs).filter((x) => Number.isFinite(x));
    const S = Math.min(...sAll);
    const tp = median(N.valid.map((r) => r.figureMs));
    const ts = median(D.valid.map((r) => r.figureMs));
    return { S, tPrintsMs: tp, tStandinMs: ts, ratio: (tp - S) / (ts - S), perLoad: N.valid.map((r) => (r.figureMs - S) / (ts - S)), raw: tp / ts };
  };
  let grown = false;
  for (;;) {
    for (let i = 0; i < need * 2; i++) {
      const leg = i % 2 ? D : N;
      if (leg.valid.length >= need) continue;
      const ok = await fill(b, leg === D ? 'den' : 'num', leg.valid.length + 1, leg, leg === D ? checkD : null);
      if (ok === 'config') { result.ratio = { need, numerator: N.valid.map(brief), denominator: D.valid.map(brief), voided: [...N.voided, ...D.voided], config: leg.config }; return finish('blocked', 75, `configuration: ${leg.config.join('; ')}`); }
      if (!ok) { result.ratio = { need, numerator: N.valid.map(brief), denominator: D.valid.map(brief), voided: [...N.voided, ...D.voided] }; return finish('invalid', 75, `the ${leg === D ? 'stand-in' : 'prints'} leg has ${leg.valid.length} of ${need} valid loads after ${leg.voided.length} void (R3's budget is ${EXTRA})`); }
    }
    if (N.valid.length < need || D.valid.length < need) continue;
    let c = compute();
    // Over 1.5: a numerator or S frame with issue time over 4x its median is void, and its load is replaced.
    if (c.ratio > RATIO_MAX) {
      const flagged = N.valid.filter((r) => r.frames.some((f) => f.full.issueOverMedian > 4 || (f.S && f.S.issueOverMedian > 4)));
      if (flagged.length) {
        for (const r of flagged) { N.valid.splice(N.valid.indexOf(r), 1); r.voids.push('a numerator or S frame with issue over 4x its median, at a ratio over 1.5'); N.voided.push(brief(r)); }
        continue;
      }
    }
    // R5: near the budget (>= 85% of 1.5) or a load past it, the set grows to 10 loads each.
    if (!grown && need < 10 && (c.ratio >= 0.85 * RATIO_MAX || c.perLoad.some((x) => x > RATIO_MAX))) { grown = true; need = 10; continue; }
    result.ratio = { need, r5: grown, ...c, numerator: N.valid.map(brief), denominator: D.valid.map(brief), voided: [...N.voided, ...D.voided] };
    if (c.ratio <= RATIO_MAX) return finish('pass', 0, `(T_prints ${c.tPrintsMs} - S ${c.S}) / (T_standin ${c.tStandinMs} - S) = ${c.ratio.toFixed(3)} <= ${RATIO_MAX}`);
    return finish('fail', 1, `(T_prints ${c.tPrintsMs} - S ${c.S}) / (T_standin ${c.tStandinMs} - S) = ${c.ratio.toFixed(3)} > ${RATIO_MAX}`);
  }
}

let code = 2;
try {
  code = await main();
} catch (e) {
  console.error(e);
  code = finish('blocked', 75, `a tool error: ${e.message ?? e}`);
} finally {
  await closeBrowsers();
  await srv?.close();
}
process.exit(code);
