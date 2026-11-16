// The open view's own behaviour on / (W-V1 A2, A9), in the lazy chunk (project/enhance.ts): it is only ever needed once
// a page has been adopted, which waits for this chunk. Wired once, by project/inapp.ts.
import { gsap } from '../motion';
import type { Engine } from '../gl/engine';

export function wireView(proj: HTMLElement, col: HTMLElement, isOpen: () => boolean, engine: () => Engine | null) {
  // -4 EV as the roll comes up (the frame recedes behind the prints); drawn again as the scroll settles, because after a
  // jump scroll WebKit can spend the first 120 ms on one stale frame (the frame stayed at full exposure behind the roll)
  let again: gsap.core.Tween | null = null;
  col.addEventListener('scroll', () => {
    const e = engine();
    if (!e || !isOpen()) return;
    const d = Math.pow(2, -4 * Math.min(1, Math.max(0, col.scrollTop / (col.clientHeight * 0.85))));
    if (Math.abs(d - e.st.dim) < 0.002) return;
    e.st.dim = d;
    e.invalidate(120);
    again?.kill();
    again = gsap.delayedCall(0.25, () => e.invalidate(120));
  }, { passive: true });

  // the dialog keeps Tab inside it, in document order, links included: WebKit's own Tab skips links (Safari's default),
  // which left the column with no keyboard route. From the title (focused at the landing; not a stop) Tab goes on into
  // the article and Shift+Tab back to Back.
  proj.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !isOpen()) return;
    const f = [...proj.querySelectorAll<HTMLElement>('button, a[href]')].filter((x) => !x.hasAttribute('disabled') && x.offsetParent !== null);
    const n = f.length;
    if (!n) return;
    e.preventDefault();
    const a = document.activeElement as HTMLElement;
    let k = f.indexOf(a);
    if (k < 0) {
      // the first stop after the focused element (or the end), stepped back one for Shift+Tab
      k = f.findIndex((x) => a.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (k < 0) k = n;
      k -= e.shiftKey ? 0 : 1;
    }
    f[(k + (e.shiftKey ? -1 : 1) + n) % n].focus();
  });
}
