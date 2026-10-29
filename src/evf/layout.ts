// One layout function: the frame rect for each EVF mode, written to CSS variables so the HUD hangs off the frame.
import type { Rect } from './gl/engine';

export type Mode = 'work' | 'play' | 'info' | 'open';

export const isPhone = () => window.innerWidth < 760;

export function topHeight() { return isPhone() ? 100 : 64; }

export function frameRect(mode: Mode): Rect {
  const W = window.innerWidth, H = window.innerHeight;
  if (mode === 'open') return { x: 0, y: 0, w: W, h: H };
  if (!isPhone()) {
    const top = 64, bot = H < 760 ? 118 : 136, side = 150;
    const availH = H - top - bot, availW = W - side * 2;
    if (mode === 'play') {
      const fh = Math.min(availH * 0.94, (W * 0.58) / 1.5);
      return { x: Math.max(28, Math.round(W * 0.05)), y: Math.round(top + (availH - fh) / 2), w: Math.round(fh * 1.5), h: Math.round(fh) };
    }
    const fh = Math.min(availH, availW / 1.5);
    const fw = fh * 1.5;
    return { x: Math.round((W - fw) / 2), y: Math.round(top + (availH - fh) / 2), w: Math.round(fw), h: Math.round(fh) };
  }
  const top = topHeight(), g = 16;
  if (mode === 'play') {
    const fw = W - g * 2;
    const fh = Math.min(fw * 1.0, H * 0.42);
    return { x: g, y: top, w: fw, h: Math.round(fh) };
  }
  const availH = H - top - 250;
  let fw = W - g * 2, fh = fw * 1.25;
  if (fh > availH) { fh = availH; fw = fh / 1.25; }
  return { x: Math.round((W - fw) / 2), y: top, w: Math.round(fw), h: Math.round(fh) };
}

export function writeRect(r: Rect) {
  const s = document.documentElement.style;
  s.setProperty('--fx', `${r.x}px`);
  s.setProperty('--fy', `${r.y}px`);
  s.setProperty('--fw', `${r.w}px`);
  s.setProperty('--fh', `${r.h}px`);
  s.setProperty('--top', `${topHeight()}px`);
}

/** Fits the name to the gutter width (the precise move: the name is exactly as wide as the frame marks allow). */
export function fitName(name: HTMLElement) {
  const W = window.innerWidth;
  const g = isPhone() ? 16 : 28;
  const words = [...name.querySelectorAll<HTMLElement>('.name__w')];
  const s = document.documentElement.style;
  s.setProperty('--name-size', '100px');
  const rects = words.map((w) => w.getBoundingClientRect());
  const widths = isPhone() ? rects.map((r) => r.width) : [rects[rects.length - 1].right - rects[0].left];
  const avail = W - g * 2;
  const k = avail / Math.max(...widths, 1);
  const cap = isPhone() ? window.innerHeight * 0.17 : window.innerHeight * 0.3;
  s.setProperty('--name-size', `${Math.min(cap, 100 * k * 0.995).toFixed(2)}px`);
}
