// Placeholder media, generated in code: each project's "photograph" is an abstract optical scene seeded by its slug and
// tinted by its `tint`. Every layer has a depth, so the shader can give it a true circle of confusion; that is what the
// focus pulls, touch-AF, peaking and the histogram act on. These are labelled as placeholder media on the page.
import type { Honour, Project } from './data';

export const MAXS = 14; // shapes per scene (5 vec4 each)
export const MAXB = 24; // point lights per scene (2 vec4 each)

export interface Shape {
  x: number; y: number; hx: number; hy: number;
  rot: number; radius: number; z: number; type: number; // 0 box, 1 disc, 2 ring, 3 half-plane, 4 focus chart, 5 plate, 6 light trail, 7 colour chart
  color: [number, number, number]; alpha: number;
  gradAngle: number; gradAmt: number; stripeFreq: number; stripeAmt: number;
  glow: number; glowR: number;
  shade: 0 | 1 | 2; // flat, sphere, cylinder
  soft: number; // extra edge softness (penumbra), scene units
}
interface Light { x: number; y: number; z: number; size: number; color: [number, number, number]; intensity: number }

export interface Scene {
  slug: string;
  kind: 0 | 1 | 2; // project, glass award, medal
  shapes: Float32Array; ns: number;
  lights: Float32Array; nb: number;
  backTop: number[]; backBottom: number[]; key: number[]; keyColor: number[]; haze: number[];
  glass: number[]; glass2: number[];
  focus: number; fnum: number; shutter: string; iso: number;
  archetype: string;
  label: string;
  depthAt: (x: number, y: number) => number;
  /** The object under a point (its centre and depth), or null for the backdrop and ground planes. */
  hitAt: (x: number, y: number) => { x: number; y: number; z: number } | null;
}

type RGB = [number, number, number];

// ---------- seeded randomness and colour ----------
function hashStr(s: string) {
  let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function toHsl([r, g, b]: RGB) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function fromHsl(h: number, s: number, l: number): RGB {
  const f = (n: number) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}
const WARM: RGB = [1.0, 0.86, 0.66];

function palette(tint: string) {
  const base = hex(tint);
  const [h, s] = toHsl(base);
  const sat = Math.min(0.85, Math.max(0.35, s));
  return {
    deep: fromHsl(h, sat * 0.7, 0.06),
    dark: fromHsl(h, sat * 0.75, 0.13),
    mid: fromHsl(h, sat, 0.34),
    light: fromHsl(h, sat * 0.75, 0.66),
    glow: fromHsl(h, Math.min(1, sat * 1.1), 0.62),
    comp: fromHsl((h + 0.5) % 1, sat * 0.45, 0.42),
    side: fromHsl((h + 0.09) % 1, sat * 0.8, 0.5),
  };
}

// ---------- builders ----------
function shape(p: Partial<Shape> & Pick<Shape, 'x' | 'y' | 'hx' | 'hy' | 'z' | 'color'>): Shape {
  return {
    rot: 0, radius: 0, type: 0, alpha: 1, gradAngle: Math.PI / 2, gradAmt: 0.25, stripeFreq: 0, stripeAmt: 0,
    glow: 0, glowR: 0.2, shade: 0, soft: 0, ...p,
  };
}

function sdf(s: Shape, px: number, py: number) {
  let x = px - s.x, y = py - s.y;
  const c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
  [x, y] = [x * c - y * sn, x * sn + y * c];
  switch (s.type) {
    case 1: return Math.hypot(x, y) - s.hx;
    case 2: return Math.abs(Math.hypot(x, y) - s.hx) - s.hy;
    case 3: return y;
    default: {
      const qx = Math.abs(x) - s.hx + s.radius, qy = Math.abs(y) - s.hy + s.radius;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - s.radius;
    }
  }
}

function pack(shapes: Shape[], lights: Light[]) {
  const S = new Float32Array(MAXS * 20);
  shapes.slice(0, MAXS).forEach((s, i) => {
    S.set([s.x, s.y, s.hx, s.hy, s.rot, s.radius, s.z, s.type, ...s.color, s.alpha,
      s.gradAngle, s.gradAmt, s.stripeFreq, s.stripeAmt, s.glow, s.glowR, s.shade, s.soft], i * 20);
  });
  const L = new Float32Array(MAXB * 8);
  lights.slice(0, MAXB).forEach((l, i) => L.set([l.x, l.y, l.z, l.size, ...l.color, l.intensity], i * 8));
  return { S, L, ns: Math.min(MAXS, shapes.length), nb: Math.min(MAXB, lights.length) };
}

const FNUMS = [1.4, 2, 2.8, 4];
const SHUTTERS = ['1/60', '1/125', '1/250', '1/500', '1/1000'];
const ISOS = [160, 200, 400, 800, 1600, 3200];

interface Built { shapes: Shape[]; lights: Light[]; backTop: RGB; backBottom: RGB; key: number[]; keyColor: RGB; haze: RGB; focus: number }

function scatterLights(r: () => number, n: number, cols: RGB[], zMin: number, zMax: number, area = 1.5, yMin = -1.5, yMax = 1.5): Light[] {
  const out: Light[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: (r() * 2 - 1) * area, y: yMin + r() * (yMax - yMin), z: zMin + r() * (zMax - zMin),
      size: 0.006 + r() * 0.012, color: cols[Math.floor(r() * cols.length)], intensity: 1.1 + r() * 1.6,
    });
  }
  return out;
}

// ---- EVF-native test subjects. Placeholder media that admit what they are: charts, plates and light. ----
const SHAPE_PLATE = 5, SHAPE_CHART = 4, SHAPE_TRAIL = 6, SHAPE_COLOUR = 7;
const PAPER: RGB = [0.88, 0.865, 0.83];

/** A 16:10 plate shaped like a screenshot (what the real work will be), lit like a screen in a dark room. */
function plateScene(r: () => number, P: ReturnType<typeof palette>, variant: number, light: boolean): Built {
  const px = -0.04 + (r() - 0.5) * 0.12, py = 0.05;
  const hx = 0.66, hy = hx / 1.6;
  const acc = mix(P.glow, [1, 1, 1], 0.1);
  const base: RGB = light ? PAPER : [0.07, 0.075, 0.085];
  const shapes: Shape[] = [
    shape({ x: 0, y: -0.72, hx: 9, hy: 9, type: 3, z: 0.6, color: mul(P.deep, 0.8), gradAngle: -Math.PI / 2, gradAmt: 0.4 }),
    // the plate's shadow and a thin edge of light around it
    shape({ x: px + 0.03, y: py - 0.04, hx: hx + 0.01, hy: hy + 0.01, radius: 0.02, z: 0.44, color: [0.005, 0.005, 0.006], alpha: 0.7, soft: 0.05, gradAmt: 0 }),
    shape({ x: px, y: py, hx, hy, radius: 0.012, z: 0.42, type: SHAPE_PLATE, color: base, gradAngle: variant, gradAmt: acc[0], stripeFreq: acc[1], stripeAmt: acc[2] }),
    // a second screen, phone-shaped, close to the lens and far out of focus
    shape({ x: 1.02, y: -0.42, hx: 0.17, hy: 0.36, rot: 0.1, radius: 0.03, z: 0.1, type: SHAPE_PLATE, color: light ? [0.07, 0.075, 0.085] : PAPER, gradAngle: 1 - variant, gradAmt: P.comp[0] + 0.2, stripeFreq: P.comp[1] + 0.2, stripeAmt: P.comp[2] + 0.2 }),
  ];
  const lights = scatterLights(r, 7, [mix(P.light, WARM, 0.4), P.glow], 0.88, 1.0, 1.5, -0.3, 1.4);
  return {
    shapes, lights, backTop: mix(P.deep, P.dark, 0.55), backBottom: mul(P.deep, 0.7), key: [px, py, 1.15, light ? 0.3 : 0.2],
    keyColor: mix(P.light, [1, 1, 1], 0.4), haze: P.dark, focus: 0.42,
  };
}

/** A focus chart (Siemens star and line pairs) on a stand, with a second chart behind it. */
function chartScene(r: () => number, P: ReturnType<typeof palette>): Built {
  const cx = -0.08 + (r() - 0.5) * 0.2;
  const grey = mix([0.3, 0.3, 0.3], P.mid, 0.35);
  const shapes: Shape[] = [
    shape({ x: 0, y: -0.66, hx: 9, hy: 9, type: 3, z: 0.56, color: mul(grey, 0.55), gradAngle: -Math.PI / 2, gradAmt: 0.5 }),
    shape({ x: -0.92, y: 0.32, hx: 0.24, hy: 0.3, rot: -0.12, radius: 0.008, z: 0.8, type: SHAPE_CHART, color: mul(PAPER, 0.85), gradAngle: Math.PI * 0.8, gradAmt: 0.25 }),
    shape({ x: cx, y: -0.52, hx: 0.012, hy: 0.2, z: 0.43, color: [0.03, 0.03, 0.035], gradAmt: 0.2 }),
    shape({ x: cx + 0.03, y: 0.03, hx: 0.44, hy: 0.52, radius: 0.012, z: 0.45, color: [0.01, 0.01, 0.012], alpha: 0.65, soft: 0.045, gradAmt: 0 }),
    shape({ x: cx, y: 0.06, hx: 0.42, hy: 0.5, rot: (r() - 0.5) * 0.08, radius: 0.008, z: 0.42, type: SHAPE_CHART, color: PAPER, gradAngle: Math.PI * 0.75, gradAmt: 0.3 }),
    shape({ x: 1.1, y: -0.85, hx: 0.5, hy: 0.32, rot: 0.25, radius: 0.04, z: 0.06, color: mul(P.deep, 0.6), alpha: 0.95 }),
  ];
  const lights = scatterLights(r, 6, [mix(WARM, [1, 1, 1], 0.4), P.glow], 0.9, 1.0, 1.5, 0.1, 1.4);
  return {
    shapes, lights, backTop: mul(grey, 0.75), backBottom: mul(grey, 0.35), key: [cx - 0.4, 0.6, 1.1, 0.22], keyColor: mix(WARM, [1, 1, 1], 0.5),
    haze: mul(grey, 0.5), focus: 0.42,
  };
}

/** A colour chart (hues and a grey ramp), with a grey card hung behind it. */
function colourScene(r: () => number, P: ReturnType<typeof palette>): Built {
  const cx = 0.04 + (r() - 0.5) * 0.16;
  const shapes: Shape[] = [
    shape({ x: 0, y: -0.7, hx: 9, hy: 9, type: 3, z: 0.58, color: mul(P.dark, 0.7), gradAngle: -Math.PI / 2, gradAmt: 0.45 }),
    shape({ x: -0.82, y: 0.3, hx: 0.3, hy: 0.4, rot: 0.08, radius: 0.01, z: 0.74, color: [0.42, 0.42, 0.42], gradAngle: Math.PI * 0.8, gradAmt: 0.3 }),
    shape({ x: cx + 0.035, y: -0.03, hx: 0.62, hy: 0.44, radius: 0.02, z: 0.45, color: [0.005, 0.005, 0.006], alpha: 0.65, soft: 0.05, gradAmt: 0 }),
    shape({ x: cx, y: 0.0, hx: 0.6, hy: 0.42, rot: (r() - 0.5) * 0.1, radius: 0.016, z: 0.42, type: SHAPE_COLOUR, color: [0.025, 0.025, 0.028] }),
    shape({ x: cx, y: 0.45, hx: 0.06, hy: 0.035, radius: 0.006, z: 0.415, color: [0.12, 0.12, 0.13], gradAngle: Math.PI / 2, gradAmt: 0.5 }),
  ];
  const lights = scatterLights(r, 8, [mix(P.light, WARM, 0.5), P.glow, [0.9, 0.92, 1]], 0.88, 1.0, 1.5, -0.2, 1.4);
  return {
    shapes, lights, backTop: mix(P.dark, P.mid, 0.25), backBottom: mul(P.deep, 0.8), key: [cx + 0.5, 0.5, 1.2, 0.18], keyColor: mix(P.light, WARM, 0.5),
    haze: P.dark, focus: 0.42,
  };
}

/** Light painting: trails drawn by a long exposure, at several depths; they keep drifting slowly. */
function lightScene(r: () => number, P: ReturnType<typeof palette>): Built {
  const cols: RGB[] = [mul(P.glow, 2.2), mul(mix(P.comp, [1, 1, 1], 0.35), 2.0), mul(WARM, 2.1), mul(mix(P.side, [1, 1, 1], 0.3), 2.0), mul(P.light, 2.0)];
  const shapes: Shape[] = [];
  const n = 6;
  for (let k = 0; k < n; k++) {
    const z = k === 2 ? 0.45 : 0.22 + r() * 0.55;
    shapes.push(shape({
      x: (r() - 0.5) * 0.5, y: -0.55 + k * 0.2 + (r() - 0.5) * 0.1, hx: 1.1 + r() * 0.5, hy: 0.06 + r() * 0.22,
      rot: (r() - 0.5) * 0.7, z, type: SHAPE_TRAIL, color: cols[k % cols.length], glow: 1.0 + r() * 0.6,
      gradAngle: 1.8 + r() * 3.2, gradAmt: r() * 6.28,
    }));
  }
  shapes.push(shape({ x: 0, y: -0.9, hx: 9, hy: 9, type: 3, z: 0.62, color: mul(P.deep, 0.5), gradAngle: -Math.PI / 2, gradAmt: 0.4 }));
  const lights = [
    ...scatterLights(r, 10, [P.glow, mix(WARM, [1, 1, 1], 0.3)], 0.85, 1.0, 1.5, -0.4, 1.4),
    ...scatterLights(r, 3, [mul(P.glow, 0.8)], 0.04, 0.12, 1.3, -1.2, 1.2).map((l) => ({ ...l, intensity: l.intensity * 0.45 })),
  ];
  return {
    shapes, lights, backTop: mul(P.deep, 0.45), backBottom: mul(P.deep, 0.3), key: [0, 0, 1.2, 0.08], keyColor: P.glow,
    haze: mul(P.deep, 0.8), focus: 0.45,
  };
}

const PLAN: { name: string; label: string; build: (r: () => number, P: ReturnType<typeof palette>) => Built }[] = [
  { name: 'plate', label: '16:10 screenshot plate', build: (r, P) => plateScene(r, P, 0, true) },
  { name: 'chart', label: 'focus chart', build: chartScene },
  { name: 'light', label: 'light painting', build: lightScene },
  { name: 'colour', label: 'colour chart', build: colourScene },
  { name: 'plate', label: '16:10 screenshot plate', build: (r, P) => plateScene(r, P, 1, false) },
  { name: 'light', label: 'light painting', build: lightScene },
  { name: 'chart', label: 'focus chart', build: chartScene },
  { name: 'colour', label: 'colour chart', build: colourScene },
];

function finish(slug: string, kind: 0 | 1 | 2, b: Built, r: () => number, extra: Partial<Scene> = {}): Scene {
  const { S, L, ns, nb } = pack(b.shapes, b.lights);
  const shapes = b.shapes.slice(0, MAXS);
  const glass = extra.glass ?? [0, 0, 0, 0];
  const glass2 = extra.glass2 ?? [0, 0, 0, 0];
  const depthAt = (x: number, y: number) => {
    if (kind !== 0) {
      const inside = kind === 1
        ? Math.abs(x - glass[0]) < glass[2] && Math.abs(y - glass[1]) < glass[3]
        : Math.hypot(x - glass[0], y - glass[1]) < glass[2];
      if (inside) return glass2[3];
    }
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.alpha < 0.35) continue;
      if (sdf(s, x, y) < 0) return s.z;
    }
    return 0.95;
  };
  const hitAt = (x: number, y: number) => {
    if (kind !== 0 && depthAt(x, y) === glass2[3]) return { x: glass[0], y: glass[1], z: glass2[3] };
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.alpha < 0.35 || s.soft > 0) continue;
      if (sdf(s, x, y) < 0) return s.type === 3 || Math.max(s.hx, s.hy) > 0.75 || s.z < 0.15 ? null : { x: s.x, y: s.y, z: s.z };
    }
    return null;
  };
  return {
    slug, kind, shapes: S, ns, lights: L, nb, hitAt,
    backTop: b.backTop, backBottom: b.backBottom, key: b.key, keyColor: b.keyColor, haze: b.haze,
    glass, glass2, focus: b.focus,
    fnum: FNUMS[Math.floor(r() * FNUMS.length)], shutter: SHUTTERS[Math.floor(r() * SHUTTERS.length)], iso: ISOS[Math.floor(r() * ISOS.length)],
    archetype: 'scene', label: 'generated in code', depthAt, ...extra,
  };
}

/** A second take of an archetype: the camera moves (mirror, distance, framing), so no two frames share a composition. */
function retake(b: Built, mirror: boolean, scale: number, dx: number, dy: number): Built {
  const m = mirror ? -1 : 1;
  const mv = (x: number, y: number) => ({ x: (x * m) * scale + dx, y: y * scale + dy });
  b.shapes = b.shapes.map((sh) => {
    const p = mv(sh.x, sh.y);
    const big = sh.type === 3;
    return { ...sh, x: big ? sh.x : p.x, y: big ? sh.y * scale + dy : p.y, hx: big ? sh.hx : sh.hx * scale, hy: big ? sh.hy : sh.hy * scale,
      radius: sh.radius * scale, rot: sh.rot * m, gradAngle: mirror && sh.type !== 5 && sh.type !== 6 ? Math.PI - sh.gradAngle : sh.gradAngle };
  });
  b.lights = b.lights.map((l) => ({ ...l, ...mv(l.x, l.y) }));
  b.key = [b.key[0] * m * scale + dx, b.key[1] * scale + dy, b.key[2], b.key[3]];
  return b;
}

export function projectScene(p: Project): Scene {
  const r = mulberry(hashStr(p.slug));
  const plan = PLAN[p.index % PLAN.length];
  let built = plan.build(r, palette(p.tint));
  if (p.index >= 4) built = retake(built, true, 0.82 + r() * 0.1, (r() - 0.5) * 0.3, -0.06 + r() * 0.12);
  else built = retake(built, false, 0.96 + r() * 0.12, (r() - 0.5) * 0.2, 0);
  const s = finish(p.slug, 0, built, r);
  s.archetype = plan.name;
  s.label = plan.label;
  return s;
}

/** The glass award: a refracting slab in front of light bars tinted by every project (the work, seen through it). */
export function honourScene(h: Honour, tints: string[]): Scene {
  const r = mulberry(hashStr(h.slug));
  const P = palette(h.kind === 'award' ? '#2B3A4A' : '#4A4038');
  const shapes: Shape[] = [];
  if (h.kind === 'award') {
    tints.slice(0, 8).forEach((t, i) => {
      const c = mix(palette(t).glow, [0.85, 0.85, 0.85], 0.35);
      shapes.push(shape({ x: -1.12 + i * 0.32 + (r() - 0.5) * 0.06, y: 0.3, hx: 0.018 + (i % 3) * 0.014, hy: 1.0, radius: 0.02, z: 0.93, color: mul(c, 0.95), glow: 0.22, glowR: 0.1, gradAngle: Math.PI / 2, gradAmt: 0.45 }));
    });
    shapes.push(shape({ x: 0, y: -0.72, hx: 9, hy: 9, type: 3, z: 0.55, color: mul(P.dark, 0.7), gradAngle: -Math.PI / 2, gradAmt: 0.5 }));
    shapes.push(shape({ x: 0, y: -0.82, hx: 0.5, hy: 0.1, radius: 0.015, z: 0.42, color: [0.035, 0.035, 0.04], gradAngle: Math.PI / 2, gradAmt: 0.6 }));
    const b: Built = {
      shapes, lights: scatterLights(r, 8, [mix(WARM, [1, 1, 1], 0.5)], 0.9, 1.0, 1.5, -0.4, 1.4),
      backTop: mul(P.deep, 0.8), backBottom: mul(P.deep, 0.5), key: [0, 0.4, 1.2, 0.2], keyColor: [0.7, 0.75, 0.85], haze: P.dark, focus: 0.4,
    };
    return finish(h.slug, 1, b, r, { glass: [0, -0.05, 0.34, 0.66], glass2: [0.07, 0.11, 1.0, 0.4], archetype: 'glass', label: 'glass award render' });
  }
  // medal: a ribbon and a disc of unknown metal (rendered neutral, since the metal is not known)
  const rib = palette('#3A3F4F');
  shapes.push(shape({ x: -0.2, y: 0.62, hx: 0.13, hy: 0.62, rot: -0.36, radius: 0.01, z: 0.46, color: rib.mid, stripeFreq: 60, stripeAmt: 0.35, gradAngle: 0, gradAmt: 0.3 }));
  shapes.push(shape({ x: 0.2, y: 0.62, hx: 0.13, hy: 0.62, rot: 0.36, radius: 0.01, z: 0.45, color: mul(rib.mid, 0.85), stripeFreq: 60, stripeAmt: 0.35, gradAngle: Math.PI, gradAmt: 0.3 }));
  shapes.push(shape({ x: 0, y: -0.92, hx: 9, hy: 9, type: 3, z: 0.6, color: mul(P.dark, 0.5), gradAngle: -Math.PI / 2, gradAmt: 0.5 }));
  const b: Built = {
    shapes, lights: scatterLights(r, 10, [mix(WARM, [1, 1, 1], 0.4), [0.8, 0.85, 1]], 0.88, 1.0, 1.5, -0.6, 1.4),
    backTop: mul(P.deep, 0.9), backBottom: mul(P.deep, 0.45), key: [-0.4, 0.5, 1.0, 0.22], keyColor: mix(WARM, [1, 1, 1], 0.5), haze: P.dark, focus: 0.4,
  };
  return finish(h.slug, 2, b, r, { glass: [0, -0.18, 0.4, 0], glass2: [0, 0, 0, 0.4], archetype: 'medal', label: 'medal render' });
}

/** Focus distance readout from a depth (0 near, 1 far). */
export function distanceLabel(z: number) {
  if (z > 0.93) return '∞';
  const m = 0.3 / Math.max(0.02, 1 - z * 1.02);
  return m < 1 ? `${m.toFixed(2)}m` : m < 10 ? `${m.toFixed(1)}m` : `${Math.round(m)}m`;
}
