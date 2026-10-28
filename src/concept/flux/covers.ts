// Generated placeholder covers: one marbled sheet per project, seeded by its slug and coloured from its tint.
// A recipe is what a marbler does: drop inks (each drop pushes the older ones aside), then draw combs, waves and swirls
// through them. The shader evaluates the exact inverse of those steps per pixel.
import { hexToRgb, seedOf } from './content';

export interface Recipe {
  drops: number[][]; // x, y, r, colour index
  opsA: number[][]; // type (1 comb, 2 wave, 3 swirl), ...
  opsB: number[][];
  pal: number[][]; // 6 colours
}

function rng(seed: number) {
  let a = (seed * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

export function recipe(slug: string, index: number, tintHex: string): Recipe {
  const R = rng(seedOf(slug) + index * 0.137);
  const rr = (a: number, b: number) => a + (b - a) * R();
  const tint = hexToRgb(tintHex);
  const bone = [0.85, 0.82, 0.75];
  const ink = [0.03, 0.03, 0.035];
  const deep = tint.map((v) => v * 0.42);
  const light = mix(tint, bone, 0.5);
  const lifted = tint.map((v) => Math.min(1, v * 1.55 + 0.04));
  const pal = [deep, tint, light, ink, bone, lifted];
  const drops: number[][] = [];
  const opsA: number[][] = [];
  const opsB: number[][] = [];
  const W = 0.4, H = 0.5; // half extents of a 4:5 sheet
  const pick = (weights: number[]) => {
    const s = weights.reduce((a, b) => a + b, 0);
    let x = R() * s;
    for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) < 0) return i;
    return 0;
  };
  const stone = (n: number, rmin: number, rmax: number, w = [0, 4, 2, 2, 1, 1.4]) => {
    for (let i = 0; i < n; i++) drops.push([rr(-W * 1.15, W * 1.15), rr(-H * 1.1, H * 1.1), rr(rmin, rmax), pick(w)]);
  };
  const sprinkle = (n: number, w = [0, 1, 2, 3, 1, 2]) => {
    for (let i = 0; i < n; i++) drops.push([rr(-W, W), rr(-H, H), rr(0.006, 0.018), pick(w)]);
  };
  const comb = (angle: number, spacing: number, shift: number, lambda: number, offset = 0) => {
    opsA.push([1, angle, spacing, shift]);
    opsB.push([lambda, offset, 0, 0]);
  };
  const wave = (angle: number, amp: number, freq: number, phase: number) => {
    opsA.push([2, angle, amp, freq]);
    opsB.push([phase, 0, 0, 0]);
  };
  const swirl = (x: number, y: number, angle: number, radius: number) => {
    opsA.push([3, x, y, angle]);
    opsB.push([radius, 0, 0, 0]);
  };
  const kind = index % 8;
  if (kind === 0) {
    // suminagashi: drops into drops at a few points
    const centres = 5;
    for (let c = 0; c < centres; c++) {
      const x = rr(-W, W), y = rr(-H, H), r = rr(0.035, 0.06);
      const seq = [1, 3, 4, 3, 1, 2, 3, 5];
      for (let k = 0; k < 7; k++) drops.push([x, y, r, seq[(k + c) % seq.length]]);
    }
    wave(Math.PI / 2, 0.025, 7, rr(0, 6));
    swirl(rr(-0.1, 0.1), rr(-0.1, 0.1), 1.6, 0.32);
  } else if (kind === 1) {
    // nonpareil: stone, a zigzag, then a fine comb
    stone(40, 0.05, 0.12);
    comb(Math.PI / 2, 0.12, 0.22, 0.02);
    comb(-Math.PI / 2, 0.12, 0.22, 0.02, 0.5);
    comb(0, 0.028, 0.05, 0.006);
  } else if (kind === 2) {
    // stone (Turkish)
    stone(40, 0.03, 0.15, [0, 4, 2, 3, 0.6, 1.2]);
    sprinkle(22, [0, 1, 4, 3, 2, 5]);
    wave(0.3, 0.012, 9, rr(0, 6));
    swirl(rr(-0.2, 0.2), rr(-0.3, 0.3), 1.2, 0.2);
  } else if (kind === 3) {
    // chevron
    stone(38, 0.04, 0.12);
    comb(0, 0.16, 0.22, 0.03);
    comb(Math.PI, 0.16, 0.22, 0.03, 0.5);
  } else if (kind === 4) {
    // bouquet
    stone(40, 0.05, 0.11, [0, 3, 3, 2, 1, 1]);
    comb(Math.PI / 2, 0.1, 0.18, 0.02);
    wave(0, 0.035, 22, rr(0, 6));
    wave(Math.PI / 2, 0.02, 14, rr(0, 6));
  } else if (kind === 5) {
    // vortex
    stone(40, 0.04, 0.13);
    sprinkle(18);
    swirl(rr(-0.08, 0.08), rr(-0.1, 0.1), 5.2, 0.34);
    swirl(rr(-0.25, 0.25), rr(-0.35, 0.35), -2.2, 0.16);
  } else if (kind === 6) {
    // feather: rows of ink, combed both ways
    for (let row = 0; row < 9; row++) for (let i = 0; i < 4; i++) drops.push([rr(-W, W), -H + (row + 0.5) * (2 * H / 9) + rr(-0.02, 0.02), rr(0.06, 0.1), [1, 3, 2, 3, 4, 1][(row + i) % 6]]);
    comb(Math.PI / 2, 0.1, 0.16, 0.012);
    comb(-Math.PI / 2, 0.1, 0.16, 0.012, 0.5);
    comb(0, 0.05, 0.04, 0.006);
  } else {
    // waves
    stone(40, 0.04, 0.13, [0, 4, 2, 2, 1, 1.4]);
    sprinkle(20, [0, 4, 1, 3, 2, 5]);
    wave(Math.PI / 2, 0.06, 7, rr(0, 6));
    wave(0.4, 0.03, 13, rr(0, 6));
  }
  return { drops, opsA, opsB, pal };
}
