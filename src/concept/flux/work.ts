// The work: an infinite zigzag canvas of marbled sheets. Scroll runs through all eight in order; a drag throws the
// canvas anywhere (it wraps forever) and one firm spring lands it on the nearest sheet. The focus brackets hunt for
// the sheet nearest the focus point and lock onto it.
import gsap from 'gsap';
import { projects, ph } from './content';
import { world } from './world';
import { Spring, FIRM, SNAP, clamp, easeOutExpo } from './spring';
import type { PlaneDraw } from './gl/engine';

const N = projects.length;
const mod = (a: number, n: number) => ((a % n) + n) % n;

interface Cell {
  key: string;
  j: number;
  m: number;
  k: number; // project index
  x: number; // screen centre
  y: number;
  w: number;
  h: number;
}

export class Work {
  stage: HTMLElement;
  af: HTMLElement;
  corners: HTMLElement[];
  nEl: HTMLElement;
  titleEl: HTMLElement;
  openBtn: HTMLButtonElement;
  openSr: HTMLElement;
  links: HTMLAnchorElement[];
  hud: HTMLElement;

  // layout
  pw = 360;
  ph = 450;
  cp = 446;
  rp = 560;
  zig = true;
  fx = 0;
  fy = 0;
  step = 280;

  stageTop = 0;
  travel = 0; // from the pinned scroll
  dragX = 0;
  dragY = 0;
  sx = new Spring(0, { k: 150, c: 20 });
  sy = new Spring(0, { k: 150, c: 20 });
  mode: 'free' | 'drag' | 'spring' = 'free';
  lastOx = 0;
  lastOy = 0;
  vel: [number, number] = [0, 0];
  cells: Cell[] = [];
  focus: Cell | null = null;
  focusK = -1;
  hovers = new Map<string, Spring>();
  hoverKey = '';
  mouseUv: [number, number] = [0.5, 0.5];
  developAt = -1;
  hide = new Spring(1, { k: 120, c: 20 });
  af4 = [new Spring(0, FIRM), new Spring(0, FIRM), new Spring(0, FIRM), new Spring(0, FIRM)];
  afOn = 0;
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
    this.nEl = document.getElementById('work-n')!;
    this.titleEl = document.getElementById('work-title-t')!;
    this.openBtn = document.getElementById('work-open') as HTMLButtonElement;
    this.openSr = document.getElementById('work-open-sr')!;
    this.hud = document.getElementById('work-hud')!;
    this.links = Array.from(document.querySelectorAll('#work-index a')) as HTMLAnchorElement[];
    this.layout();
    this.bind();
  }

  layout() {
    const W = world.W, H = world.H;
    if (world.phone) {
      this.zig = false;
      this.pw = Math.min(W * 0.66, 300);
      this.ph = this.pw * 1.25;
      this.cp = this.pw + 22;
      this.rp = this.ph + 26;
      this.fx = W / 2;
      this.fy = H * 0.47;
      this.step = this.rp;
    } else {
      this.zig = true;
      this.ph = Math.min(H * 0.5, 560);
      this.pw = this.ph * 0.8;
      this.cp = this.pw * 1.24;
      this.rp = this.ph + this.pw * 0.24;
      this.fx = W * 0.6;
      this.fy = H * 0.5;
      this.step = this.rp / 2;
    }
  }

  /** Scroll length of the pinned section: through all eight, ending on the last. */
  travelPx() {
    return this.step * (N - 1) + world.H * 0.25;
  }

  colX(j: number) {
    return this.zig ? (j + 0.5) * this.cp : j * this.cp;
  }
  rowY(j: number, m: number) {
    return m * this.rp + (mod(j, 2) === 1 ? this.rp / 2 : 0);
  }
  index(j: number, m: number) {
    if (this.zig) {
      const P = Math.floor((j + 1) / 2);
      return mod(2 * m + (mod(j, 2) === 1 ? 1 : 0) + 3 * P, N);
    }
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
      if (Math.hypot(dx, dy) > 4) s.classList.add('is-drag');
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
      // release: one spring from the throw to the nearest sheet
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

  throwTo(vx: number, vy: number) {
    const tau = 0.22;
    const tx = this.dragX + vx * tau;
    const ty = this.dragY + vy * tau;
    const [sxT, syT] = this.snap(tx, ty);
    this.sx.x = this.dragX;
    this.sx.v = vx;
    this.sx.target = sxT;
    this.sy.x = this.dragY;
    this.sy.v = vy;
    this.sy.target = syT;
    this.mode = 'spring';
  }

  /** The drag offset that lands a sheet exactly in focus, nearest to (dx, dy). */
  snap(dx: number, dy: number): [number, number] {
    const X = Math.round(dx / this.cp) * this.cp;
    const s = this.zig ? this.rp / 2 : this.rp;
    const Y = Math.round((dy + this.travel) / s) * s - this.travel;
    return [X, Y];
  }

  /** The drag offset that puts the nearest copy of project k in focus. */
  nearest(k: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bd = Infinity;
    const j0 = Math.round(this.ox / this.cp);
    const m0 = Math.round(this.oy / this.rp);
    for (let j = j0 - 4; j <= j0 + 4; j++) {
      for (let m = m0 - 6; m <= m0 + 6; m++) {
        if (this.index(j, m) !== k) continue;
        const X = this.zig ? (mod(j, 2) === 1 ? (j + 1) * this.cp : j * this.cp) : this.colX(j);
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
    // wait for the flight to land, then open from the sheet itself
    const go = () => {
      const c = this.cells.find((c) => c.k === k && this.focus && c.key === this.focus.key) || this.focus;
      if (c) this.onOpen(c.k, c, [0.5, 0.5]);
    };
    if (this.focus && this.focus.k === k && this.mode !== 'spring') go();
    else gsap.delayedCall(0.45, go);
  }

  hit(x: number, y: number): Cell | null {
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const c = this.cells[i];
      if (Math.abs(x - c.x) <= c.w / 2 && Math.abs(y - c.y) <= c.h / 2) return c;
    }
    return null;
  }

  develop() {
    if (this.developAt < 0) this.developAt = world.t;
  }

  // ---------------------------------------------------------------- frame
  update(dt: number, draws: PlaneDraw[]) {
    const e = world.engine;
    const W = world.W, H = world.H;
    this.stageTop = this.stage.getBoundingClientRect().top;
    if (this.mode === 'spring') {
      this.dragX = this.sx.step(dt);
      this.dragY = this.sy.step(dt);
      if (this.sx.settled && this.sy.settled) this.mode = 'free';
    }
    const ox = this.ox, oy = this.oy;
    const vx = (ox - this.lastOx) * (1 / 60 / Math.max(dt, 1e-3));
    const vy = (oy - this.lastOy) * (1 / 60 / Math.max(dt, 1e-3));
    this.lastOx = ox;
    this.lastOy = oy;
    this.vel[0] += (clamp(vx, -90, 90) - this.vel[0]) * 0.35;
    this.vel[1] += (clamp(vy, -90, 90) - this.vel[1]) * 0.35;
    const speed = Math.hypot(this.vel[0], this.vel[1]);

    // visible cells
    const cells: Cell[] = [];
    const scale = 1 - Math.min(speed / 90, 1) * 0.07;
    const w = this.pw * scale, h = this.ph * scale;
    const top = this.stageTop;
    const visible = top < H && top > -H * 1.2;
    if (visible) {
      const jMin = Math.floor((ox - this.fx - this.pw) / this.cp) - 1;
      const jMax = Math.ceil((ox + (W - this.fx) + this.pw) / this.cp) + 1;
      for (let j = jMin; j <= jMax; j++) {
        const cx = this.fx + this.colX(j) - ox;
        if (cx < -this.pw || cx > W + this.pw) continue;
        const off = mod(j, 2) === 1 ? this.rp / 2 : 0;
        const mMin = Math.floor((oy - this.fy - top - this.ph - off) / this.rp) - 1;
        const mMax = Math.ceil((oy + H - this.fy - top + this.ph - off) / this.rp) + 1;
        for (let m = mMin; m <= mMax; m++) {
          const cy = this.fy + this.rowY(j, m) - oy + top;
          if (cy < -this.ph || cy > H + this.ph) continue;
          cells.push({ key: `${j},${m}`, j, m, k: this.index(j, m), x: cx, y: cy, w, h });
        }
      }
    }
    this.cells = cells;

    // focus: the sheet nearest the focus point
    let focus: Cell | null = null;
    let fd = Infinity;
    for (const c of cells) {
      const d = Math.hypot((c.x - this.fx) * 0.8, c.y - (this.fy + top));
      if (d < fd) {
        fd = d;
        focus = c;
      }
    }
    this.focus = focus;
    if (focus && focus.k !== this.focusK && world.phase === 'intro') this.setFocus(focus.k);

    // hover
    const P = world.pointer;
    let over: Cell | null = null;
    if (!this.dragging && P.seen && world.phase === 'intro' && this.developAt >= 0) over = this.hit(P.x, P.y);
    this.hoverKey = over ? over.key : '';
    this.stage.classList.toggle('is-over', !!over);
    if (over) this.mouseUv = [(P.x - (over.x - over.w / 2)) / over.w, 1 - (P.y - (over.y - over.h / 2)) / over.h];

    // hidden while a project is open
    this.hide.target = world.phase === 'open' ? 0 : 1;
    this.hide.step(dt);

    // draws
    const bend = world.phone ? 0.5 : 0.85;
    const split: [number, number] = [clamp(this.vel[0] * 0.00022, -0.012, 0.012), clamp(-this.vel[1] * 0.00022, -0.012, 0.012)];
    const vel: [number, number] = [clamp(-this.vel[0], -60, 60), clamp(-this.vel[1], -60, 60)];
    const seen = new Set<string>();
    for (const c of cells) {
      seen.add(c.key);
      let hs = this.hovers.get(c.key);
      if (!hs) this.hovers.set(c.key, (hs = new Spring(0, SNAP)));
      hs.target = c.key === this.hoverKey ? 1 : 0;
      hs.step(dt);
      const isFocus = focus && c.key === focus.key ? 1 : 0;
      let dev = 1;
      if (this.developAt < 0) dev = 0;
      else {
        const dist = Math.hypot(c.x - this.fx, c.y - (this.fy + top));
        const delay = Math.min(0.9, dist * 0.0009);
        dev = easeOutExpo(clamp((world.t - this.developAt - delay) / 1.1, 0, 1));
      }
      // fade sheets that pass under the HUD (desktop)
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
        focus: 0.38 + 0.62 * Math.max(isFocus, hs.x * 0.8),
        hover: hs.x,
        mouse: c.key === this.hoverKey ? this.mouseUv : [0.5, 0.5],
        develop: dev,
        wave: [0.5, 0.5, 1],
        waveAmp: 0,
        seed: c.k * 1.7 + 0.3,
        vel,
        split,
        bend,
        clip: [top, top + H],
        vfade: world.phone ? [top + 40, top + 150, top + H - 190, top + H - 60] : undefined,
      });
    }
    for (const k of this.hovers.keys()) if (!seen.has(k)) this.hovers.delete(k);

    // the canvas stirs the ink behind it
    if (e && visible && speed > 0.6 && world.phase === 'intro') {
      e.stir(this.fx, this.fy + top, -this.vel[0] * 0.55, -this.vel[1] * 0.55, world.phone ? 3 : 5);
    }

    this.updateFrame(dt, top, speed);
  }

  /** The focus brackets: closing in from the screen edges during the pull, then hunting and locking. */
  updateFrame(dt: number, top: number, speed: number) {
    const W = world.W, H = world.H;
    const e = world.engine;
    const pull = world.pull;
    // the first sheet's rect once pinned
    const fx0 = this.fx + this.colX(0) - this.dragX;
    const fy0 = this.fy + this.rowY(0, 0) - this.dragY;
    let rect: [number, number, number, number];
    const moving = speed > 0.8 || this.dragging || this.mode === 'spring';
    if (moving) this.lockT = 0;
    else this.lockT += dt;
    const pad = this.lockT > 0.12 ? 9 : 22;
    if (this.developAt < 0 || top > 2) {
      // pull: from the viewport's edges to where the first sheet will be
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
    // springs: the frame follows, firm while scrubbed, bouncy on a jump
    const [a, b, c, d] = this.af4;
    a.target = rect[0];
    b.target = rect[1];
    c.target = rect[2];
    d.target = rect[3];
    if (this.developAt < 0) {
      a.set(rect[0]);
      b.set(rect[1]);
      c.set(rect[2]);
      d.set(rect[3]);
    } else this.af4.forEach((s) => s.step(dt));
    const L = a.x, T = b.x, R = c.x, B = d.x;
    const arm = 22;
    this.corners[0].style.transform = `translate3d(${L}px, ${T}px, 0)`;
    this.corners[1].style.transform = `translate3d(${R - arm}px, ${T}px, 0)`;
    this.corners[2].style.transform = `translate3d(${L}px, ${B - arm}px, 0)`;
    this.corners[3].style.transform = `translate3d(${R - arm}px, ${B - arm}px, 0)`;
    this.af.style.opacity = this.afOn.toFixed(3);

    // the field: sharp inside the frame, soft outside
    if (e) {
      e.focusRect = [L / W, 1 - B / H, R / W, 1 - T / H];
      e.frameOn = this.afOn;
    }
  }

  setFocus(k: number) {
    this.focusK = k;
    const p = projects[k];
    gsap.to(this.nEl, { duration: 0.25, scrambleText: { text: p.n, chars: '0123456789', speed: 0.6 }, overwrite: true });
    gsap.to(this.titleEl, { duration: 0.6, scrambleText: { text: ph(p.title).text, chars: 'lowerCase', speed: 0.8, revealDelay: 0.1 }, overwrite: true });
    this.openSr.textContent = `${p.n}`;
    this.links.forEach((a) => a.classList.toggle('is-on', Number(a.dataset.i) === k));
  }

  rectOf(k: number): Cell | null {
    return this.cells.find((c) => c.k === k && this.focus && c.key === this.focus.key) || this.cells.find((c) => c.k === k) || null;
  }
}
