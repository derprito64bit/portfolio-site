// The name: one variable face whose width, weight and slant answer the cursor, the field and the scroll.
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
  cx: number;
  cy: number;
  last: string;
}

export class NameType {
  el: HTMLElement;
  chars: Ch[] = [];
  split: any;
  revealAt = -1;
  still = false;

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
      cx: 0,
      cy: 0,
      last: '',
    }));
    this.apply(true);
    this.fit();
  }

  /** The name fills its frame through the width axis: the size comes from the height, the width from wdth. */
  fit() {
    const saved = this.chars.map((c) => c.el.style.fontVariationSettings);
    const frame = (this.el.parentElement as HTMLElement).getBoundingClientRect().width;
    const fs = world.phone ? Math.min(world.H * 0.2, frame * 0.5) : Math.min(world.H * 0.44, frame * 0.36);
    this.el.style.setProperty('--name-size', `${fs.toFixed(1)}px`);
    const span = (wd: number) => {
      this.chars.forEach((c) => (c.el.style.fontVariationSettings = `'wdth' ${wd}, 'wght' ${REST_G}`));
      const a = this.chars[0].el.getBoundingClientRect();
      const b = this.chars[this.chars.length - 1].el.getBoundingClientRect();
      return Math.max(1, b.right - a.left);
    };
    // width grows close to linearly with wdth: two probes, then solve
    const w1 = span(30), w2 = span(90);
    const goal = frame * (world.phone ? 0.97 : 0.94);
    let wd = 30 + ((goal - w1) * 60) / Math.max(1, w2 - w1);
    wd = clamp(wd, 25, 110);
    if (wd <= 25.5) {
      // a long name: shrink the size as well
      const k = goal / w1;
      this.el.style.setProperty('--name-size', `${(fs * k).toFixed(1)}px`);
    }
    REST_W = wd;
    this.chars.forEach((c, i) => (c.el.style.fontVariationSettings = saved[i]));
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

  measure() {
    for (const c of this.chars) {
      const r = c.el.getBoundingClientRect();
      c.cx = r.left + r.width / 2;
      c.cy = r.top + r.height / 2;
    }
  }

  update(dt: number) {
    if (this.still || this.revealAt < 0) return;
    const t = world.t;
    const P = world.pointer;
    const sigma = Math.max(140, world.W * 0.12);
    const speed = clamp(P.speed / 1.4, 0, 1);
    const lean = clamp(Math.abs(P.vx) / 1.1, 0, 1);
    const pull = world.pull;
    const e = world.engine;
    // ring fronts of fresh drops (the type swells as ink passes under it)
    const fronts: { x: number; y: number; r: number; a: number }[] = [];
    if (e) {
      for (const d of e.drops) {
        const born = (d as any).born;
        if (born === undefined || t - born > 2.2) continue;
        const [x, y] = fromField(d.x, d.y);
        fronts.push({ x, y, r: d.r * world.H, a: d.vivid * (1 - (t - born) / 2.2) });
      }
    }
    const n = this.chars.length;
    const proxs = this.chars.map((c) => {
      const dx = P.x - c.cx, dy = P.y - c.cy;
      return P.seen ? Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)) : 0;
    });
    const meanProx = proxs.reduce((a, b) => a + b, 0) / Math.max(1, n);
    this.chars.forEach((c, i) => {
      const started = t >= this.revealAt + i * 0.055;
      if (!started) return;
      const prox = proxs[i];
      const wave = Math.sin(t * 0.9 - i * 0.55);
      let bump = 0;
      for (const f of fronts) {
        const d = Math.hypot(c.cx - f.x, c.cy - f.y);
        bump = Math.max(bump, Math.exp(-Math.pow((d - f.r) / (world.H * 0.06), 2)) * f.a);
      }
      // the scroll pulls each letter out, left to right
      const out = clamp((pull - 0.04 - (i / Math.max(1, n - 1)) * 0.22) / 0.3, 0, 1);
      let tw = REST_W + wave * 4 + (prox - meanProx) * (60 + 70 * speed) + bump * 18;
      let tg = REST_G + wave * 34 + prox * (210 + 330 * speed) + bump * 260;
      const ts = -10 * lean * prox;
      tw = tw + (25 - tw) * out;
      tg = tg + (110 - tg) * out;
      c.w.target = clamp(tw, 25, 151);
      c.g.target = clamp(tg, 100, 1000);
      c.s.target = ts;
      c.y.target = -112 * out;
      c.w.step(dt);
      c.g.step(dt);
      c.s.step(dt);
      if (c.y.target === 0 && c.y.x > 0) c.y.step(dt);
      else c.y.step(dt);
      if (!started) return;
    });
    this.apply(false);
  }

  apply(force: boolean) {
    for (const c of this.chars) {
      const fvs = `'wdth' ${c.w.x.toFixed(1)}, 'wght' ${c.g.x.toFixed(0)}, 'slnt' ${clamp(c.s.x, -10, 0).toFixed(2)}`;
      const tr = `translate3d(0, ${c.y.x.toFixed(2)}%, 0)`;
      const key = fvs + tr;
      if (!force && key === c.last) continue;
      c.last = key;
      c.el.style.fontVariationSettings = fvs;
      c.el.style.transform = tr;
    }
  }
}
