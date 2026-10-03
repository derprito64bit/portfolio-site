// The one scroll source (W-D002): window.scrollY, read once per frame by the ticker after Lenis has stepped.
// Also the one anchor scroller (W-D015): Lenis when it is on, else a native jump. Nothing else scrolls the page.

interface LenisLike {
  scrollTo(target: number | HTMLElement, opts?: { offset?: number; immediate?: boolean; force?: boolean; lock?: boolean }): void;
  resize(): void;
  stop(): void;
  start(): void;
  readonly isScrolling: boolean | string;
}

let y = window.scrollY;
let dir: 1 | -1 = 1;
let moved = false;
let lenis: LenisLike | null = null;

/** The ticker calls this once per frame. Everyone else reads scrollState. */
export function readScroll(): number {
  const next = window.scrollY;
  moved = next !== y;
  if (moved) dir = next > y ? 1 : -1;
  y = next;
  return y;
}
export const scrollState = {
  get y(): number {
    return y;
  },
  get dir(): 1 | -1 {
    return dir;
  },
  get moved(): boolean {
    return moved;
  },
};

export function setLenis(l: LenisLike | null): void {
  lenis = l;
}
export function getLenis(): LenisLike | null {
  return lenis;
}

/** Restore or reset a scroll position instantly (history entries, scroll:top). */
export function scrollToY(top: number): void {
  if (lenis) lenis.scrollTo(top, { immediate: true, force: true });
  else window.scrollTo({ top, left: 0, behavior: 'instant' });
}

/** The anchor scroller. One motion, one direction: Lenis glides when it is on, otherwise the page jumps. */
export function scrollToElement(el: HTMLElement): void {
  const margin = parseFloat(getComputedStyle(el).scrollMarginBlockStart) || 0;
  const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - margin);
  if (lenis) lenis.scrollTo(top, { force: true });
  else window.scrollTo({ top, left: 0, behavior: 'instant' });
}
