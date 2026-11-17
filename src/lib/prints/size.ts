// The size rule for film prints (D-044, W-V1 spec A6, A7). One pure module, run at build by the project pages, so the
// layout needs no JS; Node imports it as-is (type stripping) for the unit tests and the image scripts.
//
//   aspect r = w / h picks a bucket: portrait r < 0.8, square 0.8 <= r <= 1.25, landscape 1.25 < r <= 1.7, wide r > 1.7
//   the bucket sets the slot on 12 columns: wide 12, landscape 7, square 5, portrait 4; under 0.5 MP: 4
//   the print fills f of its slot: f = 0.62 + 0.38 s, s = clamp(log2(w h / 500,000) / 4, 0, 1)
//   scale 'hero': f = 1 and the widest slot (landscape or wide: 12; portrait or square: 6, centred, alone in its row)
//   scale 'detail': f x 0.7
//   with 9 or more prints the first one (scale 'normal') is the hero
//   frames clamp to 9:21 .. 21:9; a more extreme image is letterboxed inside its frame, never cropped
//   pack(): rows in content order; a gap is filled only by the next print; every second print in a row drops half its
//   height (the zigzag); a lone print alternates sides; widthFrac = span / 12 x f of the roll's width
//   phone (under 760 px): one column; landscape and wide 100%, square 72%, portrait 56%, hero 100%, detail x 0.7;
//   prints alternate left and right
// Height caps (80 svh, phone 70 svh) are CSS: width = min(widthFrac x roll width, maxH x frame aspect).

export type Bucket = 'portrait' | 'square' | 'landscape' | 'wide';
export type Scale = 'hero' | 'normal' | 'detail';
export type Justify = 'start' | 'center' | 'end';

export const COLS = 12;
/** Frame aspect limits: 9:21 and 21:9. */
export const AR_MIN = 9 / 21;
export const AR_MAX = 21 / 9;
/** Under this many pixels a print takes the small slot (4). */
export const SMALL_PX = 500_000;
/** With this many prints or more, the first (normal) print is the hero. */
export const AUTO_HERO_AT = 9;
/** The size an entry without a declared size takes: 3:2 at the small-slot threshold (s = 0). */
export const ABSENT = { w: 1200, h: 800 } as const;
/** Height caps, in svh, applied in CSS. */
export const MAX_H_SVH = 80;
export const MAX_H_SVH_PHONE = 70;
/** The phone breakpoint, in CSS px (the roll is one column below it). */
export const PHONE_MAX = 759;

const SLOT: Record<Bucket, number> = { wide: 12, landscape: 7, square: 5, portrait: 4 };
const PHONE_W: Record<Bucket, number> = { wide: 1, landscape: 1, square: 0.72, portrait: 0.56 };

export interface PrintInput {
  w: number;
  h: number;
  scale?: Scale | '';
}

export interface PrintSize {
  bucket: Bucket;
  /** The source aspect w / h. */
  r: number;
  /** The frame aspect, clamped to 9:21 .. 21:9. */
  ar: number;
  /** True when the image is more extreme than the frame (letterboxed inside it). */
  letterbox: boolean;
  /** Source pixels, w x h (the declared size when w or h is missing: ABSENT). */
  px: number;
  hero: boolean;
  detail: boolean;
  /** Columns of 12. */
  span: number;
  /** The fraction of its slot the print fills. */
  f: number;
}

export interface PackedPrint extends PrintSize {
  /** Its fraction of the roll's width: span / 12 x f. */
  widthFrac: number;
  /** Row index, from 0. */
  row: number;
  /** First grid column, from 1. */
  col: number;
  /** Where the print sits in its slot. */
  justify: Justify;
  /** The zigzag: every second print in a row drops half its own height. */
  drop: boolean;
  /** Phone: the fraction of the roll's width. */
  phoneFrac: number;
  /** Phone: the side it sits on. */
  phoneSide: 'left' | 'right';
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function bucketOf(r: number): Bucket {
  if (r < 0.8) return 'portrait';
  if (r <= 1.25) return 'square';
  if (r <= 1.7) return 'landscape';
  return 'wide';
}

/** s in the size rule: 0 at 0.5 MP or less, 1 at 8 MP or more, log2 in between. */
export function sizeScore(px: number) {
  return clamp(Math.log2(px / SMALL_PX) / 4, 0, 1);
}

/** f before the hero and detail rules. */
export function fill(px: number) {
  return 0.62 + 0.38 * sizeScore(px);
}

/** The declared size, or ABSENT when either side is missing. */
export function sizeOf(p: PrintInput) {
  const ok = Number.isFinite(p.w) && Number.isFinite(p.h) && p.w > 0 && p.h > 0;
  return ok ? { w: p.w, h: p.h } : { w: ABSENT.w, h: ABSENT.h };
}

/** One print's class, slot and fill. `autoHero` makes a normal print the hero (the first of 9 or more). */
export function sizePrint(p: PrintInput, autoHero = false): PrintSize {
  const { w, h } = sizeOf(p);
  const r = w / h;
  const ar = clamp(r, AR_MIN, AR_MAX);
  const bucket = bucketOf(r);
  const px = w * h;
  const scale: Scale = p.scale === 'hero' || p.scale === 'detail' ? p.scale : 'normal';
  const hero = scale === 'hero' || (scale === 'normal' && autoHero);
  const detail = scale === 'detail';
  let span: number;
  let f: number;
  if (hero) {
    span = bucket === 'portrait' || bucket === 'square' ? 6 : COLS;
    f = 1;
  } else {
    span = px < SMALL_PX ? 4 : SLOT[bucket];
    f = fill(px) * (detail ? 0.7 : 1);
  }
  return { bucket, r, ar, letterbox: ar !== r, px, hero, detail, span, f };
}

/** Phone width as a fraction of the roll. */
export function phoneFrac(s: PrintSize) {
  return (s.hero ? 1 : PHONE_W[s.bucket]) * (s.detail ? 0.7 : 1);
}

/**
 * The roll layout: rows in content order on 12 columns. A row takes prints while they fit; the first that does not
 * fit starts the next row (a gap is filled only by the next print, never by a later one). A hero is alone in its row.
 */
export function pack(prints: PrintInput[]): PackedPrint[] {
  const autoHero = prints.length >= AUTO_HERO_AT;
  const sized = prints.map((p, i) => sizePrint(p, autoHero && i === 0));
  const rows: number[][] = [];
  let cur: number[] = [];
  let used = 0;
  sized.forEach((s, i) => {
    const alone = s.hero || s.span === COLS;
    if (cur.length && (alone || used + s.span > COLS)) {
      rows.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(i);
    used += s.span;
    if (alone) {
      rows.push(cur);
      cur = [];
      used = 0;
    }
  });
  if (cur.length) rows.push(cur);

  const out: PackedPrint[] = new Array(sized.length);
  let lone = 0;
  rows.forEach((idx, row) => {
    const spans = idx.map((i) => sized[i].span);
    const sum = spans.reduce((a, b) => a + b, 0);
    if (idx.length === 1) {
      const i = idx[0];
      const s = sized[i];
      let col = 1;
      let justify: Justify = 'start';
      if (s.span === COLS) {
        justify = 'center';
      } else if (s.hero) {
        col = (COLS - s.span) / 2 + 1;
        justify = 'center';
      } else {
        // lone prints alternate sides down the roll, so single prints still read as a zigzag
        if (lone % 2 === 1) {
          col = COLS - s.span + 1;
          justify = 'end';
        }
        lone++;
      }
      out[i] = place(s, row, col, justify, false, i);
      return;
    }
    // several prints: the first starts at column 1, the last ends at column 12, the spare columns go between them
    const spare = COLS - sum;
    const gaps = idx.length - 1;
    let col = 1;
    idx.forEach((i, k) => {
      const justify: Justify = k === 0 ? 'start' : k === idx.length - 1 ? 'end' : 'center';
      out[i] = place(sized[i], row, col, justify, k % 2 === 1, i);
      col += spans[k] + (k < gaps ? Math.floor(spare / gaps) + (k < spare % gaps ? 1 : 0) : 0);
    });
  });
  return out;
}

function place(s: PrintSize, row: number, col: number, justify: Justify, drop: boolean, i: number): PackedPrint {
  return {
    ...s,
    widthFrac: (s.span / COLS) * s.f,
    row,
    col,
    justify,
    drop,
    phoneFrac: phoneFrac(s),
    phoneSide: i % 2 === 0 ? 'left' : 'right',
  };
}

/** The CSS width of a print's frame, in px: min(widthFrac x roll width, maxH x frame aspect). */
export function frameWidth(p: Pick<PackedPrint, 'widthFrac' | 'ar' | 'phoneFrac'>, rollWidth: number, viewportH: number, phone: boolean) {
  return phone
    ? Math.min(p.phoneFrac * rollWidth, (MAX_H_SVH_PHONE / 100) * viewportH * p.ar)
    : Math.min(p.widthFrac * rollWidth, (MAX_H_SVH / 100) * viewportH * p.ar);
}

/** The roll's geometry in CSS: side gutters (desktop, phone) and its widest width. */
export const ROLL = { gutter: 28, gutterPhone: 16, max: 1680 } as const;

/**
 * The sizes attribute: the print's width at each breakpoint, from the roll width (calc only, which every engine reads in
 * sizes; the height cap is left out, so sizes never under-asks).
 */
export function sizesAttr(p: Pick<PackedPrint, 'widthFrac' | 'phoneFrac'>) {
  const phone = `calc((100vw - ${ROLL.gutterPhone * 2}px) * ${round(p.phoneFrac)})`;
  const wide = `${Math.ceil(p.widthFrac * ROLL.max)}px`;
  const desk = `calc((100vw - ${ROLL.gutter * 2}px) * ${round(p.widthFrac)})`;
  return `(max-width: ${PHONE_MAX}px) ${phone}, (min-width: ${ROLL.max + ROLL.gutter * 2}px) ${wide}, ${desk}`;
}

const round = (v: number) => Math.round(v * 1000) / 1000;
