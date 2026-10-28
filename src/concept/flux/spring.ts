// Damped springs, integrated per frame (semi-implicit Euler, sub-stepped). "Bouncy yet firm".
export interface SpringCfg { k: number; c: number }
export const FIRM: SpringCfg = { k: 260, c: 22 };     // about 5% overshoot
export const SETTLE: SpringCfg = { k: 120, c: 20 };   // no visible overshoot
export const SNAP: SpringCfg = { k: 1400, c: 64 };    // hover: 95% in under 100 ms
export const LOOSE: SpringCfg = { k: 70, c: 9 };      // hanging objects

export class Spring {
  x: number;
  v = 0;
  target: number;
  cfg: SpringCfg;
  constructor(x = 0, cfg: SpringCfg = FIRM) {
    this.x = x;
    this.target = x;
    this.cfg = cfg;
  }
  step(dt: number) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.cfg.k * (this.target - this.x) - this.cfg.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  set(x: number) {
    this.x = x;
    this.target = x;
    this.v = 0;
  }
  get settled() {
    return Math.abs(this.target - this.x) < 1e-3 && Math.abs(this.v) < 1e-3;
  }
}

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
