// A project's film prints (D-042, D-044, D-045): each media entry with its files and its size, laid out at build. Pure:
// the manifests come in as arguments, so the unit tests can show that the file wins over a typed size.
//   - a real entry takes its size and ladder from src/lib/content/media.json (a video from its poster);
//   - a placeholder entry takes its declared size (3:2 when absent) and the test chart's ladder when the fixtures were
//     rendered (scripts/build/media-fixtures.mjs), else it is a typed placeholder box at that size;
//   - only the first 3 prints carry an inline LQIP (W-V1 spec A8).
import type { DerivedImage, DerivedVideo, Media, PrintView } from './types.ts';
import { FIXTURE_DIR, ladder, pad2 } from '../prints/ladder.ts';
import { pack, sizeOf, sizesAttr } from '../prints/size.ts';

export interface MediaManifest { media: Record<string, DerivedImage | DerivedVideo> }
export interface FixtureManifest { entries: Record<string, { w: number; h: number; lqip: string }> }

/** How many prints carry an inline LQIP. */
export const LQIP_PRINTS = 3;

export function printsOf(slug: string, media: Media[], manifest: MediaManifest, fixtures: FixtureManifest | null): PrintView[] {
  const items = media.map((m, k) => {
    const n = k + 1;
    const real = m.placeholder ? null : (manifest.media[m.type === 'image' ? m.src : m.poster] as DerivedImage | undefined) ?? null;
    const vid = !m.placeholder && m.type === 'video' ? (manifest.media[m.src] as DerivedVideo | undefined) ?? null : null;
    const fx = m.placeholder ? fixtures?.entries[`${slug}/${pad2(n)}`] ?? null : null;
    // the file wins over the declared size (D-042)
    const { w, h } = real ? { w: real.w, h: real.h } : sizeOf(m);
    const files = real ? real.files : fx ? ladder(FIXTURE_DIR(slug), pad2(n), w, h, { first: n === 1, poster: m.type === 'video' }) : null;
    return { m, n, w, h, files, lqip: real?.lqip ?? fx?.lqip ?? '', video: vid?.file ?? '' };
  });
  const packed = pack(items.map((x) => ({ w: x.w, h: x.h, scale: x.m.scale })));
  return items.map((x, k) => ({
    n: x.n,
    index: pad2(x.n),
    id: `print-${pad2(x.n)}`,
    type: x.m.type,
    alt: x.m.alt,
    caption: x.m.caption,
    decorative: x.m.decorative,
    loop: x.m.type === 'video' && x.m.loop,
    audio: x.m.audio,
    captions: x.m.captions,
    placeholder: x.m.placeholder,
    w: x.w,
    h: x.h,
    files: x.files,
    lqip: k < LQIP_PRINTS ? x.lqip : '',
    video: x.video,
    size: packed[k],
    sizes: sizesAttr(packed[k]),
  }));
}
