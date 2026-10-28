// Placeholder media, generated in code: each project's "photograph" is an abstract optical scene seeded by its slug and
// tinted by its `tint`. Every layer has a depth, so the shader can give it a true circle of confusion; that is what the
// focus pulls, touch-AF, peaking and the histogram act on. These are labelled as placeholder media on the page.
import type { Honour, Project } from './data';

export const MAXS = 14; // shapes per scene (5 vec4 each)
export const MAXB = 24; // point lights per scene (2 vec4 each)

export interface Shape {
  x: number; y: number; hx: number; hy: number;
  rot: number; radius: number; z: number; type: 0 | 1 | 2 | 3; // box, disc, ring, half-plane (fills below)
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

function archWindow(r: () => number, P: ReturnType<typeof palette>): Built {
  const wx = -0.55 + r() * 0.9, wy = 0.2 + r() * 0.3;
  const floorY = -0.42 - r() * 0.12;
  const sx = -0.35 + r() * 0.7;
  const lightCol = mix(P.light, WARM, 0.55);
  const shapes: Shape[] = [
    // light falling on the back wall through blinds
    shape({ x: wx + 0.55, y: wy - 0.25, hx: 0.42, hy: 0.55, rot: -0.32, radius: 0.02, z: 0.86, color: mul(lightCol, 0.55), alpha: 0.55, stripeFreq: 34, stripeAmt: 0.75, gradAngle: 0, gradAmt: 0.4 }),
    // the window itself
    shape({ x: wx, y: wy, hx: 0.24 + r() * 0.08, hy: 0.4 + r() * 0.12, rot: (r() - 0.5) * 0.08, radius: 0.012, z: 0.9, color: mul(lightCol, 1.55), stripeFreq: 46 + r() * 16, stripeAmt: 0.6, glow: 0.5, glowR: 0.35, gradAmt: 0.15 }),
    // window frame mullion
    shape({ x: wx, y: wy, hx: 0.008, hy: 0.52, z: 0.89, color: mul(P.deep, 0.6), radius: 0.004 }),
    // floor
    shape({ x: 0, y: floorY, hx: 9, hy: 9, type: 3, z: 0.55, color: mix(P.dark, P.mid, 0.35), gradAngle: -Math.PI / 2, gradAmt: 0.5 }),
    // pool of light on the floor
    shape({ x: wx + 0.35, y: floorY - 0.32, hx: 0.75, hy: 0.16, rot: -0.12, radius: 0.02, z: 0.47, color: mul(lightCol, 0.62), alpha: 0.32, stripeFreq: 30, stripeAmt: 0.7, gradAngle: 0, gradAmt: 0.3, soft: 0.03 }),
    // subject: a tall form and a sphere
    // contact shadow
    shape({ x: sx + 0.1, y: floorY + 0.005, hx: 0.3, hy: 0.018, radius: 0.018, z: 0.35, color: mul(P.deep, 0.3), alpha: 0.75, gradAmt: 0, soft: 0.022 }),
    shape({ x: sx, y: floorY + 0.36, hx: 0.12, hy: 0.36, radius: 0.1, z: 0.36, color: mix(P.mid, P.light, 0.2), gradAngle: Math.PI * 0.85, gradAmt: 0.55, shade: 2 }),
    shape({ x: sx + 0.26, y: floorY + 0.14, hx: 0.14, hy: 0.14, type: 1, z: 0.33, color: mix(P.comp, P.light, 0.3), gradAngle: Math.PI * 0.8, gradAmt: 0.6, shade: 1 }),
    // out-of-focus foreground edge
    shape({ x: -1.22 - r() * 0.1, y: 0, hx: 0.22, hy: 1.8, rot: 0.06, radius: 0.1, z: 0.04, color: mul(P.deep, 0.5), alpha: 0.96, gradAmt: 0.1 }),
  ];
  const lights = scatterLights(r, 6, [lightCol, P.glow], 0.9, 1.0, 1.4, 0.0, 1.2);
  return {
    shapes, lights, backTop: mix(P.deep, P.dark, 0.6), backBottom: P.deep, key: [wx + 0.3, wy - 0.2, 1.1, 0.35], keyColor: lightCol,
    haze: mix(P.dark, lightCol, 0.25), focus: 0.35,
  };
}

function archNight(r: () => number, P: ReturnType<typeof palette>): Built {
  const cx = -0.3 + r() * 0.6, cy = -0.05 + r() * 0.25;
  const neon = mix(P.glow, [1, 1, 1], 0.15);
  const shapes: Shape[] = [
    shape({ x: 0, y: -0.7 - r() * 0.2, hx: 9, hy: 9, type: 3, z: 0.7, color: mul(P.deep, 0.9), gradAngle: -Math.PI / 2, gradAmt: 0.6 }),
    shape({ x: cx - 0.75, y: cy + 0.2, hx: 0.012, hy: 0.42 + r() * 0.2, rot: 0.04, radius: 0.012, z: 0.62, color: mul(mix(P.side, [1, 1, 1], 0.3), 1.9), glow: 0.7, glowR: 0.18 }),
    shape({ x: cx + 0.85, y: cy - 0.1, hx: 0.36, hy: 0.011, rot: -0.02, radius: 0.011, z: 0.58, color: mul(mix(P.comp, [1, 1, 1], 0.35), 1.8), glow: 0.7, glowR: 0.16 }),
    // subject: a lit ring
    shape({ x: cx, y: cy, hx: 0.3 + r() * 0.06, hy: 0.011, type: 2, z: 0.38, color: mul(neon, 2.0), glow: 0.9, glowR: 0.22 }),
    shape({ x: cx, y: cy, hx: 0.16, hy: 0.16, type: 1, z: 0.4, color: mul(P.deep, 1.3), alpha: 0.9, gradAmt: 0.4 }),
    shape({ x: cx + 0.02, y: cy - 0.01, hx: 0.05, hy: 0.05, type: 1, z: 0.39, color: mul(neon, 1.4), glow: 0.5, glowR: 0.1 }),
    // foreground silhouettes, far out of focus
    shape({ x: 1.0 + r() * 0.2, y: -0.95, hx: 0.55, hy: 0.6, rot: 0.2, radius: 0.2, z: 0.03, color: [0.01, 0.01, 0.012], alpha: 0.98 }),
  ];
  const cols: RGB[] = [mul(P.glow, 1.1), mix(WARM, P.glow, 0.3), mix(P.comp, [1, 1, 1], 0.3), [1, 0.9, 0.8], P.side];
  const lights = [
    ...scatterLights(r, 18, cols, 0.78, 1.0, 1.55, -0.6, 1.4),
    ...scatterLights(r, 3, cols, 0.05, 0.12, 1.3, -1.2, 1.2).map((l) => ({ ...l, intensity: l.intensity * 0.5 })),
  ];
  return {
    shapes, lights, backTop: mul(P.deep, 0.5), backBottom: mix(P.deep, P.dark, 0.35), key: [cx + 0.2, cy - 0.7, 0.9, 0.09], keyColor: P.glow,
    haze: mul(P.dark, 0.8), focus: 0.38,
  };
}

function archStill(r: () => number, P: ReturnType<typeof palette>): Built {
  const ty = -0.28 - r() * 0.1;
  const x1 = -0.38 + r() * 0.15, x2 = x1 + 0.42 + r() * 0.1, x3 = x2 + 0.32;
  const shapes: Shape[] = [
    shape({ x: 0, y: ty, hx: 9, hy: 9, type: 3, z: 0.5, color: mix(P.light, WARM, 0.25), gradAngle: -Math.PI / 2, gradAmt: 0.35 }),
    shape({ x: 0, y: ty - 0.004, hx: 9, hy: 0.006, z: 0.5, color: mix(P.light, [1, 1, 1], 0.6), alpha: 0.8 }),
    // soft shadows cast to the right, away from the key light
    shape({ x: x1 + 0.1, y: ty - 0.03, hx: 0.22, hy: 0.03, radius: 0.03, z: 0.42, color: mul(P.dark, 0.5), alpha: 0.42, gradAmt: 0, soft: 0.055 }),
    shape({ x: x2 + 0.08, y: ty - 0.028, hx: 0.16, hy: 0.026, radius: 0.026, z: 0.47, color: mul(P.dark, 0.5), alpha: 0.4, gradAmt: 0, soft: 0.05 }),
    // three objects
    shape({ x: x2, y: ty + 0.34, hx: 0.11, hy: 0.34, radius: 0.11, z: 0.47, color: P.mid, gradAngle: Math.PI * 0.8, gradAmt: 0.6, shade: 2 }),
    shape({ x: x1, y: ty + 0.17, hx: 0.17, hy: 0.17, type: 1, z: 0.42, color: mix(P.comp, P.light, 0.25), gradAngle: Math.PI * 0.75, gradAmt: 0.7, shade: 1 }),
    shape({ x: x3, y: ty + 0.06, hx: 0.12, hy: 0.06, radius: 0.04, z: 0.4, color: mix(P.side, P.light, 0.3), gradAngle: Math.PI * 0.8, gradAmt: 0.5, shade: 2 }),
    // near object, far out of focus
    shape({ x: -1.05, y: -0.95, hx: 0.5, hy: 0.5, type: 1, z: 0.04, color: mul(P.deep, 0.9), alpha: 0.97, gradAmt: 0.3 }),
    shape({ x: 1.1, y: 0.75, hx: 0.04, hy: 1.0, rot: 0.15, z: 0.06, radius: 0.04, color: mix(P.light, WARM, 0.5), alpha: 0.6 }),
  ];
  const lights = scatterLights(r, 7, [mix(WARM, P.light, 0.3), P.glow], 0.92, 1.0, 1.4, 0.15, 1.3);
  return {
    shapes, lights, backTop: mix(P.mid, P.dark, 0.6), backBottom: P.dark, key: [-0.8, 0.8, 1.2, 0.22], keyColor: mix(WARM, P.light, 0.4),
    haze: mix(P.dark, P.light, 0.3), focus: 0.44,
  };
}

function archGels(r: () => number, P: ReturnType<typeof palette>): Built {
  const cols: RGB[] = [P.glow, P.comp, P.side, P.light, mix(P.mid, P.comp, 0.5)];
  const shapes: Shape[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const z = 0.85 - (i / (n - 1)) * 0.6;
    shapes.push(shape({
      x: (r() * 2 - 1) * 0.75, y: (r() * 2 - 1) * 0.6, hx: 0.22 + r() * 0.3, hy: 0.25 + r() * 0.35, rot: (r() - 0.5) * 1.2,
      radius: 0.01 + r() * 0.05, z, color: mul(cols[i % cols.length], 1.15), alpha: 0.42 + r() * 0.25,
      gradAngle: r() * Math.PI * 2, gradAmt: 0.35, stripeFreq: i % 2 ? 0 : 70 + r() * 60, stripeAmt: i % 2 ? 0 : 0.22,
    }));
  }
  shapes.push(shape({ x: (r() - 0.5) * 0.6, y: (r() - 0.5) * 0.4, hx: 0.34, hy: 0.018, type: 2, z: 0.5, color: mix(P.light, [1, 1, 1], 0.4), alpha: 0.95, glow: 0.2 }));
  shapes.push(shape({ x: (r() - 0.5) * 0.8, y: 0, hx: 0.004, hy: 1.4, rot: 0.3 + r() * 0.3, z: 0.3, color: [0.92, 0.9, 0.86], alpha: 0.85, radius: 0.002 }));
  shapes.push(shape({ x: 0.9, y: -1.0, hx: 0.6, hy: 0.4, rot: -0.25, radius: 0.2, z: 0.03, color: mul(P.deep, 0.5), alpha: 0.95 }));
  const lights = scatterLights(r, 10, [P.glow, mix(P.light, WARM, 0.4)], 0.9, 1.0);
  return {
    shapes, lights, backTop: mix(P.deep, P.dark, 0.5), backBottom: mul(P.deep, 0.7), key: [0, 0, 1.1, 0.22], keyColor: P.glow,
    haze: P.dark, focus: 0.5,
  };
}

const ARCHS = [archWindow, archNight, archStill, archGels];
const ARCH_NAMES = ['window', 'night', 'still', 'gels'];

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
    archetype: ARCH_NAMES[0], depthAt, ...extra,
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
      radius: sh.radius * scale, rot: sh.rot * m, gradAngle: mirror ? Math.PI - sh.gradAngle : sh.gradAngle };
  });
  b.lights = b.lights.map((l) => ({ ...l, ...mv(l.x, l.y) }));
  b.key = [b.key[0] * m * scale + dx, b.key[1] * scale + dy, b.key[2], b.key[3]];
  return b;
}

export function projectScene(p: Project): Scene {
  const r = mulberry(hashStr(p.slug));
  const a = (p.index * 3 + 2) % 4;
  let built = ARCHS[a](r, palette(p.tint));
  if (p.index >= 4) built = retake(built, true, 0.82 + r() * 0.1, (r() - 0.5) * 0.3, -0.06 + r() * 0.12);
  else built = retake(built, false, 0.96 + r() * 0.12, (r() - 0.5) * 0.2, 0);
  const s = finish(p.slug, 0, built, r);
  s.archetype = ARCH_NAMES[a];
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
    return finish(h.slug, 1, b, r, { glass: [0, -0.05, 0.34, 0.66], glass2: [0.07, 0.11, 1.0, 0.4], archetype: 'glass' });
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
  return finish(h.slug, 2, b, r, { glass: [0, -0.18, 0.4, 0], glass2: [0, 0, 0, 0.4], archetype: 'medal' });
}

/** Focus distance readout from a depth (0 near, 1 far). */
export function distanceLabel(z: number) {
  if (z > 0.93) return '∞';
  const m = 0.3 / Math.max(0.02, 1 - z * 1.02);
  return m < 1 ? `${m.toFixed(2)}m` : m < 10 ? `${m.toFixed(1)}m` : `${Math.round(m)}m`;
}
