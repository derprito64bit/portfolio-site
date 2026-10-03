// The live motion axis (W-D017): 'full' or 'reduced', separate from the render tier. Read live from the OS setting
// and the site's Motion switch (localStorage 'ion.motion', which the Manor also reads). A stored choice wins; the
// OS setting applies when nothing is stored. Subscribers end timelines, snap springs and drop Lenis at once.
import { MOTION_KEY } from '../lib/tokens.js';

export type Motion = 'full' | 'reduced';
const html = document.documentElement;
const media = matchMedia('(prefers-reduced-motion: reduce)');
const listeners = new Set<(m: Motion) => void>();

function stored(): string | null {
  try {
    return localStorage.getItem(MOTION_KEY);
  } catch {
    return null;
  }
}
function compute(): Motion {
  const s = stored();
  if (s === 'reduced' || s === 'full') return s;
  return media.matches ? 'reduced' : 'full';
}

let current: Motion = compute();
html.dataset.motion = current;

function apply(): void {
  const next = compute();
  if (next === current) return;
  current = next;
  html.dataset.motion = next;
  for (const fn of listeners) fn(next);
}
media.addEventListener('change', apply);
addEventListener('storage', (e) => {
  if (e.key === MOTION_KEY) apply();
});

export function getMotion(): Motion {
  return current;
}
export function isReduced(): boolean {
  return current === 'reduced';
}
/** The Motion switch (W-C9) calls this. null clears the stored choice, so the OS setting applies again. */
export function setMotion(value: Motion | null): void {
  try {
    if (value) localStorage.setItem(MOTION_KEY, value);
    else localStorage.removeItem(MOTION_KEY);
  } catch {
    /* private mode: the change still applies for this page */
  }
  apply();
}
export function onMotion(fn: (m: Motion) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
