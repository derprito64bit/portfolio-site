// The lens rig: one liquid body (main + a trailing droplet that lags and necks off it), an optional loupe droplet,
// the preloader's droplets, and shapes contributed by other sections. Critically damped springs only: the
// temperament is heavy and viscous, with no overshoot.
import type { Shape, LensParams, Stage } from './gl/stage';

export interface Spring { v: number }

/** Critically damped spring step (SmoothDamp). */
export function damp(cur: number, target: number, vel: Spring, smoothTime: number, dt: number): number {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * exp;
  return target + (change + temp) * exp;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const seg = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const outExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const outQuart = (t: number) => 1 - Math.pow(1 - t, 4);

export function lerpShape(a: Shape, b: Shape, t: number): Shape {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), hw: lerp(a.hw, b.hw, t), hh: lerp(a.hh, b.hh, t), r: lerp(a.r, b.r, t), rot: lerp(a.rot, b.rot, t) };
}
export function lerpParams(a: LensParams, b: LensParams, t: number): LensParams {
  return {
    bevel: lerp(a.bevel, b.bevel, t),
    refract: lerp(a.refract, b.refract, t),
    mag: lerp(a.mag, b.mag, t),
    disp: lerp(a.disp, b.disp, t),
    alpha: lerp(a.alpha, b.alpha, t),
    k: lerp(a.k, b.k, t),
    wobble: lerp(a.wobble, b.wobble, t),
    light: [lerp(a.light[0], b.light[0], t), lerp(a.light[1], b.light[1], t)],
    shade: lerp(a.shade, b.shade, t),
    caust: lerp(a.caust ?? 0, b.caust ?? 0, t),
  };
}

interface Droplet { sx: number; sy: number; r: number; a: number }

export class LensRig {
  stage: Stage;
  // the free lens (intro): position springs toward the pointer or an idle drift
  x = 0;
  y = 0;
  R = 160;
  private sx: Spring = { v: 0 };
  private sy: Spring = { v: 0 };
  private tx = 0;
  private ty = 0;
  private tvx: Spring = { v: 0 };
  private tvy: Spring = { v: 0 };
  vx = 0;
  vy = 0;
  /** Where the lens rests when the pointer is idle (CSS px). */
  anchor = { x: 0, y: 0 };
  follow = true;
  /** Calm mode: the lens sits exactly on its anchor. */
  calm = false;
  /** Scripted override: weight, target shape and lens params (set by the theatre). */
  script: { w: number; shape: Shape | null; params: LensParams | null } = { w: 0, shape: null, params: null };
  /** Free-lens params. */
  base: LensParams;
  /** Extra shapes from other sections this frame. */
  extras: Shape[] = [];
  extraParams: { t: number; params: LensParams | null } = { t: 0, params: null };
  // loupe droplet
  loupe = { on: false, x: 0, y: 0, r: 0, tx: 0, ty: 0, tr: 0, sx: { v: 0 } as Spring, sy: { v: 0 } as Spring, sr: { v: 0 } as Spring };
  // preloader droplets
  private drops: Droplet[] = [];
  pre = true;
  preP = 0;
  /** 0..1 surge after the release (scales the body briefly). */
  surge = 0;
  pointer = { x: -1, y: -1, t: -10, active: false };
  /** Seconds of brisk travel left (after the release). */
  travel = 0;
  /** The name's lines (CSS px): the idle lens walks slowly along them. */
  namePath: { x0: number; x1: number; y1: number; y2: number } | null = null;
  /** Wheel/touch flinch: a critically damped impulse (peaks about 60 ms after input, no overshoot). */
  flinch = 0;
  private flinchV = 0;
  time = 0;
  alpha = 1;

  constructor(stage: Stage) {
    this.stage = stage;
    this.base = { ...stage.lens };
    this.layout();
    this.x = stage.w / 2;
    this.y = stage.h / 2;
    this.tx = this.x;
    this.ty = this.y;
    this.seedDrops();
  }

  layout() {
    const { w, h } = this.stage;
    const m = Math.min(w, h);
    const phone = w < 760;
    this.R = phone ? m * 0.26 : m * 0.205;
    this.anchor = phone ? { x: w * 0.62, y: h * 0.6 } : { x: w * 0.63, y: h * 0.6 };
    this.base = {
      bevel: this.R * 0.82,
      refract: this.R * 0.34,
      mag: 0.12,
      disp: 0.34,
      alpha: 1,
      k: this.R * 0.55,
      wobble: 0,
      light: [-0.55, -0.8],
      shade: 1,
    };
  }

  private seedDrops() {
    // four droplets whose areas sum to the final lens: merging conserves area, so the lens grows as it forms
    const weights = [1.5, 0.8, 0.95, 0.7];
    const sum = weights.reduce((a, b) => a + b, 0);
    const angles = [0, 2.45, 4.35, 0.85];
    const dists = [0, 0.36, 0.38, 0.32];
    const m = Math.min(this.stage.w, this.stage.h);
    this.drops = weights.map((wt, i) => ({
      sx: Math.cos(angles[i]) * dists[i] * m * (this.stage.w > this.stage.h ? 1.5 : 1),
      sy: Math.sin(angles[i]) * dists[i] * m * 0.9,
      r: Math.sqrt(wt / sum),
      a: i === 0 ? 0 : (i - 1) * 0.2,
    }));
  }

  setPointer(x: number, y: number, now: number) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.t = now;
    this.pointer.active = true;
  }

  /** Preloader: droplets pulled together by progress p (0..1). */
  private preShapes(): Shape[] {
    const { w, h } = this.stage;
    const cx = w / 2;
    const cy = h / 2;
    const p = this.preP;
    const out: Shape[] = [];
    let mainArea = this.drops[0].r * this.drops[0].r;
    const t = this.time;
    // from the first frame: the droplets glide in from wider out and the whole set turns slowly
    const enter = outQuart(clamp01(t / 1.5));
    const spread = 1 + 0.4 * (1 - enter);
    const turn = t * 0.16;
    const ct = Math.cos(turn);
    const sn = Math.sin(turn);
    for (let i = 1; i < this.drops.length; i++) {
      const d = this.drops[i];
      const u = smooth(seg(p, d.a, d.a + 0.42));
      const absorbed = smooth(seg(u, 0.72, 1));
      mainArea += d.r * d.r * absorbed;
      const k = outQuart(u);
      const wob = (1 - u) * 7;
      const ox = (d.sx * ct - d.sy * sn) * spread;
      const oy = (d.sx * sn + d.sy * ct) * spread;
      const x = cx + ox * (1 - k) + Math.sin(t * 0.9 + i * 1.7) * wob;
      const y = cy + oy * (1 - k) + Math.cos(t * 0.7 + i * 2.3) * wob;
      const r = this.R * d.r * (1 - absorbed) * (0.7 + 0.3 * enter);
      if (r > 0.6) out.push({ x, y, hw: r, hh: r, r, rot: 0 });
    }
    const R0 = this.R * Math.sqrt(mainArea) * (1 + this.surge * 0.14);
    out.unshift({ x: cx + Math.sin(t * 0.6) * 3, y: cy + Math.cos(t * 0.5) * 3, hw: R0, hh: R0, r: R0, rot: 0 });
    return out;
  }

  update(dt: number, now: number) {
    this.time += dt;
    const st = this.stage;
    const shapes: Shape[] = [];

    if (this.pre) {
      const s = this.preShapes();
      shapes.push(...s);
      const lp = this.base;
      st.lens = { ...lp, refract: lp.refract * (0.25 + 0.75 * this.preP), disp: lp.disp * (0.4 + 0.6 * this.preP), k: this.R * 0.42, alpha: this.alpha };
      st.shapes = shapes.slice(0, 6);
      return;
    }

    // free lens target: pointer (if recent) or a slow drift around the anchor
    const idle = now - this.pointer.t > 2.6 || !this.pointer.active || !this.follow;
    const tt = this.time;
    let gx = this.anchor.x + Math.sin(tt * 0.23) * st.w * 0.07 + Math.sin(tt * 0.071) * st.w * 0.03;
    let gy = this.anchor.y + Math.sin(tt * 0.31 + 1.2) * st.h * 0.05;
    const np = this.namePath;
    if (np && !this.calm) {
      // at rest the lens walks slowly along the name, so there is always type for it to bend
      gx = lerp(np.x0, np.x1, 0.5 - 0.5 * Math.cos(tt * 0.24 + 2.2));
      gy = lerp(np.y1, np.y2, 0.5 - 0.5 * Math.cos(tt * 0.15 + 1.1));
    }
    if (!idle) {
      gx = this.pointer.x;
      gy = this.pointer.y;
    }
    const px = this.x;
    const py = this.y;
    if (this.calm) {
      gx = this.anchor.x;
      gy = this.anchor.y;
      this.x = gx;
      this.y = gy;
    }
    this.travel = Math.max(0, this.travel - dt);
    const stime = this.calm ? 0.0001 : this.travel > 0 ? 0.42 : idle ? 1.4 : 0.32;
    this.x = damp(this.x, gx, this.sx, stime, dt);
    this.y = damp(this.y, gy, this.sy, stime, dt);
    const ivx = (this.x - px) / Math.max(dt, 1e-3);
    const ivy = (this.y - py) / Math.max(dt, 1e-3);
    this.vx = lerp(this.vx, ivx, 0.25);
    this.vy = lerp(this.vy, ivy, 0.25);

    // the flinch: wheel and touch kick it; critically damped, so it answers at once and never rings
    const om = 16;
    this.flinchV += (-2 * om * this.flinchV - om * om * this.flinch) * dt;
    this.flinch += this.flinchV * dt;

    // scripted blend
    const w = this.script.w;
    const R = this.R * (1 + this.surge * 0.14);
    const speed = Math.hypot(this.vx, this.vy);
    const e = Math.min(speed / 2600, 0.24) * (1 - w);
    const rot = Math.atan2(this.vy, this.vx);
    let main: Shape = { x: this.x, y: this.y, hw: R * (1 + e), hh: R * (1 - e * 0.55), r: R * (1 - e * 0.55), rot };
    if (w > 0 && this.script.shape) {
      const sc = this.script.shape;
      main = lerpShape({ ...main, rot: w > 0.5 ? 0 : main.rot }, { ...sc, rot: 0 }, w);
      if (w > 0.5) main.rot = 0;
    }
    const fl = Math.max(-1.4, Math.min(1.4, this.flinch));
    const fa = Math.abs(fl);
    main.y += fl * 12;
    main.hh *= 1 - 0.075 * fa;
    main.hw *= 1 + 0.05 * fa;
    main.r = Math.min(main.r, main.hw, main.hh);
    // trailing droplet: lags, necks off when the body moves, merges back at rest
    this.tx = this.calm ? main.x : damp(this.tx, main.x, this.tvx, 0.6, dt);
    this.ty = this.calm ? main.y : damp(this.ty, main.y, this.tvy, 0.6, dt);
    const tr = Math.min(main.hw, main.hh) * 0.42;
    shapes.push(main);
    const gap = Math.hypot(this.tx - main.x, this.ty - main.y);
    // the neck only exists while the droplet trails: at rest its blend radius falls to zero, so it adds nothing
    const kNow = this.script.params && w > 0 ? lerp(this.base.k, this.script.params.k, w) : this.base.k;
    if (gap > 0.5 && tr > 2) shapes.push({ x: this.tx, y: this.ty, hw: tr, hh: tr, r: tr, rot: 0, k: Math.min(kNow, gap * 1.4) });

    // loupe droplet
    const L = this.loupe;
    if (L.on || L.r > 0.5) {
      L.x = damp(L.x, L.tx, L.sx, 0.075, dt);
      L.y = damp(L.y, L.ty, L.sy, 0.075, dt);
      L.r = damp(L.r, L.on ? L.tr : 0, L.sr, L.on ? 0.12 : 0.18, dt);
      const lk = this.script.params && w > 0 ? lerp(this.base.k, this.script.params.k, w) : this.base.k;
      if (L.r > 0.8) shapes.push({ x: L.x, y: L.y, hw: L.r, hh: L.r, r: L.r, rot: 0, k: lk * clamp01(L.r / Math.max(1, L.tr)) });
    }

    for (const s of this.extras) shapes.push(s);

    let params = this.base;
    if (w > 0 && this.script.params) params = lerpParams(this.base, this.script.params, w);
    if (this.extraParams.params && this.extraParams.t > 0) params = lerpParams(params, this.extraParams.params, this.extraParams.t);
    const wob = Math.min(speed / 3000, 0.5) * (1 - w) * 0.6 + 0.3 * fa;
    st.lens = { ...params, wobble: Math.max(params.wobble, wob), alpha: params.alpha * this.alpha };
    st.shapes = shapes.slice(0, 6);
  }

  /** A wheel or touch impulse (units: about one wheel notch). */
  kick(v: number) {
    if (this.calm) return;
    this.flinchV += Math.max(-1.6, Math.min(1.6, v)) * 16 * Math.E * 0.75;
  }

  /** Hand over from the preloader: the merged body becomes the free lens at the centre. */
  release() {
    this.pre = false;
    this.x = this.stage.w / 2;
    this.y = this.stage.h / 2;
    this.tx = this.x;
    this.ty = this.y;
    this.sx.v = 0;
    this.sy.v = 0;
    this.travel = 1.3;
  }
}
