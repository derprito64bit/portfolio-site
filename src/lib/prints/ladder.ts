// The image ladder (D-056, budgets-v2 "Media"): AVIF and WebP at 480, 800, 1280 and 1920 px wide, never upscaled. One
// module for scripts/build/images.mjs (the owner's media), scripts/build/media-fixtures.mjs (the test charts) and the
// pages, so the files and the srcset always agree. Each file name carries its media-caps class
// (scripts/check/media-caps.mjs): small for the 480 rung, mid for 800, large above; first for the first print of a project
// above 480; extreme for a panorama (wider than 2.4:1) or a tall image (taller than 1:2) above 480; poster for a video's
// poster.

export const RUNGS = [480, 800, 1280, 1920] as const;
export const FORMATS = ['avif', 'webp'] as const;
export type Format = (typeof FORMATS)[number];
export type CapClass = 'small' | 'mid' | 'large' | 'first' | 'extreme' | 'poster';

/** The ladder for a source width: every rung it reaches; an image narrower than 480 keeps its own width. */
export function rungsFor(w: number): number[] {
  const r: number[] = RUNGS.filter((x) => x <= w);
  return r.length ? r : [Math.max(1, Math.round(w))];
}

/** A rung's height at the source aspect. */
export const heightAt = (rung: number, w: number, h: number) => Math.max(1, Math.round((rung * h) / w));

export function isExtreme(w: number, h: number) {
  const r = w / h;
  return r > 2.4 || r < 0.5;
}

export interface ClassContext {
  /** The first print of its project (budgets-v2: up to 1600 px, 150 kB). */
  first?: boolean;
  /** A video poster (40 kB). */
  poster?: boolean;
}

/** The media-caps class of one file. */
export function capClass(rung: number, w: number, h: number, ctx: ClassContext = {}): CapClass {
  if (ctx.poster) return 'poster';
  if (rung <= 480) return 'small';
  if (isExtreme(w, h)) return 'extreme';
  if (ctx.first) return 'first';
  return rung <= 800 ? 'mid' : 'large';
}

/** The file name of one rung: <stem>-<class>-<rung>.<format>. */
export const fileName = (stem: string, cls: CapClass, rung: number, fmt: Format) => `${stem}-${cls}-${rung}.${fmt}`;

export interface LadderFile {
  rung: number;
  h: number;
  cls: CapClass;
  avif: string;
  webp: string;
}

/** Every file of a ladder under `dir` (a site path ending in '/'). */
export function ladder(dir: string, stem: string, w: number, h: number, ctx: ClassContext = {}): LadderFile[] {
  return rungsFor(w).map((rung) => {
    const cls = capClass(rung, w, h, ctx);
    return { rung, h: heightAt(rung, w, h), cls, avif: `${dir}${fileName(stem, cls, rung, 'avif')}`, webp: `${dir}${fileName(stem, cls, rung, 'webp')}` };
  });
}

/** srcset for one format. */
export const srcset = (files: LadderFile[], fmt: Format) => files.map((f) => `${f[fmt]} ${f.rung}w`).join(', ');

/** The fallback src: the 800 rung (or the widest below it). */
export function fallback(files: LadderFile[], fmt: Format = 'webp') {
  const below = files.filter((f) => f.rung <= 800);
  return (below.length ? below[below.length - 1] : files[0])[fmt];
}

/** The widest rung (playback). */
export const widest = (files: LadderFile[], fmt: Format = 'webp') => files[files.length - 1][fmt];

/** The LQIP cap in bytes (budgets-v2: 300 B at most). */
export const LQIP_MAX = 300;

/** The fixture directory (test charts, D-045): built into dist only, never committed. */
export const FIXTURE_DIR = (slug: string) => `/media/fixtures/${slug}/`;
/** The owner's media directory (derived files, committed by the content PR, D-056). */
export const MEDIA_DIR = (slug: string) => `/media/${slug}/`;
export const pad2 = (n: number) => String(n).padStart(2, '0');
