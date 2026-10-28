// The name: one variable face whose width, weight and slant answer the cursor, the field and the scroll.
// Performance: letter positions are computed, never read back from layout; axis values are quantized (so the browser
// can reuse font instances) and nothing is written while the pointer is still and the springs have settled.
import { SplitText } from 'gsap/SplitText';
import { Spring, FIRM, clamp } from './spring';
import { world, fromField } from './world';

let REST_W = 38;
const REST_G = 290;

interface Ch {
  el: HTMLElement;
  w: Spring;
  g: Spring;
  s: Spring;
  y: Spring;
  w30: number; // width at wdth 30 (px)
  w90: number; // width at wdth 90 (px)
  cx: number;
  last: string;
}

const settled = (s: Spring) => Math.abs(s.target - s.x) < 0.2 && Math.abs(s.v) < 0.5;

export class NameType {
  el: HTMLElement;
  chars: Ch[] = [];
  split: any;
  revealAt = -1;
  still = false;
  left = 0;
  cyDoc = 0;
  lastPX = NaN;
  lastPY = NaN;
  lastPull = -1;
  writes = 0;
  frame = 0;
  pendingDt = 0;

  constructor(el: HTMLElement) {
    this.el = el;
    this.split = SplitText.create(el, { type: 'chars', charsClass: 'ch', mask: 'chars', aria: 'auto' });
    (this.split.masks || []).forEach((m: HTMLElement) => m.classList.add('ch-mask'));
    this.chars = (this.split.chars as HTMLElement[]).map((c) => ({
      el: c,
      w: new Spring(25, FIRM),
      g: new Spring(100, FIRM),
      s: new Spring(0, FIRM),
      y: new Spring(110, { k: 200, c: 21 }),
      w30: 0,
      w90: 0,
      cx: 0,
      last: '',
    }));
    this.apply(true);
    this.fit();
  }

  /** The name fills its frame through the width axis: the size comes from the height, the width from wdth.
   *  Also records each letter's width at two widths, so positions can be computed without reading layout. */
  fit() {
    const saved = this.chars.map((c) => c.el.style.fontVariationSettings);
    const frame = (this.el.parentElement as HTMLElement).getBoundingClientRect().width;
    const fs = world.phone ? Math.min(world.H * 0.2, frame * 0.5) : Math.min(world.H * 0.44, frame * 0.36);
    this.el.style.setProperty('--name-size', `${fs.toFixed(1)}px`);
    const probe = (wd: number) => {
      this.chars.forEach((c) => (c.el.style.fontVariationSettings = `'wdth' ${wd}, 'wght' ${REST_G}`));
      return this.chars.map((c) => c.el.getBoundingClientRect());
    };
    const r30 = probe(30);
    const r90 = probe(90);
    this.chars.forEach((c, i) => {
      c.w30 = r30[i].width;
      c.w90 = r90[i].width;
    });
    const w1 = r30[r30.length - 1].right - r30[0].left;
    const w2 = r90[r90.length - 1].right - r90[0].left;
    const goal = frame * (world.phone ? 0.97 : 0.94);
    let wd = 30 + ((goal - w1) * 60) / Math.max(1, w2 - w1);
    wd = clamp(wd, 25, 110);
    if (wd <= 25.5) {
      const k = goal / w1;
      this.el.style.setProperty('--name-size', `${(fs * k).toFixed(1)}px`);
      this.chars.forEach((c) => {
        c.w30 *= k;
        c.w90 *= k;
      });
    }
    REST_W = wd;
    this.left = r30[0].left;
    // the vertical centre comes from the h1 itself: the letters may still sit translated inside their masks
    const hr = this.el.getBoundingClientRect();
    this.cyDoc = (hr.top + hr.bottom) / 2 + window.scrollY;
    this.chars.forEach((c, i) => (c.el.style.fontVariationSettings = saved[i]));
    this.lastPX = NaN;
  }

  reveal(delay = 0) {
    this.revealAt = world.t + delay;
  }

  /** Reduced motion: the rest state, no springs. */
  rest() {
    this.still = true;
    this.chars.forEach((c) => {
      c.w.set(REST_W);
      c.g.set(REST_G);
      c.s.set(0);
      c.y.set(0);
    });
    this.apply(true);
  }

  /** Letter centres from the current width axis (no layout reads). */
  centres() {
    let x = this.left;
    for (const c of this.chars) {
      const w = c.w30 + ((c.w90 - c.w30) * (c.w.x - 30)) / 60;
      c.cx = x + w / 2;
      x += w;
    }
  }

  update(dt: number) {
    if (this.still || this.revealAt < 0) return;
    const t = world.t;
    const P = world.pointer;
    const pull = world.pull;
    const cy = this.cyDoc - world.scrollY;
    if (cy < -world.H || cy > world.H * 2) return; // off screen: nothing to do
    const e = world.engine;
    const fronts: { x: number; y: number; r: number; a: number }[] = [];
    if (e) {
      for (const d of e.drops) {
        const born = (d as any).born;
        if (born === undefined || t - born > 2.2) continue;
        const [x, y] = fromField(d.x, d.y);
        fronts.push({ x, y, r: d.r * world.H, a: d.vivid * (1 - (t - born) / 2.2) });
      }
    }
    const moved = P.x !== this.lastPX || P.y !== this.lastPY;
    const pulled = Math.abs(pull - this.lastPull) > 1e-4;
    const revealing = t < this.revealAt + this.chars.length * 0.055 + 1.2;
    const springing = this.chars.some((c) => !settled(c.w) || !settled(c.g) || !settled(c.s) || !settled(c.y));
    if (!moved && !pulled && !revealing && !springing && !fronts.length) return; // the pointer is still: skip
    // when the governor reports a struggling machine, the letters re-shape at half rate (springs keep their time)
    this.frame++;
    const half = !!e && e.quality >= 2 && !revealing;
    if (half && this.frame % 2 === 1) {
      this.pendingDt += dt;
      return;
    }
    dt += this.pendingDt;
    this.pendingDt = 0;
    this.lastPX = P.x;
    this.lastPY = P.y;
    this.lastPull = pull;

    this.centres();
    const sigma = Math.max(140, world.W * 0.12);
    const speed = clamp(P.speed / 1.4, 0, 1);
    const lean = clamp(Math.abs(P.vx) / 1.1, 0, 1);
    const n = this.chars.length;
    const proxs = this.chars.map((c) => {
      const dx = P.x - c.cx, dy = P.y - cy;
      return P.seen ? Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)) : 0;
    });
    const meanProx = proxs.reduce((a, b) => a + b, 0) / Math.max(1, n);
    this.chars.forEach((c, i) => {
      if (t < this.revealAt + i * 0.055) return;
      const prox = proxs[i];
      let bump = 0;
      for (const f of fronts) {
        const d = Math.hypot(c.cx - f.x, cy - f.y);
        bump = Math.max(bump, Math.exp(-Math.pow((d - f.r) / (world.H * 0.06), 2)) * f.a);
      }
      // the scroll pulls each letter out, left to right
      const out = clamp((pull - 0.04 - (i / Math.max(1, n - 1)) * 0.22) / 0.3, 0, 1);
      let tw = REST_W + (prox - meanProx) * (60 + 70 * speed) + bump * 18;
      let tg = REST_G + prox * (210 + 330 * speed) + bump * 260;
      tw = tw + (25 - tw) * out;
      tg = tg + (110 - tg) * out;
      c.w.target = clamp(tw, 25, 151);
      c.g.target = clamp(tg, 100, 1000);
      c.s.target = -10 * lean * prox;
      c.y.target = -112 * out;
      c.w.step(dt);
      c.g.step(dt);
      c.s.step(dt);
      c.y.step(dt);
    });
    this.apply(false);
  }

  apply(force: boolean) {
    for (const c of this.chars) {
      // quantized so the browser can reuse font instances between frames
      const w = clamp(Math.round(c.w.x / 2) * 2, 26, 150);
      const g = clamp(Math.round(c.g.x / 10) * 10, 100, 1000);
      const s = Math.round(clamp(c.s.x, -10, 0));
      const y = Math.round(c.y.x * 4) / 4;
      const key = `${w}|${g}|${s}|${y}`;
      if (!force && key === c.last) continue;
      const fvsKey = c.last.split('|').slice(0, 3).join('|');
      c.last = key;
      if (force || fvsKey !== `${w}|${g}|${s}`) {
        c.el.style.fontVariationSettings = `'wdth' ${w}, 'wght' ${g}, 'slnt' ${s}`;
        this.writes++;
      }
      c.el.style.transform = `translate3d(0, ${y}%, 0)`;
    }
  }
}
