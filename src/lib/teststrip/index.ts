// Seeded darkroom test strips for placeholder prints (W-D022; D-023: a print shows its strip only when cover is '').
// Owner: W-S2, then W-C4. One spec, two renderers: stripSvgBody() at build time (the DOM still) and drawStrip() in
// Canvas2D (the GL develop's texture), so GL hands back to the pixels it borrowed. The seed is FNV-1a of the slug
// through fmix32, driving mulberry32, so a slug always gives the same strip, byte for byte.
// The card is the instant print (54 x 86, picture window 46 x 62 at 4, 5; W-D006) as the hero's print 1 draws it
// (src/sections/hero/still.ts): exposure steps of the project's tint that double in seconds, the held-back circle and
// horizon of a printer's test, the frame code and 'TEST STRIP' in the bottom margin and the [ ] mark in amber. Nothing
// on it claims anything about the project: it is plainly a test.

export const CARD = { w: 54, h: 86, win: { x: 4, y: 5, w: 46, h: 62 } } as const;
const PAPER = '#F6F5F1';
const INK = '#13171A';
const AMBER = '#E39B2B';
/** The strip's face: the system mono, as the hero's still sets it. GL rasterizes the strip as an SVG image, which
 *  cannot reach the page's web fonts, so the DOM's inline strip uses the same system face and both paint alike. */
export const STRIP_FONT = 'ui-monospace,Consolas,Menlo,monospace';

/** FNV-1a 32-bit, then fmix32 (MurmurHash3's finaliser), so near slugs land far apart. */
export function seedOf(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 0x01000193);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
/** mulberry32: one stream per strip. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shape in card units: a filled rect, a stroked circle or line, a filled polygon or a line of text. */
export type Shape =
  | { k: 'r'; x: number; y: number; w: number; h: number; f: string }
  | { k: 'c'; x: number; y: number; r: number; s: string; o: number; lw: number }
  | { k: 'l'; x: number; y: number; x2: number; y2: number; s: string; o: number; lw: number }
  | { k: 'p'; pts: number[]; f: string }
  | { k: 't'; x: number; y: number; t: string; size: number; f: string; o: number; mid: boolean };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const hex = (s: string) => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
/** One bracket of the [ ] mark at x, facing in (dir 1) or out (dir -1). */
const bracket = (x: number, y: number, d: number) => [x, y, x + 2.2 * d, y, x + 2.2 * d, y + 0.8, x + 0.8 * d, y + 0.8, x + 0.8 * d, y + 6, x + 2.2 * d, y + 6, x + 2.2 * d, y + 6.8, x, y + 6.8].map(r3);

/** The strip's spec: every shape in paint order, from the slug, the tint and the frame code. */
export function stripShapes(slug: string, tint: string, frame: string): Shape[] {
  const rand = rng(seedOf(slug));
  const { x, y, w, h } = CARD.win;
  const steps = 5 + Math.floor(rand() * 3);
  const first = 1 + Math.floor(rand() * 3);
  const flip = rand() < 0.5;
  const base = hex('#E9E4D8');
  const tc = hex(/^#[0-9a-f]{6}$/i.test(tint) ? tint : '#7A1F2B');
  const deep = tc.map((v) => v * 0.32);
  const bw = w / steps;
  const out: Shape[] = [{ k: 'r', x: 0, y: 0, w: CARD.w, h: CARD.h, f: PAPER }];
  for (let i = 0; i < steps; i++) {
    const j = flip ? steps - 1 - i : i;
    const t = (j + 1) / steps;
    // Neighbouring bands overlap by 0.05, so neither renderer leaves a seam between them.
    out.push({ k: 'r', x: r3(x + i * bw), y, w: r3(bw + (i < steps - 1 ? 0.05 : 0)), h, f: t < 0.62 ? mix(base, tc, t / 0.62) : mix(tc, deep, (t - 0.62) / 0.38) });
  }
  const cy = r3(y + h * (0.3 + rand() * 0.24));
  out.push({ k: 'c', x: r3(x + w * (0.34 + rand() * 0.32)), y: cy, r: r3(w * (0.2 + rand() * 0.12)), s: PAPER, o: 0.5, lw: 0.35 });
  const tilt = r3(rand() * 8 - 4);
  out.push({ k: 'l', x, y: r3(cy + 9 + tilt), x2: x + w, y2: r3(cy + 9 - tilt), s: PAPER, o: 0.5, lw: 0.35 });
  for (let i = 0; i < steps; i++) {
    const j = flip ? steps - 1 - i : i;
    out.push({ k: 't', x: r3(x + i * bw + bw / 2), y: y + h - 2.2, t: `${2 ** (first + j)}s`, size: 2.5, f: (j + 1) / steps > 0.5 ? PAPER : INK, o: 0.82, mid: true });
  }
  out.push({ k: 't', x, y: CARD.h - 7.5, t: frame, size: 4, f: INK, o: 1, mid: false });
  out.push({ k: 't', x, y: CARD.h - 3.6, t: 'TEST STRIP', size: 2.3, f: INK, o: 0.7, mid: false });
  out.push({ k: 'p', f: AMBER, pts: bracket(CARD.w - 9.6, CARD.h - 11, 1) });
  out.push({ k: 'p', f: AMBER, pts: bracket(CARD.w - 4, CARD.h - 11, -1) });
  return out;
}

/** The strip as SVG children (no <svg> wrapper), for a <symbol> or a standalone still. */
export function stripSvgBody(slug: string, tint: string, frame: string): string {
  return stripShapes(slug, tint, frame)
    .map((s) => {
      if (s.k === 'r') return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.f}"/>`;
      if (s.k === 'c') return `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="none" stroke="${s.s}" stroke-opacity="${s.o}" stroke-width="${s.lw}"/>`;
      if (s.k === 'l') return `<path d="M${s.x} ${s.y}L${s.x2} ${s.y2}" stroke="${s.s}" stroke-opacity="${s.o}" stroke-width="${s.lw}"/>`;
      if (s.k === 'p') return `<path d="M${s.pts.join(' ')}Z" fill="${s.f}"/>`;
      return `<text x="${s.x}" y="${s.y}" font-size="${s.size}" fill="${s.f}"${s.o < 1 ? ` fill-opacity="${s.o}"` : ''}${s.mid ? ' text-anchor="middle"' : ''}>${s.t}</text>`;
    })
    .join('');
}

/** A standalone still: the same body in its own <svg> (tests; the OG image later). */
export function stripSvg(slug: string, tint: string, frame: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD.w} ${CARD.h}" font-family='${STRIP_FONT}' font-weight="500">${stripSvgBody(slug, tint, frame)}</svg>`;
}

/** The Canvas2D renderer: the same shapes on a w x h canvas (device pixels), painted as the SVG paints them. */
export function drawStrip(ctx: CanvasRenderingContext2D, shapes: Shape[], w: number, h: number): void {
  ctx.save();
  ctx.scale(w / CARD.w, h / CARD.h);
  for (const s of shapes) {
    ctx.globalAlpha = 'o' in s ? s.o : 1;
    ctx.beginPath();
    if (s.k === 'r') {
      ctx.fillStyle = s.f;
      ctx.fillRect(s.x, s.y, s.w, s.h);
    } else if (s.k === 'p') {
      for (let i = 0; i < s.pts.length; i += 2) ctx.lineTo(s.pts[i], s.pts[i + 1]);
      ctx.fillStyle = s.f;
      ctx.fill();
    } else if (s.k === 't') {
      ctx.fillStyle = s.f;
      ctx.font = `500 ${s.size}px ${STRIP_FONT}`;
      ctx.textAlign = s.mid ? 'center' : 'left';
      ctx.fillText(s.t, s.x, s.y);
    } else {
      if (s.k === 'c') ctx.arc(s.x, s.y, s.r, 0, 7);
      else {
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x2, s.y2);
      }
      ctx.strokeStyle = s.s;
      ctx.lineWidth = s.lw;
      ctx.stroke();
    }
  }
  ctx.restore();
}
