// Print 1's DOM still while its project is a placeholder (W-D022): a darkroom test strip, never fake art. The card is
// the instant print (54 x 86, picture window 46 x 62 at 4, 5; W-D006), with the frame code in the bottom margin and
// the [ ] mark on the border. Built at build time as an SVG data URI for an <img>, so it paints at first paint, is an
// LCP candidate on touch (budgets.md: the h1 or print 1's still), and GL can decode the very same pixels as its texture.
// Six exposure steps of the project's tint, seeded by slug so each placeholder print differs, all plainly a test.
// W-S2 owns the site-wide test-strip spec (src/lib/teststrip); the hero switches to it once it lands.

/** The print card in SVG user units and its picture window (shared with the develop shader's window uniform). */
export const CARD = { w: 54, h: 86, win: { x: 4, y: 5, w: 46, h: 62 } } as const;

const PAPER = '#F6F5F1';
const INK = '#13171A';
const AMBER = '#E39B2B';

/** FNV-1a 32-bit, for a stable seed per slug. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export interface StillInput {
  slug: string;
  tint: string;
  frame: string;
}

/** The SVG markup of a placeholder print (a test strip in the project's tint). */
export function testStripSvg(p: StillInput): string {
  const seed = fnv1a(p.slug);
  const { x, y, w, h } = CARD.win;
  const steps = 6;
  // The exposure sequence starts at a seeded stop and doubles (2, 4, 8 ... seconds), as a printer's test strip does.
  const first = 1 + (seed % 3);
  const paperRgb = hexToRgb('#E9E4D8');
  const tintRgb = hexToRgb(p.tint);
  const deep = tintRgb.map((v) => Math.round(v * 0.32)) as [number, number, number];
  const bandW = w / steps;
  const bands: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / steps;
    const fill = t < 0.62 ? mix(paperRgb, tintRgb, t / 0.62) : mix(tintRgb, deep, (t - 0.62) / 0.38);
    bands.push(`<rect x="${(x + i * bandW).toFixed(3)}" y="${y}" width="${(bandW + 0.05).toFixed(3)}" height="${h}" fill="${fill}"/>`);
  }
  // A thin seeded diagonal sweep across the strip (the edge of the card the printer held back), so prints differ.
  const tilt = ((seed >>> 8) % 9) - 4;
  const labels: string[] = [];
  for (let i = 0; i < steps; i++) {
    const secs = 2 ** (first + i);
    const light = i >= 3;
    labels.push(`<text x="${(x + i * bandW + bandW / 2).toFixed(3)}" y="${y + h - 2.2}" font-size="2.5" text-anchor="middle" fill="${light ? PAPER : INK}" fill-opacity="0.82">${secs}s</text>`);
  }
  const cx = x + w / 2;
  const cy = y + h * 0.42;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD.w} ${CARD.h}" width="${CARD.w * 10}" height="${CARD.h * 10}" font-family="ui-monospace,Consolas,Menlo,monospace">`,
    `<rect width="${CARD.w}" height="${CARD.h}" fill="${PAPER}"/>`,
    ...bands,
    `<g stroke="${PAPER}" stroke-opacity="0.5" stroke-width="0.35" fill="none"><circle cx="${cx}" cy="${cy}" r="${(w * 0.28).toFixed(2)}"/><path d="M${x} ${(cy + tilt).toFixed(2)}H${x + w}"/></g>`,
    ...labels,
    `<text x="${x}" y="${CARD.h - 7.5}" font-size="4" fill="${INK}" letter-spacing="0.2">${p.frame}</text>`,
    `<text x="${x}" y="${CARD.h - 3.6}" font-size="2.3" fill="${INK}" fill-opacity="0.7" letter-spacing="0.15">TEST STRIP · PLACEHOLDER</text>`,
    `<g fill="${AMBER}"><path d="M${CARD.w - 9.6} ${CARD.h - 11}h2.2v0.8h-1.4v5.2h1.4v0.8h-2.2z"/><path d="M${CARD.w - 4} ${CARD.h - 11}h-2.2v0.8h1.4v5.2h-1.4v0.8h2.2z"/></g>`,
    '</svg>',
  ].join('');
}

/** A data URI for the still (UTF-8, minimally escaped). */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/%22/g, "'")}`;
}
