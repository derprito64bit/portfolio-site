// The work: an infinite canvas of marbled sheets. One column runs through all eight in order as you scroll; the
// columns either side hold the others, offset by half a sheet. A drag throws the canvas anywhere (it wraps forever)
// and one firm spring lands it with a sheet exactly on the focus point. The sheet in focus is the one focal mass:
// large, saturated and bracketed; the rest stay small, dim and grey until they come close.
import gsap from 'gsap';
import { projects, ph } from './content';
import { world } from './world';
import { Spring, FIRM, SNAP, clamp, easeOutExpo } from './spring';
import type { PlaneDraw } from './gl/engine';

const N = projects.length;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

interface Cell {
  key: string;
  j: number;
  m: number;
  k: number; // project index
  x: number; // screen centre
  y: number;
  w: number;
  h: number;
  fw: number; // focus weight 0..1
}

export class Work {
  stage: HTMLElement;
  af: HTMLElement;
  corners: HTMLElement[];
  roll: HTMLElement;
  titleBox: HTMLElement;
  openBtn: HTMLButtonElement;
  openSr: HTMLElement;
  links: HTMLAnchorElement[];

  // layout: one column through the projects, neighbours at +-cp, odd columns half a row down
  pw = 360;
  ph = 450;
  cp = 446;
  rp = 560;
  fx = 0;
  fy = 0;
  pinPer = 540; // scroll px per project

  stageTop = 0; // set by the page each frame (computed from scroll, never read from layout)
  travel = 0;
  dragX = 0;
  dragY = 0;
  sx = new Spring(0, { k: 200, c: 26 });
  sy = new Spring(0, { k: 200, c: 26 });
  mode: 'free' | 'drag' | 'spring' = 'free';
  lastOx = 0;
  lastOy = 0;
  vel: [number, number] = [0, 0];
  cells: Cell[] = [];
  focus: Cell | null = null;
  focusK = -1;
  hovers = new Map<string, Spring>();
  hoverKey = '';
  overState = false;
  mouseUv: [number, number] = [0.5, 0.5];
  developAt = -1;
  hide = new Spring(1, { k: 120, c: 20 });
  af4 = [new Spring(0, FIRM), new Spring(0, FIRM), new Spring(0, FIRM), new Spring(0, FIRM)];
  afOn = 0;
  afLast = '';
  lockT = 0;
  onOpen: (k: number, cell: Cell, uv: [number, number]) => void = () => {};

  // drag tracking
  downX = 0;
  downY = 0;
  downT = 0;
  downDX = 0;
  downDY = 0;
  samples: { x: number; y: number; t: number }[] = [];
  dragging = false;

  constructor() {
    this.stage = document.getElementById('work-stage')!;
    this.af = document.getElementById('af')!;
    this.corners = Array.from(this.af.querySelectorAll('i')) as HTMLElement[];
    this.roll = document.getElementById('work-roll')!;
    this.titleBox = document.getElementById('work-title-swap')!;
    this.openBtn = document.getElementById('work-open') as HTMLButtonElement;
    this.openSr = document.getElementById('work-open-sr')!;
    this.links = Array.from(document.querySelectorAll('#work-index a')) as HTMLAnchorElement[];
    this.layout();
    this.bind();
  }

  layout() {
    const W = world.W, H = world.H;
    if (world.phone) {
      this.pw = Math.min(W * 0.7, 320);
      this.ph = this.pw * 1.25;
      this.cp = this.pw + 26;
      this.rp = this.ph + 30;
      this.fx = W / 2;
      this.fy = H * 0.46;
      this.pinPer = H * 0.55;
    } else {
      this.ph = clamp(H * 0.66, 380, 680);
      this.pw = this.ph * 0.8;
      this.cp = this.pw * 1.3;
      this.rp = this.ph * 1.14;
      this.fx = W * 0.6;
      this.fy = H * 0.5;
      this.pinPer = H * 0.6;
    }
  }

  /** Scroll length of the sticky section: through all eight, ending on the last. */
  scrollLen() {
    return this.pinPer * (N - 1);
  }
  /** Canvas travel for a scroll position inside the section. */
  setScroll(into: number) {
    this.travel = (clamp(into, 0, this.scrollLen()) / this.pinPer) * this.rp;
  }

  colX(j: number) {
    return j * this.cp;
  }
  rowOff(j: number) {
    return mod(j, 2) === 1 ? this.rp / 2 : 0;
  }
  rowY(j: number, m: number) {
    return m * this.rp + this.rowOff(j);
  }
  index(j: number, m: number) {
    return mod(m + 3 * j, N);
  }

  get ox() {
    return this.dragX;
  }
  get oy() {
    return this.travel + this.dragY;
  }

  // ---------------------------------------------------------------- input
  bind() {
    const s = this.stage;
    s.addEventListener('pointerdown', (e) => {
      if (world.phase !== 'intro' || e.button > 0) return;
      if ((e.target as HTMLElement).closest('a, button')) return;
      if (e.pointerType === 'mouse') e.preventDefault();
      this.dragging = true;
      this.downX = e.clientX;
      this.downY = e.clientY;
      this.downT = performance.now();
      this.downDX = this.dragX;
      this.downDY = this.dragY;
      this.samples = [{ x: e.clientX, y: e.clientY, t: this.downT }];
      this.mode = 'drag';
      s.setPointerCapture(e.pointerId);
    });
    s.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.downX;
      const dy = e.clientY - this.downY;
      if (Math.hypot(dx, dy) > 4 && !s.classList.contains('is-drag')) s.classList.add('is-drag');
      this.dragX = this.downDX - dx;
      this.dragY = this.downDY - (e.pointerType === 'touch' ? 0 : dy);
      const now = performance.now();
      this.samples.push({ x: e.clientX, y: e.clientY, t: now });
      while (this.samples.length > 2 && now - this.samples[0].t > 90) this.samples.shift();
    });
    const end = (e: PointerEvent, cancel = false) => {
      if (!this.dragging) return;
      this.dragging = false;
      s.classList.remove('is-drag');
      const moved = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
      const dt = performance.now() - this.downT;
      if (!cancel && moved < 6 && dt < 500) {
        this.mode = 'free';
        this.click(e.clientX, e.clientY);
        return;
      }
      const a = this.samples[0], b = this.samples[this.samples.length - 1];
      const st = Math.max(16, b.t - a.t) / 1000;
      const vx = -(b.x - a.x) / st;
      const vy = e.pointerType === 'touch' ? 0 : -(b.y - a.y) / st;
      this.throwTo(vx, vy);
    };
    s.addEventListener('pointerup', (e) => end(e));
    s.addEventListener('pointercancel', (e) => end(e, true));

    this.links.forEach((a) => {
      a.addEventListener('focus', () => this.flyTo(Number(a.dataset.i)));
      a.addEventListener('mouseenter', () => this.flyTo(Number(a.dataset.i)));
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const k = Number(a.dataset.i);
        this.flyTo(k);
        this.openFocused(k);
      });
    });
    this.openBtn.addEventListener('click', () => {
      if (this.focus) this.openFocused(this.focus.k);
    });
  }

  /** Release: one firm spring from the throw to the sheet nearest where it was heading. */
  throwTo(vx: number, vy: number) {
    const tau = 0.16;
    const [sxT, syT] = this.snap(this.dragX + vx * tau, this.dragY + vy * tau);
    this.sx.x = this.dragX;
    this.sx.v = clamp(vx, -5000, 5000);
    this.sx.target = sxT;
    this.sy.x = this.dragY;
    this.sy.v = clamp(vy, -5000, 5000);
    this.sy.target = syT;
    this.mode = 'spring';
  }

  /** The drag offset that lands a sheet exactly on the focus point, nearest to (dx, dy). Columns sit at j * cp. */
  snap(dx: number, dy: number): [number, number] {
    const j = Math.round(dx / this.cp);
    const X = j * this.cp;
    const off = this.rowOff(j);
    const Y = Math.round((dy + this.travel - off) / this.rp) * this.rp + off - this.travel;
    return [X, Y];
  }

  /** The drag offset that puts the nearest copy of project k in focus. */
  nearest(k: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bd = Infinity;
    const j0 = Math.round(this.ox / this.cp);
    const m0 = Math.round(this.oy / this.rp);
    for (let j = j0 - 4; j <= j0 + 4; j++) {
      for (let m = m0 - 9; m <= m0 + 9; m++) {
        if (this.index(j, m) !== k) continue;
        const X = this.colX(j);
        const Y = this.rowY(j, m) - this.travel;
        const d = Math.hypot(X - this.dragX, Y - this.dragY);
        if (d < bd) {
          bd = d;
          best = [X, Y];
        }
      }
    }
    return best;
  }

  /** Brings project k into focus by the shortest way. */
  flyTo(k: number) {
    if (world.phase !== 'intro') return;
    const best = this.nearest(k);
    if (!best) return;
    this.sx.x = this.dragX;
    this.sy.x = this.dragY;
    this.sx.target = best[0];
    this.sy.target = best[1];
    this.mode = 'spring';
  }

  /** Same, instantly (used while a project page covers the canvas). */
  jumpTo(k: number) {
    const best = this.nearest(k);
    if (!best) return;
    this.dragX = best[0];
    this.dragY = best[1];
    this.sx.set(best[0]);
    this.sy.set(best[1]);
    this.mode = 'free';
    this.lastOx = this.ox;
    this.lastOy = this.oy;
  }

  click(x: number, y: number) {
    const c = this.hit(x, y);
    if (!c) return;
    const uv: [number, number] = [(x - (c.x - c.w / 2)) / c.w, 1 - (y - (c.y - c.h / 2)) / c.h];
    this.onOpen(c.k, c, uv);
  }

  openFocused(k: number) {
    const go = () => {
      const c = this.focus && this.focus.k === k ? this.focus : this.cells.find((x) => x.k === k) || this.focus;
      if (c) this.onOpen(c.k, c, [0.5, 0.5]);
    };
    if (this.focus && this.focus.k === k && this.mode !== 'spring') go();
    else gsap.delayedCall(0.45, go);
  }

  hit(x: number, y: number): Cell | null {
    // the largest (most in focus) first
    let best: Cell | null = null;
    for (const c of this.cells) {
      if (Math.abs(x - c.x) <= c.w / 2 && Math.abs(y - c.y) <= c.h / 2 && (!best || c.fw > best.fw)) best = c;
    }
    return best;
  }

  develop() {
    if (this.developAt < 0) this.developAt = world.t;
  }

  // ---------------------------------------------------------------- frame
  update(dt: number, draws: PlaneDraw[]) {
    const e = world.engine;
    const W = world.W, H = world.H;
    if (this.mode === 'spring') {
      this.dragX = this.sx.step(dt);
      this.dragY = this.sy.step(dt);
      const near = (s: Spring) => Math.abs(s.target - s.x) < 0.5 && Math.abs(s.v) < 8;
      if (near(this.sx) && near(this.sy)) {
        this.dragX = this.sx.target;
        this.dragY = this.sy.target;
        this.mode = 'free';
      }
    }
    const ox = this.ox, oy = this.oy;
    const k60 = 1 / 60 / Math.max(dt, 1e-3);
    const vx = (ox - this.lastOx) * k60;
    const vy = (oy - this.lastOy) * k60;
    this.lastOx = ox;
    this.lastOy = oy;
    this.vel[0] += (clamp(vx, -90, 90) - this.vel[0]) * 0.35;
    this.vel[1] += (clamp(vy, -90, 90) - this.vel[1]) * 0.35;
    const speed = Math.hypot(this.vel[0], this.vel[1]);

    const cells: Cell[] = [];
    const top = this.stageTop;
    const visible = top < H && top > -H * 1.2;
    const fyS = this.fy + top;
    if (visible) {
      const jMin = Math.floor((ox - this.fx - this.pw) / this.cp) - 1;
      const jMax = Math.ceil((ox + (W - this.fx) + this.pw) / this.cp) + 1;
      for (let j = jMin; j <= jMax; j++) {
        const cx = this.fx + this.colX(j) - ox;
        if (cx < -this.pw || cx > W + this.pw) continue;
        const off = this.rowOff(j);
        const mMin = Math.floor((oy - this.fy - top - this.ph - off) / this.rp) - 1;
        const mMax = Math.ceil((oy + H - this.fy - top + this.ph - off) / this.rp) + 1;
        for (let m = mMin; m <= mMax; m++) {
          const cy = this.fy + this.rowY(j, m) - oy + top;
          if (cy < top - this.ph || cy > top + H + this.ph) continue;
          const d = Math.hypot((cx - this.fx) / this.cp, (cy - fyS) / this.rp);
          const fw = 1 - smooth(0.12, 0.62, d);
          cells.push({ key: `${j},${m}`, j, m, k: this.index(j, m), x: cx, y: cy, w: this.pw, h: this.ph, fw });
        }
      }
    }
    // one focal mass: the sheet in focus is full size, the rest shrink towards 82%
    const speedScale = 1 - Math.min(speed / 90, 1) * 0.07;
    let focus: Cell | null = null;
    for (const c of cells) {
      const s = (0.82 + 0.18 * c.fw) * speedScale;
      c.w = this.pw * s;
      c.h = this.ph * s;
      if (!focus || c.fw > focus.fw) focus = c;
    }
    this.cells = cells;
    this.focus = focus;
    if (focus && focus.k !== this.focusK && world.phase === 'intro') this.setFocus(focus.k);

    // hover
    const P = world.pointer;
    let over: Cell | null = null;
    if (!this.dragging && P.seen && world.phase === 'intro' && this.developAt >= 0) over = this.hit(P.x, P.y);
    this.hoverKey = over ? over.key : '';
    if (!!over !== this.overState) {
      this.overState = !!over;
      this.stage.classList.toggle('is-over', this.overState);
    }
    if (over) this.mouseUv = [(P.x - (over.x - over.w / 2)) / over.w, 1 - (P.y - (over.y - over.h / 2)) / over.h];

    this.hide.target = world.phase === 'open' ? 0 : 1;
    this.hide.step(dt);

    const bend = world.phone ? 0.5 : 0.85;
    const split: [number, number] = [clamp(this.vel[0] * 0.00022, -0.012, 0.012), clamp(-this.vel[1] * 0.00022, -0.012, 0.012)];
    const velv: [number, number] = [clamp(-this.vel[0], -60, 60), clamp(-this.vel[1], -60, 60)];
    const seen = new Set<string>();
    // draw the dim ones first, the focal sheet last (on top)
    cells.sort((a, b) => a.fw - b.fw);
    for (const c of cells) {
      if (!world.covers[c.k]) continue;
      seen.add(c.key);
      let hs = this.hovers.get(c.key);
      if (!hs) this.hovers.set(c.key, (hs = new Spring(0, SNAP)));
      hs.target = c.key === this.hoverKey ? 1 : 0;
      hs.step(dt);
      let dev = 1;
      if (this.developAt < 0) dev = 0;
      else {
        const dist = Math.hypot(c.x - this.fx, c.y - fyS);
        const delay = Math.min(0.9, dist * 0.0009);
        dev = easeOutExpo(clamp((world.t - this.developAt - delay) / 1.1, 0, 1));
      }
      const hudFade = world.phone ? 1 : 0.05 + 0.95 * clamp((c.x - W * 0.14) / (W * 0.24), 0, 1);
      const alpha = dev > 0 ? hudFade * this.hide.x : 0;
      const grow = 1 + hs.x * 0.035;
      draws.push({
        x: c.x,
        y: c.y,
        w: c.w * grow,
        h: c.h * grow,
        tex: world.covers[c.k],
        alpha: clamp(alpha, 0, 1),
        focus: clamp(Math.max(c.fw, hs.x * 0.85), 0, 1),
        hover: hs.x,
        mouse: c.key === this.hoverKey ? this.mouseUv : [0.5, 0.5],
        develop: dev,
        wave: [0.5, 0.5, 1],
        waveAmp: 0,
        seed: c.k * 1.7 + 0.3,
        vel: velv,
        split,
        bend,
        clip: [top, top + H],
        vfade: world.phone ? [top + 40, top + 150, top + H - 190, top + H - 60] : undefined,
      });
    }
    for (const k of this.hovers.keys()) if (!seen.has(k)) this.hovers.delete(k);

    if (e && visible && speed > 0.6 && world.phase === 'intro') {
      e.stir(this.fx, fyS, -this.vel[0] * 0.55, -this.vel[1] * 0.55, world.phone ? 3 : 5);
    }
    this.updateFrame(dt, top, speed);
  }

  /** The focus brackets: closing in from the screen edges during the pull, then hunting and locking. */
  updateFrame(dt: number, top: number, speed: number) {
    const W = world.W, H = world.H;
    const e = world.engine;
    const pull = world.pull;
    const moving = speed > 0.8 || this.dragging || this.mode === 'spring';
    if (moving) this.lockT = 0;
    else this.lockT += dt;
    const pad = this.lockT > 0.12 ? 9 : 22;
    let rect: [number, number, number, number];
    if (this.developAt < 0 || top > 2) {
      // pull: from the viewport's edges to where the first sheet will be
      const fx0 = this.fx - this.dragX;
      const fy0 = this.fy - this.dragY;
      const tp = clamp((pull - 0.25) / 0.75, 0, 1);
      const k = 1 - Math.pow(1 - tp, 3);
      const inset = world.phone ? 14 : 26;
      const x0 = inset + (fx0 - this.pw / 2 - pad - inset) * k;
      const y0 = inset + 56 + (fy0 - this.ph / 2 - pad - inset - 56) * k;
      const x1 = W - inset + (fx0 + this.pw / 2 + pad - (W - inset)) * k;
      const y1 = H - inset + (fy0 + this.ph / 2 + pad - (H - inset)) * k;
      rect = [x0, y0, x1, y1];
      this.afOn = clamp((pull - 0.12) / 0.2, 0, 1) * (top > -H * 0.5 ? 1 : 0);
    } else if (this.focus) {
      const f = this.focus;
      rect = [f.x - f.w / 2 - pad, f.y - f.h / 2 - pad, f.x + f.w / 2 + pad, f.y + f.h / 2 + pad];
      this.afOn = clamp(1 + top / (H * 0.5), 0, 1) * (world.phase === 'open' ? 0 : 1);
    } else {
      rect = [0, 0, W, H];
      this.afOn = 0;
    }
    const [a, b, c, d] = this.af4;
    a.target = rect[0];
    b.target = rect[1];
    c.target = rect[2];
    d.target = rect[3];
    if (this.developAt < 0) this.af4.forEach((s, i) => s.set(rect[i]));
    else this.af4.forEach((s) => s.step(dt));
    const L = a.x, T = b.x, R = c.x, B = d.x;
    const key = `${L.toFixed(1)}${T.toFixed(1)}${R.toFixed(1)}${B.toFixed(1)}${this.afOn.toFixed(2)}`;
    if (key !== this.afLast) {
      this.afLast = key;
      const arm = 22;
      this.corners[0].style.transform = `translate3d(${L}px, ${T}px, 0)`;
      this.corners[1].style.transform = `translate3d(${R - arm}px, ${T}px, 0)`;
      this.corners[2].style.transform = `translate3d(${L}px, ${B - arm}px, 0)`;
      this.corners[3].style.transform = `translate3d(${R - arm}px, ${B - arm}px, 0)`;
      this.af.style.opacity = this.afOn.toFixed(2);
    }
    if (e) {
      e.focusRect = [L / W, 1 - B / H, R / W, 1 - T / H];
      e.frameOn = this.afOn;
    }
  }

  /** A clamped digit roll (01 to 08, never an impossible value) and a masked title swap. */
  setFocus(k: number) {
    const prev = this.focusK;
    this.focusK = k;
    const p = projects[k];
    gsap.to(this.roll, { yPercent: -k * (100 / N), duration: prev < 0 ? 0 : 0.6, ease: 'flux.out', overwrite: true });
    const box = this.titleBox;
    const nu = document.createElement('span');
    nu.textContent = ph(p.title).text;
    box.appendChild(nu);
    while (box.children.length > 3) box.firstElementChild!.remove();
    if (prev >= 0) {
      const olds = Array.from(box.children).slice(0, -1) as HTMLElement[];
      gsap.to(olds, { yPercent: -110, duration: 0.25, ease: 'power2.in', overwrite: true, onComplete: () => olds.forEach((o) => o.remove()) });
      gsap.fromTo(nu, { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: 'flux.out' });
    } else Array.from(box.children).slice(0, -1).forEach((o) => o.remove());
    this.openSr.textContent = `${p.n}`;
    this.links.forEach((a) => a.classList.toggle('is-on', Number(a.dataset.i) === k));
  }

  rectOf(k: number): Cell | null {
    return (this.focus && this.focus.k === k ? this.focus : null) || this.cells.find((c) => c.k === k) || null;
  }
}
