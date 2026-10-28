// Honours: a glass award that bends the ink behind it and a medal on a thread that mirrors it. Both hang in the field,
// lean to the cursor, swing or spin when pushed and settle on a firm spring. Clicking either drops ink.
import { world, dropInk } from './world';
import { Spring, FIRM, clamp } from './spring';

export class Honours {
  glassEl: HTMLElement | null;
  medalEl: HTMLElement | null;
  on = new Spring(0, { k: 60, c: 14 });
  tx = new Spring(0, FIRM);
  ty = new Spring(0, FIRM);
  glassKick = new Spring(0, { k: 160, c: 7 });
  theta = 0; // pendulum angle
  thetaV = 0;
  spin = 0;
  spinV = 0;
  g = { x: 0, y: 0, w: 0, h: 0 };
  m = { x: 0, y: 0, w: 0, h: 0 };
  visible = false;

  constructor() {
    this.glassEl = document.getElementById('glass-anchor');
    this.medalEl = document.getElementById('medal-anchor');
    const poke = (which: 'glass' | 'medal') => {
      const r = which === 'glass' ? this.g : this.m;
      if (which === 'glass') {
        this.glassKick.v += 9;
        dropInk(r.x, r.y, 0.07, 0.9);
      } else {
        this.spinV += 14;
        this.thetaV += 1.2;
        const [mx, my] = this.medalCentre();
        dropInk(mx, my, 0.07, 0.9);
      }
    };
    for (const [el, which] of [[this.glassEl, 'glass'], [this.medalEl, 'medal']] as const) {
      if (!el) continue;
      el.addEventListener('click', () => poke(which));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          poke(which);
        }
      });
    }
  }

  read() {
    const rect = (el: HTMLElement | null, o: { x: number; y: number; w: number; h: number }) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      o.x = r.left + r.width / 2;
      o.y = r.top + r.height / 2;
      o.w = r.width;
      o.h = r.height;
    };
    rect(this.glassEl, this.g);
    rect(this.medalEl, this.m);
    this.visible = this.g.y > -world.H * 0.5 && this.g.y < world.H * 1.5;
  }

  medalGeo() {
    const R = Math.min(this.m.w * 0.42, 96);
    const ax = this.m.x;
    const ay = this.m.y - this.m.h / 2;
    const L = this.m.h - 2 * R - 14;
    return { R, ax, ay, L };
  }
  medalCentre(): [number, number] {
    const { R, ax, ay, L } = this.medalGeo();
    return [ax + Math.sin(this.theta) * (L + R), ay + Math.cos(this.theta) * (L + R)];
  }

  update(dt: number) {
    const e = world.engine;
    if (!e) return;
    const show = this.visible && world.phase !== 'open' && !world.rm;
    this.on.target = show ? 1 : 0;
    this.on.step(dt);
    if (this.on.x < 0.002 && !show) {
      e.glass.on = 0;
      e.medal.on = 0;
      return;
    }
    const t = world.t;
    const P = world.pointer;

    // glass: lean to the cursor, bob in the ink, ring when struck
    const gx = this.g.x, gy = this.g.y + Math.sin(t * 0.8) * 5;
    const near = P.seen ? Math.exp(-Math.pow(Math.hypot(P.x - gx, P.y - gy) / (world.W * 0.25), 2)) : 0;
    this.tx.target = clamp((P.x - gx) / (this.g.w * 2.2), -1, 1) * near;
    this.ty.target = clamp(-(P.y - gy) / (this.g.h * 1.6), -1, 1) * near;
    this.tx.step(dt);
    this.ty.step(dt);
    this.glassKick.step(dt);
    e.glass.x = gx;
    e.glass.y = gy;
    e.glass.hw = this.g.w / 2;
    e.glass.hh = this.g.h / 2;
    e.glass.tx = this.tx.x + this.glassKick.x * 0.05 * Math.sin(t * 9);
    e.glass.ty = this.ty.x;
    e.glass.on = this.on.x;

    // medal: a pendulum that can be spun
    const { R, ax, ay, L } = this.medalGeo();
    const [mx, my] = this.medalCentre();
    if (P.seen && Math.hypot(P.x - mx, P.y - my) < R * 1.3 && !world.coarse) {
      this.thetaV += clamp(P.vx, -3, 3) * 0.05;
      this.spinV += clamp(P.vx, -3, 3) * 0.9;
    }
    const sub = 4;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      this.thetaV += (-(9.8 / Math.max(0.3, (L + R) / 400)) * Math.sin(this.theta) - 1.6 * this.thetaV) * h;
      this.theta += this.thetaV * h;
      // spin settles face-on (either face): a potential with minima at multiples of pi
      this.spinV += (-14 * Math.sin(2 * this.spin) * 0.5 - 1.9 * this.spinV) * h;
      this.spin += this.spinV * h;
    }
    this.theta = clamp(this.theta, -0.9, 0.9);
    e.medal.x = mx;
    e.medal.y = my + Math.sin(t * 0.7 + 1.3) * 3;
    e.medal.r = R;
    e.medal.spin = this.spin;
    e.medal.ax = ax;
    e.medal.ay = ay;
    e.medal.on = this.on.x;
  }
}
