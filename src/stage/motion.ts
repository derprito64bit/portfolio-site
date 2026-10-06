// The live motion axis (W-D017): 'full' or 'reduced', separate from the render tier. Read live from the OS setting
// and the site's Motion switch (localStorage 'ion.motion', which the Manor also reads). A stored choice wins; the
// OS setting applies when nothing is stored. Subscribers end timelines, snap springs and drop Lenis at once.
import { MOTION_KEY } from '../lib/tokens.js';
import { guard } from './state.ts';

export type Motion = 'full' | 'reduced';
const html = document.documentElement;
const media = matchMedia('(prefers-reduced-motion: reduce)');
const listeners = new Set<(m: Motion) => void>();

const parse = (v: string | null): Motion | null => (v === 'reduced' || v === 'full' ? v : null);
function stored(): Motion | null {
  try {
    return parse(localStorage.getItem(MOTION_KEY));
  } catch {
    return null;
  }
}
// The choice lives in memory; storage only carries it across pages and tabs. So the switch still works for this page
// where storage throws (blocked site data, some private modes).
let choice: Motion | null = stored();
function compute(): Motion {
  return choice ?? (media.matches ? 'reduced' : 'full');
}

let current: Motion = compute();
html.dataset.motion = current;

function apply(): void {
  const next = compute();
  if (next === current) return;
  current = next;
  html.dataset.motion = next;
  // Each listener on its own (guard): one that throws must not keep the others (finish the timelines, drop Lenis, snap
  // the springs) from running.
  for (const fn of listeners) guard(() => fn(next), undefined);
}
media.addEventListener('change', apply);
addEventListener('storage', (e) => {
  // Another tab changed the switch (key null: storage was cleared).
  if (e.key !== MOTION_KEY && e.key !== null) return;
  choice = e.key === null ? null : parse(e.newValue);
  apply();
});

export function getMotion(): Motion {
  return current;
}
export function isReduced(): boolean {
  return current === 'reduced';
}
/** The Motion switch (W-C9) calls this. null clears the stored choice, so the OS setting applies again. */
export function setMotion(value: Motion | null): void {
  choice = value;
  try {
    if (value) localStorage.setItem(MOTION_KEY, value);
    else localStorage.removeItem(MOTION_KEY);
  } catch {
    /* storage blocked: the in-memory choice still applies for this page */
  }
  apply();
}
export function onMotion(fn: (m: Motion) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
