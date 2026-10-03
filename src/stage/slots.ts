// The slot registry (W-D013). Slots are [data-gl=print|object][data-gl-id] boxes the DOM lays out. Their rects are
// cached in document space and re-measured on ResizeObserver, fonts.ready, a swap, a width or DPR change; never
// per frame. GL borrows a slot with take() (adds .is-gl, which hides the poster image only) and hands it back with
// give(). Keyboard focus never borrows a slot.
import { invalidate } from './ticker.ts';
import { stats } from './state.ts';

export type SlotKind = 'print' | 'object';
export interface Slot {
  el: HTMLElement;
  id: string;
  kind: SlotKind;
  fixture: string;
  /** Document-space centre and layout size (rotation-invariant), CSS px. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Within one viewport of the screen (lead time for GL during a fast fling). */
  near: boolean;
}

const slots = new Map<string, Slot>();
const scanListeners = new Set<(s: Slot[]) => void>();
const unscanListeners = new Set<(s: Slot[]) => void>();

function measureOne(s: Slot, sx: number, sy: number): void {
  const r = s.el.getBoundingClientRect();
  s.cx = r.left + r.width / 2 + sx;
  s.cy = r.top + r.height / 2 + sy;
  s.w = s.el.offsetWidth;
  s.h = s.el.offsetHeight;
}

/** Re-measure every slot together with the scroll position, so all rects share one document space. */
export function measureAll(): void {
  const sx = window.scrollX;
  const sy = window.scrollY;
  for (const s of slots.values()) measureOne(s, sx, sy);
  stats.measures++;
}

// ResizeObserver callbacks run after layout and before paint, so GL and DOM change in the same frame.
const ro = new ResizeObserver(() => {
  measureAll();
  invalidate();
});
ro.observe(document.body);

const near = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const s = slots.get((e.target as HTMLElement).dataset.glId || '');
      if (s) s.near = e.isIntersecting;
    }
    invalidate();
  },
  { rootMargin: '100% 0px' },
);

export function scan(root: ParentNode = document): Slot[] {
  const found: Slot[] = [];
  root.querySelectorAll<HTMLElement>('[data-gl][data-gl-id]').forEach((el) => {
    const kind = el.dataset.gl === 'object' ? 'object' : 'print';
    const id = el.dataset.glId as string;
    if (slots.has(id)) {
      console.warn(`[stage] duplicate data-gl-id "${id}"; the second slot is ignored`);
      return;
    }
    const s: Slot = { el, id, kind, fixture: el.dataset.glFixture || '', cx: 0, cy: 0, w: 0, h: 0, near: false };
    slots.set(id, s);
    ro.observe(el);
    near.observe(el);
    found.push(s);
  });
  measureAll();
  for (const fn of scanListeners) fn(found);
  invalidate();
  return found;
}

/** Before Swup replaces #swup: hand every slot back and forget it. */
export function unscan(): void {
  const gone = [...slots.values()];
  for (const fn of unscanListeners) fn(gone);
  for (const s of gone) {
    s.el.classList.remove('is-gl');
    ro.unobserve(s.el);
    near.unobserve(s.el);
  }
  slots.clear();
}

export function onScan(fn: (s: Slot[]) => void): () => void {
  scanListeners.add(fn);
  return () => scanListeners.delete(fn);
}
export function onUnscan(fn: (s: Slot[]) => void): () => void {
  unscanListeners.add(fn);
  return () => unscanListeners.delete(fn);
}

export function getSlot(id: string): Slot | undefined {
  return slots.get(id);
}
export function allSlots(): Slot[] {
  return [...slots.values()];
}

/** GL takes the slot's pixels: the poster image goes to opacity 0 (CSS), nothing else changes. */
export function take(id: string): void {
  slots.get(id)?.el.classList.add('is-gl');
}
/** GL hands the pixels back to the identical baked still. */
export function give(id: string): void {
  slots.get(id)?.el.classList.remove('is-gl');
}
/** Context loss: every slot drops .is-gl synchronously, so the page is whole within the same frame. */
export function giveAll(): void {
  for (const s of slots.values()) s.el.classList.remove('is-gl');
  document.querySelectorAll('.is-gl').forEach((el) => el.classList.remove('is-gl'));
}

/** Viewport-space rect of a slot, from the cache (no layout read). */
export function slotRect(id: string): { x: number; y: number; w: number; h: number } | null {
  const s = slots.get(id);
  if (!s) return null;
  return { x: s.cx - s.w / 2 - window.scrollX, y: s.cy - s.h / 2 - window.scrollY, w: s.w, h: s.h };
}
