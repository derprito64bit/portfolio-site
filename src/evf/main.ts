// Viewfinder concept: boot, preloader, intro, the raise, the EVF (work, playback, owner info) and the open project.
import { gsap, Observer, SplitText, Flip, D, E, CHARS, CHARS_UP } from './motion';
import type { Engine, Meter, Rect } from './gl/engine';
import { projects, honours, phInner, isPlaceholder } from './data';
import type { Scene } from './scenes';
import { frameRect, writeRect, fitName, isPhone, type Mode } from './layout';
import { drawSnapshot } from './snapshot';

// ------------------------------------------------------------------ elements
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
const html = document.documentElement;
const calm = html.classList.contains('calm');
const intro = $('#intro');
const nameEl = $('[data-name]');
const raiseBtn = $<HTMLButtonElement>('[data-raise]');
const lmLabel = $('[data-lm-label]'), lmEv = $('[data-lm-ev]'), lmStep = $('[data-lm-step]');
const meter = $('[data-meter]');
const needle = $('[data-needle]');
const skipLink = $('[data-skip]');
const meterHome = $('[data-meter-home]'), meterEvf = $('[data-meter-evf]');
const progress = $('[data-progress]');
const marks = $$('.mk');
const marksHome = $('.marks');
const evf = $('#evf');
const frameEl = $('[data-frame]');
const afEl = $('[data-af]');
const levelEl = $('[data-level]');
const drum = $('[data-drum]');
const simBtns = $$<HTMLButtonElement>('[data-sim]');
const distMk = $('[data-dist-mk]'), distV = $('[data-dist]'), afMode = $('[data-af-mode]');
const capKicker = $('[data-kicker]'), capOf = $('[data-cap-of]'), titleLabel = $('[data-title-label]'), titlePh = $('[data-title-ph]');
const ssEl = $('[data-ss]'), fnEl = $('[data-fn]'), isoEl = $('[data-iso]');
const histCanvas = $<HTMLCanvasElement>('[data-hist]');
const evEl = $('[data-ev]');
const flEl = $('[data-fl]');
const countEl = $('[data-count]'), countOf = $('[data-count-of]');
const modeIcon = $('[data-mode-icon]'), modeLabel = $('[data-mode-label]');
const idxBtns = $$<HTMLButtonElement>('[data-go]');
const idxGrps = $$('[data-grp]');
const playEl = $('[data-screen="play"]'), infoEl = $('[data-screen="info"]');
const live = $('[data-live]');
const proj = $('#proj');
const projCol = $('[data-proj-col]');

const NW = projects.length, NP = honours.length, N = NW + NP + 1;
const modeOf = (i: number): Mode => (i < NW ? 'work' : i < NW + NP ? 'play' : 'info');
const pad = (n: number) => String(n).padStart(2, '0');
const apertureOf = (f: number) => 1.4 / Math.pow(f, 0.8);
const noiseOf = (iso: number) => 0.012 + Math.log2(iso / 160) * 0.0055;
const FLS = [23, 27, 33, 35, 40, 50, 56];
/** Focus distance readout from a depth (0 near, 1 far); mirrors scenes.ts. */
function distLabel(z: number) {
  if (z > 0.93) return '∞';
  const m = 0.3 / Math.max(0.02, 1 - z * 1.02);
  return m < 1 ? `${m.toFixed(2)}m` : m < 10 ? `${m.toFixed(1)}m` : `${Math.round(m)}m`;
}

// ------------------------------------------------------------------ state
type St = 'loading' | 'intro' | 'raising' | 'evf' | 'opening' | 'open' | 'closing' | 'lowering';
let S: St = 'loading';
let pos = 0;
let sim = 0;
let engine: Engine | null = null;
let scenes: Scene[] = [];
let tl: gsap.core.Timeline | null = null;
let afFrac = { x: 0.5, y: 0.5 };
let hovering = false;
const meterV = { ev: -3 };
const reveal = () => engine?.invalidate(160);

function setMeter(ev: number, label = true) {
  needle.style.setProperty('--ev', String(Math.max(-3.2, Math.min(3.2, ev))));
  if (label) {
    const r = Math.round(ev * 10) / 10;
    const t = `EV ${r === 0 ? '±0.0' : (r > 0 ? '+' : '−') + Math.abs(r).toFixed(1)}`;
    if (S === 'loading' || S === 'intro') lmEv.textContent = t;
    evEl.textContent = t;
  }
}

function swingMeter(ev: number) {
  gsap.to(meterV, { ev, duration: D.land, ease: E.needle, overwrite: true, onUpdate: () => setMeter(meterV.ev) });
}

function scramble(el: Element, text: string, dur: number = D.step, chars = CHARS_UP) {
  if (calm) { el.textContent = text; return; }
  gsap.to(el, { duration: dur, scrambleText: { text, chars, speed: 1.2 }, ease: 'none', overwrite: 'auto' });
}

function clock() {
  const d = new Date();
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  $$('[data-clock]').forEach((e) => { e.textContent = t; });
}
clock();
setInterval(clock, 10000);

// ------------------------------------------------------------------ histogram
function drawHist(m: Meter) {
  const ctx = histCanvas.getContext('2d')!;
  const W = histCanvas.width, H = histCanvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(236,233,226,0.07)';
  for (let i = 1; i < 4; i++) ctx.fillRect(Math.round((W * i) / 4), 0, 1, H);
  let max = 1;
  for (let i = 1; i < 63; i++) max = Math.max(max, m.hist[i]);
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let i = 0; i < 64; i++) ctx.lineTo((i / 63) * W, H - Math.min(1, Math.sqrt(m.hist[i] / max)) * H * 0.94);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = 'rgba(236,233,226,0.2)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(236,233,226,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (m.clip) { ctx.fillStyle = '#ffb13b'; ctx.fillRect(W - 6, 0, 6, H); }
}

// ------------------------------------------------------------------ scenes / subject
function halfOf(r: Rect) { const a = r.w / Math.max(1, r.h); return a >= 1 ? { x: a, y: 1 } : { x: 1, y: 1 / a }; }
/** The frame's subject: the largest solid shape on the focus plane. */
function subjectOf(s: Scene) {
  let best: { x: number; y: number; z: number } | null = null, area = 0;
  for (let i = 0; i < s.ns; i++) {
    const o = i * 20, z = s.shapes[o + 6];
    const a = s.shapes[o + 2] * s.shapes[o + 3];
    if (Math.abs(z - s.focus) < 0.035 && s.shapes[o + 11] >= 0.9 && s.shapes[o + 19] === 0 && s.shapes[o + 7] !== 3 && a > area) {
      area = a; best = { x: s.shapes[o], y: s.shapes[o + 1], z };
    }
  }
  return best ?? { x: s.glass[0], y: s.glass[1], z: s.focus };
}
function sceneToFrac(q: { x: number; y: number }, r: Rect) {
  const h = halfOf(r);
  return { x: Math.max(0.08, Math.min(0.92, (q.x / h.x + 1) / 2)), y: Math.max(0.1, Math.min(0.9, (1 - q.y / h.y) / 2)) };
}
function fracToScene(f: { x: number; y: number }, r: Rect) {
  const h = halfOf(r);
  return { x: (f.x * 2 - 1) * h.x, y: (1 - f.y * 2) * h.y };
}

// ------------------------------------------------------------------ HUD readouts
function placeAF(f: { x: number; y: number }) {
  afFrac = f;
  const r = engine?.st.rect ?? frameRect('work');
  afEl.style.setProperty('--afx', `${(f.x * r.w).toFixed(1)}px`);
  afEl.style.setProperty('--afy', `${(f.y * r.h).toFixed(1)}px`);
}
function syncDist() {
  const z = engine ? engine.st.focus : 0.4;
  const sc = $('.dist__scale');
  distMk.style.setProperty('--sh', `${sc.clientHeight}px`);
  distMk.style.setProperty('--zf', String(Math.max(0, Math.min(0.95, z))));
  distV.textContent = distLabel(z);
}
function lockAF(on: boolean) {
  afEl.classList.toggle('is-lock', on);
  afEl.classList.toggle('is-hunt', !on);
  afMode.textContent = hovering ? 'AF·S' : 'AF';
}

function updateReadouts(i: number, animate = true) {
  const m = modeOf(i);
  const s = scenes[i];
  idxBtns.forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.go) === i)));
  if (isPhone()) {
    const row = $('.idx'), cur = idxBtns.find((b) => Number(b.dataset.go) === i);
    if (cur) row.scrollTo({ left: cur.offsetLeft - row.clientWidth / 2 + cur.offsetWidth / 2, behavior: calm ? 'auto' : 'smooth' });
  }
  idxGrps.forEach((g) => g.classList.toggle('is-cur', g.dataset.grp === m));
  evf.dataset.mode = m;
  const icon = m === 'work' ? '' : m === 'play' ? 'is-play' : 'is-info';
  modeIcon.className = `ro__icon ${icon}`;
  const label = m === 'work' ? 'Shoot' : m === 'play' ? 'Play' : 'Set-up';
  const cnt = m === 'work' ? pad(i + 1) : m === 'play' ? `H${i - NW + 1}` : 'i';
  const of = m === 'work' ? `/${pad(NW)}` : m === 'play' ? `/${NP}` : '';
  if (animate) { scramble(modeLabel, label, D.step); scramble(countEl, cnt, D.step, CHARS); } else { modeLabel.textContent = label; countEl.textContent = cnt; }
  countOf.textContent = of;
  if (s) {
    const ss = s.shutter, fn = `F${s.fnum}`, iso = `ISO ${s.iso}`;
    if (animate) { scramble(ssEl, ss, D.step, CHARS); scramble(fnEl, fn, D.step, CHARS); scramble(isoEl, iso, D.step, CHARS); } else { ssEl.textContent = ss; fnEl.textContent = fn; isoEl.textContent = iso; }
  }
  if (m === 'work') {
    const p = projects[i];
    capKicker.textContent = 'Work';
    capOf.textContent = ` · ${pad(i + 1)}/${pad(NW)}`;
    if (animate) scramble(titleLabel, p.label.toUpperCase(), D.step); else titleLabel.textContent = p.label;
    titlePh.textContent = p.title;
    $$('[data-open]').forEach((b) => b.setAttribute('aria-label', `Open ${p.label}`));
    live.textContent = `${p.label} of ${pad(NW)}. ${p.title}`;
  } else if (m === 'play') {
    const h = honours[i - NW];
    $('[data-play-k]').textContent = `${h.label} · H${h.index + 1}/${NP}`;
    $('[data-play-title]').textContent = h.title;
    $('[data-play-event]').textContent = h.event;
    $('[data-play-place]').textContent = h.placement;
    $('[data-play-year]').textContent = h.year;
    live.textContent = `Honours, ${h.label}, ${h.index + 1} of ${NP}. ${h.title}`;
  } else {
    live.textContent = 'Contact, owner information.';
  }
  playEl.hidden = m !== 'play';
  infoEl.hidden = m !== 'info';
  if (s) ($('[data-ph-media]') as HTMLElement).dataset.label = `Placeholder media · ${s.label}`;
  $('[data-hint]').textContent = m === 'work'
    ? (isPhone() ? 'Swipe to advance · tap to focus · tap again to open' : 'Scroll or drag to advance · hover to focus · ↵ to open')
    : m === 'play' ? 'Playback · scroll or drag for the next honour' : 'Esc or “Lower the camera” to return to the intro';
}

// ------------------------------------------------------------------ preloader
async function boot() {
  const t0 = performance.now();
  const MIN = calm ? 0.5 : 1.8;
  let real = 0;
  const disp = { p: 0 };
  let done = false;
  const say = (s: string) => { lmStep.textContent = s; };
  const add = (w: number, label?: string) => { real = Math.min(1, real + w); if (label) say(label); };

  let chars: HTMLElement[] = [];
  let ticking = false;
  const exposed = new Set<number>();
  const exposeChar = (i: number) => {
    if (exposed.has(i)) return;
    exposed.add(i);
    const c = chars[i];
    if (calm) { c.style.setProperty('--c', '#ece9e2'); return; }
    // three stops in detents: -2, -1, 0 EV
    gsap.timeline()
      .set(c, { '--c': '#2c2b28' })
      .set(c, { '--c': '#6d6a63' }, 0.06)
      .set(c, { '--c': '#ece9e2' }, 0.12);
  };
  const tick = () => {
    const cap = Math.min(1, (performance.now() - t0) / 1000 / MIN);
    const target = Math.min(real, cap);
    disp.p += Math.max(0, target - disp.p) * 0.16;
    if (target - disp.p < 0.002) disp.p = target;
    const ev = -3 + 3 * disp.p;
    meterV.ev = ev;
    setMeter(ev);
    if (bgReady && engine) { engine.st.dim = dimFor(disp.p); engine.invalidate(60); }
    progress.setAttribute('aria-valuenow', String(Math.round(disp.p * 100)));
    chars.forEach((_, i) => { if (disp.p >= ((i + 1) / (chars.length + 1)) * 0.97) exposeChar(i); });
    if (disp.p >= 0.999 && !done) { done = true; gsap.ticker.remove(tick); release(); }
  };

  const timeout = setTimeout(() => { if (!done) { real = 1; say('Ready (timed out)'); } }, 6500);
  gsap.ticker.add(tick); ticking = true;
  // 1. fonts
  say('Fonts');
  await Promise.all([
    "300 125% 100px 'Archivo Variable'",
    "500 75% 20px 'Archivo Variable'",
    "400 11px 'Chivo Mono Variable'",
  ].map((f) => document.fonts.load(f).catch(() => null).then(() => add(0.1))));
  await document.fonts.ready;
  fitName(nameEl);
  const split = SplitText.create($$('.name__w', nameEl), { type: 'chars', charsClass: 'ch', aria: 'none' });
  chars = split.chars as HTMLElement[];
  void ticking;
  add(0.04, 'Shaders');
  await frame();

  // 2. WebGL programs
  try {
    const canvas = $<HTMLCanvasElement>('.gl');
    // the GL engine and the scene builders load as their own chunk, so the first script task stays short
    const { Engine: EngineClass } = await import('./gl/engine');
    engine = new EngineClass(canvas);
    engine.sway = !calm;
    engine.resize();
    say('Compiling shaders');
    await engine.compile((name) => { add(0.09, `Compiled ${name}`); });
    engine.onMeter = (m) => { drawHist(m); if (S === 'evf' || S === 'open') swingMeter(m.ev); };
    engine.start();
    (window as any).__vfEngine = engine;
  } catch (err) {
    console.warn('[viewfinder] WebGL unavailable, using flat frames', err);
    engine = null;
    html.classList.add('nogl');
    add(0.27, 'No WebGL: flat frames');
  }
  await frame();

  // 3. scenes, generated from each slug
  const tints = projects.map((p) => p.tint);
  const { projectScene, honourScene } = await import('./scenes');
  for (const p of projects) { scenes.push(projectScene(p)); add(0.012); }
  for (const h of honours) { scenes.push(honourScene(h, tints)); add(0.012); }
  say(`Frames ${pad(scenes.length)}/${pad(NW + NP)}`);
  await frame();

  // 4. frame one, drawn and metered: it waits behind the page, defocused, and exposes with the load
  if (engine) {
    introBackdrop(scenes[0], dimFor(disp.p));
    engine.invalidate(300);
    await frame(); await frame();
    engine.wantMeter();
    bgReady = true;
  }
  add(1, 'Frame 01 metered');
  clearTimeout(timeout);
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
let bgReady = false;
const INTRO_DIM = 0.125; // -3 EV
/** The frame behind the page exposes from -6 EV to -3 EV as the load completes. */
const dimFor = (p: number) => Math.pow(2, -6 + 3 * Math.min(1, p));
function introBackdrop(s: Scene, dim: number) {
  if (!engine) return;
  const st = engine.st;
  engine.setScene(s);
  Object.assign(st, {
    rect: frameRect('open'), alpha: 1, exposure: 1, focus: 0.12, aperture: apertureOf(s.fnum), zoom: 1, dolly: 0,
    parx: 0, pary: 0, roll: 0, tilt: 0, peak: 0, ca: 0, smear: 0, vig: 0.32, radius: 0, nd: 0, mix: 1, dim, poolAmt: 0, rim: 0, zebra: 0,
    noise: calm ? 0 : noiseOf(s.iso), ndv: 0, poolR: isPhone() ? 110 : 150,
  });
}

let releaseTl: gsap.core.Timeline | null = null;
function release() {
  S = 'intro';
  html.classList.remove('is-loading');
  html.classList.add('is-ready');
  raiseBtn.disabled = false;
  if (calm) {
    $$('.ch', nameEl).forEach((c) => c.style.setProperty('--c', '#ece9e2'));
    gsap.fromTo([nameEl, raiseBtn, '.intro__meta'], { opacity: 0 }, { opacity: 1, duration: 0.4 });
    lmLabel.textContent = 'Exposure'; lmStep.textContent = `Ready · ${pad(NW)} frames`;
    setMeter(0);
    return;
  }
  // the release, one beat: the needle lands, the name and the frame behind it bloom to over-exposure (with the
  // camera's highlight alert), then the name snaps into focus and the frame falls back to -3 EV
  const t = gsap.timeline();
  releaseTl = t;
  t.to(meterV, { ev: 0.6, duration: D.step, ease: E.in, onUpdate: () => setMeter(meterV.ev) });
  t.to(meterV, { ev: 0, duration: D.step, ease: E.detent, onUpdate: () => setMeter(meterV.ev) }, 0.42);
  t.to(nameEl, { '--nb': 1, duration: 0.2, ease: E.in }, 0.04);
  if (engine) t.to(engine.st, { dim: 1.7, zebra: 1, ca: 0.004, duration: 0.2, ease: E.in, onUpdate: reveal }, 0.04);
  t.call(() => nameEl.classList.add('is-zebra'), [], 0.2);
  t.call(() => nameEl.classList.remove('is-zebra'), [], 0.4);
  t.to(nameEl, { '--nb': 0, duration: D.snap, ease: E.detent }, 0.42);
  if (engine) t.to(engine.st, { dim: INTRO_DIM, zebra: 0, ca: 0, duration: D.land, ease: E.out, onUpdate: reveal }, 0.42);
  t.call(armIdle, [], 1.0);
  t.call(() => { scramble(lmLabel, 'Exposure', D.step); scramble(lmStep, `Ready · ${pad(NW)} frames · ${pad(NP)} honours`, D.land); }, [], 0.1);
  t.fromTo('.intro__meta > *', { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0.06 }, 0.22);
  t.call(() => { $$<HTMLElement>('.intro__meta .mono').forEach((e) => scramble(e, e.textContent ?? '', D.land)); }, [], 0.22);
  t.fromTo(raiseBtn, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0.42);
  t.call(() => scramble($('.raise__t'), 'Raise to eye', D.step), [], 0.42);
}

// ------------------------------------------------------------------ the raise
const PIECES = () => {
  const order = ['.ro--mode', '.ro--fl', '.ro--count', '.ro--clock', '.af', '.idx', '.dist', '.dial', '.expo', '.histo', '.cap', '.frame__ph', '.hint'];
  return order.map((s) => $(s, evf)).filter(Boolean);
};
function hudOn(stagger = 0.045) {
  const t = gsap.timeline();
  PIECES().forEach((el, i) => t.call(() => el.classList.add('on'), [], calm ? 0 : i * stagger));
  return t;
}
function hudOff() { PIECES().forEach((el) => el.classList.remove('on')); }

function flipMeterTo(slot: HTMLElement, dur: number) {
  const state = Flip.getState(meter);
  slot.appendChild(meter);
  if (!calm) Flip.from(state, { duration: dur, ease: E.out, absolute: true });
}
function flipMarks(toFrame: boolean, dur: number) {
  const state = Flip.getState(marks);
  marks.forEach((m) => (toFrame ? frameEl : marksHome).appendChild(m));
  if (!calm) Flip.from(state, { duration: dur, ease: E.out, absolute: true });
}

function raise() {
  if (S !== 'intro') return;
  S = 'raising';
  // a raise during the release finishes the release first, so nothing from the intro outlives it
  if (releaseTl) { releaseTl.progress(1); releaseTl = null; }
  stopRoam(); clearTimeout(idleTimer);
  gsap.killTweensOf(spot);
  if (engine) gsap.killTweensOf(engine.st, 'dim,zebra,ca,poolAmt,poolX,poolY');
  poolTo.x = poolTo.y = null;
  const rect = frameRect('work');
  writeRect(rect);
  updateReadouts(0, false);
  pos = 0;
  const snap = document.createElement('canvas');
  drawSnapshot(intro, snap, 1, [meter, marksHome]);
  evf.classList.add('is-on');
  evf.inert = false;
  intro.inert = true;
  skipLink.hidden = true;
  flipMeterTo(meterEvf, calm ? 0 : 1.1);
  flipMarks(true, calm ? 0 : 1.0);
  placeAF(sceneToFrac(subjectOf(scenes[0]), rect));

  if (!engine || calm) {
    const t = gsap.timeline({ onComplete: () => { S = 'evf'; intro.hidden = true; evf.focus(); } });
    t.to(intro, { opacity: 0, duration: 0.4 });
    t.add(hudOn(), 0.2);
    if (engine) {
      const st = engine.st;
      engine.holdPrevious();
      engine.setScene(scenes[0]);
      Object.assign(st, { rect, focus: scenes[0].focus, aperture: apertureOf(scenes[0].fnum), exposure: 1, mix: 1, alpha: 0, peak: 0, dim: 1, poolAmt: 0, rim: 1, vig: 0.28, radius: 5 });
      t.to(st, { alpha: 1, duration: 0.4, onUpdate: reveal }, 0.2);
    } else coverFor(0);
    t.call(() => engine?.wantMeter(), [], 0.7);
    return;
  }

  const st = engine.st;
  engine.setSnapshot(snap);
  const nr = nameEl.getBoundingClientRect();
  const asp = window.innerWidth / window.innerHeight;
  st.eyeCx = ((nr.left + nr.width / 2) / window.innerWidth - 0.5) * asp * 0.7;
  st.eyeCy = (0.5 - (nr.top + nr.height / 2) / window.innerHeight) * 0.7;
  stopRoam(); clearTimeout(idleTimer);
  st.eyeOn = true; st.eyeP = 0; st.poolAmt = 0;
  engine.idleTarget = 0;
  raiseBtn.classList.remove('is-idle');
  engine.invalidate(3000);
  requestAnimationFrame(() => requestAnimationFrame(() => { intro.style.visibility = 'hidden'; }));
  const s0 = scenes[0];
  tl = gsap.timeline({
    onComplete: () => { S = 'evf'; tl = null; intro.hidden = true; intro.style.visibility = ''; evf.focus({ preventScroll: true }); },
  });
  // the camera answers at once (a quick lift), then the eye closes in on the eyepiece
  tl.to(st, { eyeP: 0.3, duration: 0.2, ease: E.out, onUpdate: reveal });
  tl.to(st, { eyeP: 1, duration: 0.62, ease: 'power2.in', onUpdate: reveal });
  tl.call(() => {
    st.eyeOn = false;
    engine!.setScene(s0);
    Object.assign(st, { rect, alpha: 1, exposure: 0, focus: 0.02, aperture: apertureOf(s0.fnum), zoom: 1, dolly: 0, mix: 1, nd: 0, noise: noiseOf(s0.iso), radius: 5, dim: 1, poolAmt: 0, rim: 1, vig: 0.28, zebra: 0, ca: 0 });
    syncDist();
  }, [], 0.82);
  tl.add(hudOn(), 0.76);
  tl.to(st, { exposure: 1, duration: D.land, ease: E.out, onUpdate: reveal }, 1.05);
  tl.to(st, { focus: s0.focus, duration: 0.85, ease: E.rack, onUpdate: () => { reveal(); syncDist(); } }, 1.05);
  tl.call(() => { lockAF(false); afEl.classList.remove('is-off'); }, [], 1.05);
  tl.call(() => { lockAF(true); engine!.wantMeter(); }, [], 1.9);
}

function lower() {
  if (S !== 'evf') return;
  finishTl();
  S = 'lowering';
  intro.hidden = false;
  intro.style.opacity = '1';
  intro.style.visibility = 'hidden';
  const back = () => {
    gsap.killTweensOf(meterV);
    meterV.ev = 0;
    flipMeterTo(meterHome, calm ? 0 : 0.7);
    flipMarks(false, calm ? 0 : 0.7);
    setMeter(0);
    lmEv.textContent = 'EV ±0.0';
  };
  const done = () => {
    S = 'intro'; tl = null;
    evf.classList.remove('is-on'); evf.inert = true; intro.inert = false; skipLink.hidden = false; setMeter(0);
    intro.style.visibility = ''; raiseBtn.focus({ preventScroll: true });
    armIdle();
  };
  hudOff();
  if (!engine || calm) {
    back();
    gsap.fromTo(intro, { opacity: 0 }, { opacity: 1, duration: 0.4, onStart: () => { intro.style.visibility = ''; }, onComplete: done });
    if (engine) { engine.holdPrevious(); introBackdrop(scenes[Math.min(pos, scenes.length - 1)], INTRO_DIM); engine.st.mix = 0; gsap.to(engine.st, { mix: 1, duration: 0.4, onUpdate: reveal }); }
    return;
  }
  const st = engine.st;
  tl = gsap.timeline({ onComplete: done });
  tl.to(st, { exposure: 0, duration: D.step, ease: E.in, onUpdate: reveal });
  tl.call(() => {
    back();
    intro.style.visibility = 'visible';
    intro.style.opacity = '0';
    const snap = document.createElement('canvas');
    drawSnapshot(intro, snap, 1, [meter, marksHome]);
    intro.style.visibility = 'hidden';
    intro.style.opacity = '1';
    engine!.setSnapshot(snap);
    introBackdrop(scenes[Math.min(pos, scenes.length - 1)], INTRO_DIM);
    st.eyeOn = true; st.eyeP = 1;
  });
  tl.to(st, { eyeP: 0, duration: 0.65, ease: E.out, onUpdate: reveal });
  tl.call(() => { st.eyeOn = false; reveal(); });
}

// ------------------------------------------------------------------ flat fallback (no WebGL)
function coverFor(i: number) {
  const t = i < NW ? projects[i].tint : '#2b3a4a';
  frameEl.style.setProperty('--cover', `radial-gradient(120% 90% at 40% 45%, ${t} 0%, #0b0b0a 75%)`);
}

// ------------------------------------------------------------------ advancing
function finishTl() { if (tl) { const t = tl; tl = null; t.progress(1); } }

function go(to: number, dir?: number) {
  if (S !== 'evf' && S !== 'open') return;
  to = Math.max(0, Math.min(N - 1, to));
  if (to === pos) return;
  if (S === 'open' && modeOf(to) !== 'work') return;
  finishTl();
  const from = pos;
  const d = dir ?? Math.sign(to - from);
  pos = to;
  if (!engine) { coverFor(to); updateReadouts(to, false); return; }
  const mf = modeOf(from), mt = modeOf(to);
  if (calm) return crossfade(from, to);
  if (mf === 'work' && mt === 'work') tl = pull(to, d);
  else if (mf === 'play' && mt === 'play') tl = flick(to, d);
  else tl = switchMode(from, to);
  tl.eventCallback('onComplete', () => { tl = null; });
}

function crossfade(_from: number, to: number) {
  const st = engine!.st;
  const mt = modeOf(to);
  const rect = frameRect(mt === 'info' ? 'work' : mt);
  engine!.holdPrevious();
  writeRect(rect);
  st.rect = rect;
  engine!.setScene(scenes[Math.min(to, scenes.length - 1)]);
  const s = scenes[Math.min(to, scenes.length - 1)];
  Object.assign(st, { focus: mt === 'info' ? 0.02 : s.focus, aperture: apertureOf(s.fnum), exposure: mt === 'info' ? 0.2 : 1, mix: 0 });
  updateReadouts(to, false);
  placeAF(sceneToFrac(subjectOf(s), rect));
  syncDist();
  tl = gsap.timeline({ onComplete: () => { tl = null; } });
  tl.to(st, { mix: 1, duration: 0.4, ease: 'none', onUpdate: reveal });
  tl.call(() => engine!.wantMeter());
}

/** A focus pull: defocus, a hard cut under the blur (the detent), then rack in with one small hunt. */
function pull(to: number, dir: number, zoomed = false) {
  const st = engine!.st;
  const s = scenes[to];
  const hx = halfOf(st.rect).x;
  const t = gsap.timeline();
  lockAF(false);
  t.to(st, { peak: 0, duration: D.snap }, 0);
  t.to(st, { focus: 0.0, aperture: Math.max(st.aperture, 0.62), parx: -dir * 0.14 * hx, ca: 0.006, exposure: 0.9, roll: 0, duration: D.step, ease: E.in, onUpdate: () => { reveal(); syncDist(); } });
  t.call(() => {
    engine!.setScene(s);
    st.parx = dir * 0.14 * hx;
    st.aperture = apertureOf(s.fnum) * (zoomed ? 1.8 : 1);
    st.noise = noiseOf(s.iso);
    if (zoomed) { const z = zoomCentre(s); st.zcx = z.x; st.zcy = z.y; } else placeAF(sceneToFrac(subjectOf(s), st.rect));
    updateReadouts(to);
    if (zoomed) fillProject(to);
  });
  t.to(st, { focus: s.focus, duration: D.land, ease: E.rack, onUpdate: () => { reveal(); syncDist(); } });
  t.to(st, { parx: 0, ca: 0, exposure: 1, duration: D.land, ease: E.out }, '<');
  t.call(() => { lockAF(true); engine!.wantMeter(); if (hovering && !zoomed) gsap.to(st, { peak: 1, duration: D.snap, onUpdate: reveal }); });
  return t;
}

/** Playback: images flick past like a camera's review screen; no focus, they are already recorded. */
function flick(to: number, dir: number) {
  const st = engine!.st;
  const t = gsap.timeline();
  t.to(st, { smear: 0.06, exposure: 0, parx: -dir * 0.3, duration: D.snap, ease: E.in, onUpdate: reveal });
  t.call(() => { const s = scenes[to]; engine!.setScene(s); st.focus = s.focus; st.parx = dir * 0.3; st.aperture = apertureOf(s.fnum); updateReadouts(to); });
  t.to(st, { smear: 0, exposure: 1, parx: 0, duration: D.step, ease: E.out, onUpdate: reveal });
  t.call(() => engine!.wantMeter());
  return t;
}

/** Shoot, playback and set-up are different screens: the display blanks for a beat while the layout changes. */
function switchMode(from: number, to: number) {
  const st = engine!.st;
  const mt = modeOf(to);
  const rect = frameRect(mt === 'info' ? 'work' : mt);
  const s = scenes[Math.min(to, scenes.length - 1)];
  const t = gsap.timeline();
  hudOff();
  t.to(st, { exposure: 0, duration: D.snap, ease: E.in, onUpdate: reveal });
  t.call(() => {
    updateReadouts(to, false);
    if (mt !== 'info' || modeOf(from) !== 'info') engine!.setScene(s);
    Object.assign(st, { focus: mt === 'info' ? 0.0 : s.focus, aperture: apertureOf(s.fnum) * (mt === 'info' ? 1.6 : 1), smear: 0, parx: 0, noise: noiseOf(s.iso) });
    placeAF(sceneToFrac(subjectOf(s), rect));
  });
  t.to(st.rect, { x: rect.x, y: rect.y, w: rect.w, h: rect.h, duration: D.step, ease: E.lens, onUpdate: () => { writeRect(st.rect); reveal(); } });
  t.add(hudOn(0.035), '-=0.1');
  if (mt === 'info') t.fromTo('.info .menu li, .info__h, .info__k', { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0.05 }, '<');
  if (mt === 'play') t.fromTo('.play > *', { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: 0.05 }, '<');
  t.to(st, { exposure: mt === 'info' ? 0.22 : 1, duration: D.step, ease: E.out, onUpdate: reveal });
  t.call(() => { syncDist(); engine!.wantMeter(); if (mt === 'work') lockAF(true); });
  return t;
}

// ------------------------------------------------------------------ the open project
function zoomCentre(s: Scene, zoom = 2.3) {
  const target = isPhone() ? { x: 0.5, y: 0.27 } : { x: 0.68, y: 0.5 };
  const full = frameRect('open');
  const T = fracToScene(target, full);
  const sub = openTarget(s);
  // the subject S lands on T at the final zoom: T = zc + (S - zc) * zoom
  return { x: (T.x - sub.x * zoom) / (1 - zoom), y: (T.y - sub.y * zoom) / (1 - zoom) };
}
let afUsed = false;
/** What the zoom lands on: the object under the AF box if there is one, else the frame's subject. */
function openTarget(s: Scene) {
  if (afUsed) {
    const q = fracToScene(afFrac, frameRect('work'));
    const h = s.hitAt(q.x, q.y);
    if (h) return h;
  }
  return subjectOf(s);
}

function fillProject(i: number) {
  const p = projects[i];
  $('[data-proj-k]').textContent = `Work · Frame ${pad(i + 1)}/${pad(NW)}`;
  $('[data-proj-title]').textContent = p.label;
  $('[data-proj-ph]').textContent = p.title;
  const rows: [string, string][] = [['Role', p.role], ['Year', p.year], ['Tools', p.tools.length ? p.tools.join(', ') : '[PLACEHOLDER: tools]'], ['Link', p.url || '[PLACEHOLDER: link]']];
  $('[data-proj-exif]').innerHTML = rows.map(([k, v]) => `<div><dt class="mono">${k}</dt><dd>${isPlaceholder(v) ? `<span class="ph">${v}</span>` : v}</dd></div>`).join('');
  $('[data-proj-blurb]').innerHTML = `<span class="ph ph--wrap">${p.blurb}</span>`;
  $('[data-proj-body]').innerHTML = p.body.map((b) => `<p><span class="ph ph--wrap">${b}</span></p>`).join('');
  const media = p.media.length ? p.media : [{ type: 'image', alt: '[PLACEHOLDER: screenshot or photo]', caption: '' }];
  $('[data-proj-media]').innerHTML = media.map((m, k) => `<li><span class="mono">Media ${pad(k + 1)} · ${m.type}</span><span class="ph ph--wrap">${m.alt}</span></li>`).join('');
  $$('.proj__col > *').forEach((e) => e.classList.add('rv'));
  projCol.scrollTop = 0;
  void phInner;
}

function openProject() {
  if (S !== 'evf' || modeOf(pos) !== 'work') return;
  finishTl();
  S = 'opening';
  fillProject(pos);
  const full = frameRect('open');
  proj.hidden = false;
  const items = $$('.proj__col > *, .proj__bar');
  const settle = () => { S = 'open'; ($('[data-proj-title]') as HTMLElement).setAttribute('tabindex', '-1'); ($('[data-close]') as HTMLElement).focus({ preventScroll: true }); };
  evf.inert = true;
  evf.classList.add('is-open');
  if (engine) engine.idleTarget = 0;
  if (!engine || calm) {
    hudOff();
    writeRect(full);
    if (engine) { const st = engine.st; engine.holdPrevious(); st.rect = full; st.nd = 1; st.ndv = isPhone() ? 1 : 0; st.radius = 0; st.rim = 0; st.mix = 0; tl = gsap.timeline({ onComplete: () => { tl = null; settle(); } }); tl.to(st, { mix: 1, duration: 0.4, onUpdate: reveal }); }
    else { writeRect(full); tl = gsap.timeline({ onComplete: () => { tl = null; settle(); } }); }
    tl.fromTo(items, { opacity: 0, y: 0 }, { opacity: 1, duration: 0.4 }, 0);
    return;
  }
  const st = engine.st;
  const s = scenes[pos];
  const zoom = isPhone() ? 1.45 : Math.max(1.3, (56 / 23) / (full.w / st.rect.w));
  const zc = zoomCentre(s, zoom);
  gsap.to(st, { peak: 0, duration: D.snap, overwrite: 'auto', onUpdate: reveal });
  st.zcx = zc.x; st.zcy = zc.y;
  evf.classList.add('is-open');
  const subZ = openTarget(s).z;
  const fl = { v: 23 };
  const flUp = () => {
    const v = FLS.reduce((a, b) => (Math.abs(b - fl.v) < Math.abs(a - fl.v) ? b : a));
    flEl.textContent = String(v);
    $('[data-fl2]').textContent = `${v}mm`;
  };
  afEl.classList.add('is-off');
  gsap.set(items, { opacity: 0, y: 14 });
  tl = gsap.timeline({ onComplete: () => { tl = null; } });
  tl.call(settle, [], D.travel);
  tl.call(() => { $$('.evf .pw.on').forEach((e) => { if (!e.matches('.ro--fl')) e.classList.remove('on'); }); }, [], 0.08);
  tl.to(st.rect, { x: full.x, y: full.y, w: full.w, h: full.h, duration: D.travel, ease: E.lens, onUpdate: () => { writeRect(st.rect); reveal(); } }, 0);
  tl.to(st, { zoom, dolly: 0.08, focus: subZ, aperture: apertureOf(s.fnum) * 1.6, radius: 0, rim: 0, vig: 0.38, duration: D.travel, ease: E.lens }, 0);
  st.ndv = isPhone() ? 1 : 0;
  tl.to(fl, { v: 56, duration: D.travel, ease: E.lens, onUpdate: flUp }, 0);
  tl.to(st, { nd: isPhone() ? 0.9 : 1, duration: D.land, ease: E.out }, D.travel - 0.15);
  tl.to(items, { opacity: 1, y: 0, duration: D.land, ease: E.out, stagger: 0.1 }, D.travel - 0.1);
  tl.call(() => $('.ro--fl').classList.remove('on'), [], D.travel - 0.14);
}

function closeProject() {
  if (S !== 'open') return;
  finishTl();
  S = 'closing';
  const rect = frameRect('work');
  const items = $$('.proj__col > *, .proj__bar');
  const done = () => { S = 'evf'; tl = null; proj.hidden = true; evf.inert = false; evf.classList.remove('is-open'); ($('[data-open]') as HTMLElement).focus({ preventScroll: true }); afEl.classList.remove('is-off'); };
  if (!engine || calm) {
    tl = gsap.timeline({ onComplete: done });
    tl.to(items, { opacity: 0, duration: 0.2 });
    tl.call(() => {
      writeRect(rect);
      if (engine) { const st = engine.st; engine.holdPrevious(); st.rect = rect; st.nd = 0; st.radius = 5; st.rim = 1; st.mix = 0; gsap.to(st, { mix: 1, duration: 0.3, onUpdate: reveal }); }
    });
    tl.add(hudOn());
    return;
  }
  const st = engine.st;
  const fl = { v: 56 };
  const k = 0.55;
  tl = gsap.timeline({ onComplete: done });
  tl.to(items, { opacity: 0, y: -8, duration: D.snap, ease: E.in });
  tl.to(st, { nd: 0, duration: D.step * k * 2, ease: E.in }, 0);
  tl.to(st.rect, { x: rect.x, y: rect.y, w: rect.w, h: rect.h, duration: D.travel * k, ease: E.lens, onUpdate: () => { writeRect(st.rect); reveal(); } }, 0.06);
  tl.to(st, { zoom: 1, dolly: 0, aperture: apertureOf(scenes[pos].fnum), radius: 5, rim: 1, vig: 0.28, duration: D.travel * k, ease: E.lens }, 0.06);
  tl.to(fl, { v: 23, duration: D.travel * k, ease: E.lens, onUpdate: () => { flEl.textContent = String(FLS.reduce((a, b) => (Math.abs(b - fl.v) < Math.abs(a - fl.v) ? b : a))); } }, 0.06);
  tl.add(hudOn(0.025), 0.3);
  tl.call(() => { placeAF(sceneToFrac(subjectOf(scenes[pos]), rect)); lockAF(true); engine!.wantMeter(); });
}

// ------------------------------------------------------------------ film simulation dial
function setSim(i: number, focusIt = false) {
  if (i === sim) return;
  sim = (i + simBtns.length) % simBtns.length;
  simBtns.forEach((b, k) => { b.setAttribute('aria-checked', String(k === sim)); b.tabIndex = k === sim ? 0 : -1; });
  drum.style.setProperty('--sel', String(sim));
  if (focusIt) simBtns[sim].focus();
  if (!engine) return;
  const st = engine.st;
  gsap.killTweensOf(st, 'simT');
  st.simA = st.simT > 0.5 ? st.simB : st.simA;
  st.simB = sim; st.simT = 0;
  gsap.to(st, { simT: 1, duration: calm ? 0.01 : D.step, ease: 'none', onUpdate: reveal, onComplete: () => { st.simA = sim; st.simT = 0; engine!.wantMeter(); } });
}
simBtns.forEach((b, k) => b.addEventListener('click', () => setSim(k)));
$('[data-dial]').addEventListener('keydown', (e) => {
  const k = (e as KeyboardEvent).key;
  if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(k)) {
    e.preventDefault(); e.stopPropagation();
    setSim(sim + (k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 1), true);
  }
});

// ------------------------------------------------------------------ pointer: touch-AF, peaking, drag
let afTimer = 0;

function focusAt(f: { x: number; y: number }, snap = true) {
  if (!engine || calm) return;
  const st = engine.st;
  const cols = 15, rows = 9;
  const g = snap ? { x: (Math.min(cols - 1, Math.floor(f.x * cols)) + 0.5) / cols, y: (Math.min(rows - 1, Math.floor(f.y * rows)) + 0.5) / rows } : f;
  if (g.x === afFrac.x && g.y === afFrac.y && afUsed) return;
  afUsed = true;
  placeAF(g);
  const q = fracToScene(g, st.rect);
  const z = scenes[pos].depthAt(q.x - st.parx * 0, q.y);
  lockAF(false);
  gsap.to(st, { focus: z, duration: 0.34, ease: E.rack, overwrite: 'auto', onUpdate: () => { reveal(); syncDist(); } });
  clearTimeout(afTimer);
  afTimer = window.setTimeout(() => lockAF(true), 300);
}

function enterHover(e: PointerEvent) {
  if (S !== 'evf' || !engine || calm || e.pointerType === 'touch' || modeOf(pos) === 'info') return;
  hovering = true;
  gsap.to(engine.st, { peak: 1, duration: D.snap, onUpdate: reveal });
}
// a pointer already resting over the frame when the EVF powers on gets no pointerenter: its first move counts
frameEl.addEventListener('pointerenter', enterHover);
frameEl.addEventListener('pointerleave', () => {
  if (!engine || !hovering) return;
  hovering = false;
  afUsed = false;
  const s = scenes[pos];
  gsap.to(engine.st, { peak: 0, tilt: 0, duration: D.land, ease: E.out, onUpdate: reveal });
  if (S === 'evf' && modeOf(pos) === 'work') {
    gsap.to(engine.st, { focus: s.focus, duration: D.land, ease: E.rack, onUpdate: () => { reveal(); syncDist(); } });
    placeAF(sceneToFrac(subjectOf(s), engine.st.rect));
    lockAF(true);
  }
});
type Drag = { x0: number; y0: number; t0: number; moved: boolean; id: number; type: string; f0: number; swapped: number; base: number; vx: number; lastA: number; lastT: number };
let drg: Drag | null = null;
frameEl.addEventListener('pointerdown', (e) => {
  if (S !== 'evf' || modeOf(pos) === 'info') return;
  const now = performance.now();
  drg = { x0: e.clientX, y0: e.clientY, t0: now, moved: false, id: e.pointerId, type: e.pointerType, f0: engine ? engine.st.focus : 0.4, swapped: 0, base: 0, vx: 0, lastA: 0, lastT: now };
  frameEl.setPointerCapture(e.pointerId);
});
const alongOf = (dx: number, dy: number) => (Math.abs(dx) >= Math.abs(dy) ? dx : -dy);
frameEl.addEventListener('pointermove', (e) => {
  if (S !== 'evf' || !engine) return;
  const st = engine.st;
  const f = { x: (e.clientX - st.rect.x) / st.rect.w, y: (e.clientY - st.rect.y) / st.rect.h };
  if (drg) {
    const d = drg;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    const along = alongOf(dx, dy);
    const now = performance.now();
    d.vx = d.vx * 0.5 + ((along - d.lastA) / Math.max(1, now - d.lastT)) * 0.5;
    d.lastA = along; d.lastT = now;
    if (!d.moved && Math.hypot(dx, dy) > 8) {
      d.moved = true; finishTl(); levelEl.classList.add('is-on');
      gsap.killTweensOf(st, 'focus,parx,roll,ca,peak');
      d.f0 = st.focus; st.peak = 0; lockAF(false);
    }
    if (!d.moved || calm) return;
    if (modeOf(pos) === 'play') { tiltTo({ x: 0.5 + dx / st.rect.w, y: 0.5 }); return; }
    const hx = halfOf(st.rect).x;
    const thr = Math.max(60, st.rect.w * 0.18);
    const dir = along < 0 ? 1 : -1;
    const target = pos + dir;
    if (!d.swapped) {
      const k = Math.min(1, Math.abs(along) / thr);
      st.focus = d.f0 * (1 - k);
      st.ca = 0.006 * k;
      st.parx = (along / st.rect.w) * 2 * hx * 0.4;
      if (k >= 1 && target >= 0 && target < NW) {
        // the detent: under the blur the next frame cuts in, on the side it comes from
        d.swapped = dir; d.base = along;
        pos = target;
        const s = scenes[target];
        engine.setScene(s);
        st.aperture = apertureOf(s.fnum); st.noise = noiseOf(s.iso);
        updateReadouts(target);
        placeAF(sceneToFrac(subjectOf(s), st.rect));
        st.parx = dir * 0.14 * hx;
      }
    } else {
      st.parx = d.swapped * 0.14 * hx + ((along - d.base) / st.rect.w) * 2 * hx * 0.4;
      st.focus = 0;
    }
    st.roll = (along / st.rect.w) * 0.05;
    levelEl.style.setProperty('--roll', `${-st.roll}rad`);
    levelEl.classList.toggle('is-level', Math.abs(st.roll) < 0.002);
    reveal(); syncDist();
    return;
  }
  if (e.pointerType === 'touch' || modeOf(pos) === 'info') return;
  if (!hovering) enterHover(e);
  if (modeOf(pos) === 'play') { tiltTo(f); return; }
  focusAt(f);
});
/** Playback: the pointer turns the piece under the light, so the glass refracts and the metal's highlight travels. */
function tiltTo(f: { x: number; y: number }) {
  if (!engine || calm) return;
  gsap.to(engine.st, { tilt: (f.x - 0.5) * 0.7, duration: D.land, ease: E.out, overwrite: 'auto', onUpdate: reveal });
}
function springHome(focus: number) {
  if (!engine) return;
  const st = engine.st;
  gsap.to(st, { focus, duration: 0.95, ease: 'elastic.out(1, 0.42)', onUpdate: () => { reveal(); syncDist(); } });
  gsap.to(st, { parx: 0, roll: 0, ca: 0, duration: 0.85, ease: 'elastic.out(1, 0.55)', onUpdate: reveal });
  window.setTimeout(() => { lockAF(true); engine?.wantMeter(); if (hovering) gsap.to(st, { peak: 1, duration: D.snap, onUpdate: reveal }); }, 520);
}
const endDrag = (e: PointerEvent) => {
  if (!drg || e.pointerId !== drg.id) return;
  const d = drg; drg = null;
  levelEl.classList.remove('is-on');
  const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
  if (!d.moved) {
    if (e.type === 'pointercancel') return;
    if (modeOf(pos) !== 'work') return;
    if (d.type === 'touch' && engine && !calm) {
      const st = engine.st;
      const f = { x: (e.clientX - st.rect.x) / st.rect.w, y: (e.clientY - st.rect.y) / st.rect.h };
      // a second tap close to the AF box opens; a first tap focuses there
      const near = Math.abs(f.x - afFrac.x) < 0.12 && Math.abs(f.y - afFrac.y) < 0.12 && afUsed;
      if (near) openProject();
      else { focusAt(f); gsap.fromTo(st, { peak: 1 }, { peak: 0, duration: 0.9, delay: 0.25, onUpdate: reveal }); }
      return;
    }
    openProject();
    return;
  }
  // released after the cut: the new frame springs home and the focus rack settles with one overshoot
  if (d.swapped) { springHome(scenes[pos].focus); return; }
  const along = alongOf(dx, dy);
  const v = Math.max(Math.abs(d.vx), Math.abs(along) / Math.max(1, performance.now() - d.t0));
  const dir = along < 0 ? 1 : -1;
  const target = pos + dir;
  // a fast swipe of more than 60 px, or a long drag, goes to the next or previous frame
  if (target >= 0 && target < N && ((Math.abs(along) > 60 && v > 0.3) || Math.abs(along) > Math.max(60, (engine?.st.rect.w ?? 400) * 0.18))) {
    if (engine) gsap.to(engine.st, { roll: 0, duration: D.step, ease: E.out });
    go(target, dir);
    return;
  }
  if (calm) return;
  springHome(d.f0);
};
frameEl.addEventListener('pointerup', endDrag);
frameEl.addEventListener('pointercancel', endDrag);

// ------------------------------------------------------------------ wheel and swipe intent
let wheelLock = false, lockAt = 0;
function intent(dir: 1 | -1, kind: 'wheel' | 'touch') {
  const now = performance.now();
  if (wheelLock && now - lockAt < 700) return;
  if (S === 'intro' && dir === 1) { wheelLock = true; lockAt = now; raise(); return; }
  if (S !== 'evf') return;
  if (calm && kind === 'wheel') return;
  wheelLock = true; lockAt = now;
  go(pos + dir, dir);
}
Observer.create({
  target: window,
  type: 'wheel,touch',
  wheelSpeed: -1,
  tolerance: 12,
  onUp: (self) => { if (fromFrame(self.event)) return; intent(1, self.event.type.startsWith('wheel') ? 'wheel' : 'touch'); },
  onDown: (self) => { if (fromFrame(self.event)) return; intent(-1, self.event.type.startsWith('wheel') ? 'wheel' : 'touch'); },
  onStop: () => { wheelLock = false; },
  onStopDelay: 0.16,
});
function fromFrame(e: Event | undefined) {
  if (!e || e.type.startsWith('wheel')) return false;
  const t = e.target as Element | null;
  return !!t?.closest?.('[data-frame], .proj, .play, .info');
}

// ------------------------------------------------------------------ keyboard
window.addEventListener('keydown', (e) => {
  const k = e.key;
  const t = e.target as HTMLElement;
  const onControl = t && t.closest && t.closest('button, a, [role="radio"]') && !t.closest('[data-go]');
  if (S === 'loading') return;
  if (S === 'intro') {
    if ((k === 'Enter' || k === ' ' || k === 'ArrowDown' || k === 'PageDown') && !(t && t.closest('a'))) { e.preventDefault(); raise(); }
    return;
  }
  if (S === 'raising' && tl && (k === 'Enter' || k === 'Escape' || k === ' ')) { tl.timeScale(4); return; }
  if (S === 'open') {
    if (k === 'Escape') { e.preventDefault(); closeProject(); }
    else if (k === 'ArrowRight') { e.preventDefault(); goOpen(1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); goOpen(-1); }
    return;
  }
  if (S !== 'evf') return;
  if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(k) || (k === ' ' && !onControl)) { e.preventDefault(); go(pos + 1, 1); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(k)) { e.preventDefault(); go(pos - 1, -1); }
  else if (k === 'Home') { e.preventDefault(); go(0, -1); }
  else if (k === 'End') { e.preventDefault(); go(N - 1, 1); }
  else if (k === 'Enter' && !onControl && modeOf(pos) === 'work') { e.preventDefault(); openProject(); }
  else if (k === 'Escape' && modeOf(pos) === 'info') { e.preventDefault(); lower(); }
});

function goOpen(dir: number) {
  const to = pos + dir;
  if (to < 0 || to >= NW || !engine) return;
  finishTl();
  pos = to;
  if (calm) { fillProject(to); gsap.set('.proj__col > *', { opacity: 1, y: 0 }); crossfadeOpen(to); return; }
  const items = $$('.proj__col > *');
  tl = gsap.timeline({ onComplete: () => { tl = null; } });
  tl.to(items, { opacity: 0, duration: D.snap, ease: E.in });
  tl.add(pull(to, dir, true), 0);
  tl.fromTo(items, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: D.land, ease: E.out, stagger: 0.08 }, D.step + 0.2);
}
function crossfadeOpen(to: number) {
  const st = engine!.st;
  engine!.holdPrevious();
  engine!.setScene(scenes[to]);
  st.mix = 0; st.focus = scenes[to].focus;
  gsap.to(st, { mix: 1, duration: 0.4, onUpdate: reveal });
  updateReadouts(to, false);
}

// ------------------------------------------------------------------ the intro at rest: spot meter, exposure pool, idle
const spot = { ev: 0 };
let spotTimer = 0, idleTimer = 0;
const poolTo = { x: null as null | ((v: number) => void), y: null as null | ((v: number) => void) };
let roam: gsap.core.Tween | null = null;
const roamT = { t: 0 };
/** At rest the spot meter keeps metering on its own: the pool wanders the frame and the needle reads it. */
function startRoam() {
  if (!engine || calm || roam) return;
  const st = engine.st;
  let last = 0;
  if (lmLabel.textContent !== 'Spot') scramble(lmLabel, 'Spot', D.step);
  gsap.to(st, { poolAmt: 0.85, duration: D.land, ease: E.out, overwrite: 'auto' });
  roam = gsap.to(roamT, {
    t: '+=1', duration: 16, ease: 'none', repeat: -1,
    onUpdate: () => {
      const W = window.innerWidth, H = window.innerHeight, a = roamT.t * Math.PI * 2;
      const tx = W * (0.5 + 0.3 * Math.sin(a)), ty = H * (0.34 + 0.13 * Math.sin(a * 2 + 0.6));
      st.poolX += (tx - st.poolX) * 0.08; st.poolY += (ty - st.poolY) * 0.08;
      engine!.invalidate(80);
      const now = performance.now();
      if (now - last > 380) {
        last = now;
        const ev = Math.max(-3.2, Math.min(3.2, Math.log2(Math.max(engine!.lumAt(st.poolX / W, st.poolY / H), 0.004) / 0.46)));
        gsap.to(spot, { ev, duration: D.land, ease: E.needle, overwrite: true, onUpdate: () => setMeter(spot.ev) });
      }
    },
  });
}
function stopRoam() { if (roam) { roam.kill(); roam = null; } }
function armIdle() {
  clearTimeout(idleTimer);
  stopRoam();
  raiseBtn.classList.remove('is-idle');
  if (engine) engine.idleTarget = 0;
  idleTimer = window.setTimeout(() => {
    if (calm) return;
    // the open project is a page to read: no drift there
    if (engine) engine.idleTarget = S === 'open' || S === 'opening' || S === 'closing' ? 0 : 1;
    if (S === 'intro') {
      raiseBtn.classList.add('is-idle');
      startRoam();
    }
  }, S === 'intro' ? 4000 : 1400);
}
function spotAt(x: number, y: number, touch: boolean) {
  if (S !== 'intro' || calm || !engine) return;
  const st = engine.st;
  if (!poolTo.x) {
    poolTo.x = gsap.quickTo(st, 'poolX', { duration: 0.12, ease: 'power3.out', onUpdate: reveal });
    poolTo.y = gsap.quickTo(st, 'poolY', { duration: 0.12, ease: 'power3.out' });
  }
  if (st.poolAmt < 0.05) { st.poolX = x; st.poolY = y; }
  poolTo.x(x); poolTo.y!(y);
  if (st.poolAmt < 1) gsap.to(st, { poolAmt: 1, duration: D.step, ease: E.out, overwrite: 'auto', onUpdate: reveal });
  // the needle reads the frame under the pool (the readback is the real, graded frame)
  const lum = engine.lumAt(x / window.innerWidth, y / window.innerHeight);
  const ev = Math.max(-3.2, Math.min(3.2, Math.log2(Math.max(lum, 0.004) / 0.46)));
  if (lmLabel.textContent !== 'Spot') lmLabel.textContent = 'Spot';
  gsap.to(spot, { ev, duration: D.land, ease: E.needle, overwrite: true, onUpdate: () => setMeter(spot.ev) });
  clearTimeout(spotTimer);
  if (touch) spotTimer = window.setTimeout(() => gsap.to(st, { poolAmt: 0, duration: D.land, onUpdate: reveal }), 1400);
}
window.addEventListener('pointermove', (e) => {
  armIdle();
  if (S === 'intro') spotAt(e.clientX, e.clientY, e.pointerType === 'touch');
}, { passive: true });
window.addEventListener('pointerdown', (e) => {
  armIdle();
  if (S === 'intro' && e.pointerType === 'touch') spotAt(e.clientX, e.clientY, true);
}, { passive: true });
window.addEventListener('keydown', () => armIdle(), { passive: true });

// ------------------------------------------------------------------ buttons
raiseBtn.addEventListener('click', raise);
$('[data-skip]').addEventListener('click', (e) => { e.preventDefault(); if (S === 'intro') raise(); else if (S === 'raising' && tl) tl.timeScale(4); });
$$('[data-open]').forEach((b) => b.addEventListener('click', openProject));
$('[data-close]').addEventListener('click', closeProject);
$('[data-proj-prev]').addEventListener('click', () => goOpen(-1));
$('[data-proj-next]').addEventListener('click', () => goOpen(1));
$('[data-lower]').addEventListener('click', lower);
$('[data-prev]').addEventListener('click', () => go(pos - 1, -1));
$('[data-next]').addEventListener('click', () => go(pos + 1, 1));
idxBtns.forEach((b) => b.addEventListener('click', () => { const to = Number(b.dataset.go); if (S === 'open') return; go(to, Math.sign(to - pos)); }));
proj.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const f = $$<HTMLElement>('button, a[href]', proj).filter((x) => !x.hasAttribute('disabled'));
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// ------------------------------------------------------------------ resize
let rz = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(rz);
  rz = requestAnimationFrame(() => {
    fitName(nameEl);
    engine?.resize();
    const m: Mode = S === 'open' ? 'open' : modeOf(pos) === 'info' ? 'work' : modeOf(pos);
    const r = frameRect(m);
    if (S === 'open') { writeRect(frameRect('work')); } else writeRect(r);
    if (engine) { engine.st.rect = r; placeAF(afFrac); syncDist(); engine.invalidate(200); }
  });
});

writeRect(frameRect('work'));
if (matchMedia('(hover: none)').matches) $('.raise__k').textContent = 'tap / swipe up';
boot().catch((err) => {
  console.error('[viewfinder] boot failed', err);
  html.classList.remove('is-loading');
  S = 'intro';
  raiseBtn.disabled = false;
});

// test hooks for the evidence recorder (harmless in production)
(window as any).__vf = { go, openProject, closeProject, lower, raise, setSim, state: () => S, pos: () => pos };
