// The open project in the Viewfinder (D-041, W-V1 A2; moved out of main.ts). From a frame, Open runs the zoom (23 to 56
// mm, 1.1 s) while the project page is fetched and adopted into #proj's column; it pushes /work/<slug>/ and the page's
// title. Close (Esc, the Back button, browser Back) zooms out in 0.6 s to the same frame and returns focus to the opener;
// in-app it is history.back(). Previous and next swap the article in place (0.4 s crossfade, replaceState) with the frame
// behind pulled to its neighbour. A popstate onto a /work/ URL that is not open moves the frame there without animation,
// then opens; one that only drops #print-NN closes playback. The prefetch starts once a frame has been current 300 ms.
import { gsap, D, E } from '../motion';
import type { Engine } from '../gl/engine';
import type { Scene } from '../scenes';
import { projects } from '../data';
import { frameRect, writeRect, isPhone } from '../layout';
import { parse, projectUrl, homeUrl, workHash } from '../router';
import { adopt, loadArticle, prefetch, requestCount } from './article';
import { initRoll, type RollControl } from './roll';
import { initPlayback, type PlaybackControl } from './playback';
import { apertureOf, landedState, openZoom, subjectOf, zoomCentre, type Pt3 } from './framing';
import '../style/project.css';
import '../style/print.css';

export type St = 'loading' | 'intro' | 'raising' | 'evf' | 'opening' | 'open' | 'closing' | 'lowering';

/** What main.ts lends the open project: its state, its engine and its frame moves. */
export interface Host {
  calm: boolean;
  state(): St;
  setState(s: St): void;
  pos(): number;
  setPos(i: number): void;
  /** The number of work frames. */
  works: number;
  engine(): Engine | null;
  scenes: Scene[];
  setTl(t: gsap.core.Timeline | null): void;
  finishTl(): void;
  hudOn(stagger?: number): gsap.core.Timeline;
  reveal(): void;
  /** A focus pull to frame `to`; zoomed keeps the open view's framing. */
  pull(to: number, dir: number, zoomed: boolean): gsap.core.Timeline;
  updateReadouts(i: number, animate?: boolean): void;
  /** Back in the EVF at rest: the AF box on the subject, locked. */
  afHome(): void;
  /** What the zoom lands on: the object under the AF box, else the subject. */
  target(s: Scene): Pt3;
  /** Moves to frame i with no animation (from the intro too: the deep-link landing). */
  jump(i: number): void;
  /** Hand-held sway (D-053): off while a project is open. */
  setSway(on: boolean): void;
}

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
const FLS = [23, 27, 33, 35, 40, 50, 56];
const nearestFl = (v: number) => FLS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
/** The prefetch waits for a frame to be current this long (D-041). */
export const PREFETCH_MS = 300;

export function initProject(h: Host) {
  const proj = $('#proj');
  const col = $('[data-proj-col]');
  const evf = $('#evf');
  const afEl = $('[data-af]');
  const flEl = $('[data-fl]');
  const fl2 = $('[data-fl2]');
  const counter = $('[data-print-count]');
  const homeTitle = document.title;
  let roll: RollControl | null = null;
  let pb: PlaybackControl | null = null;
  /** True while the open view's history entry was pushed by the app (Close is then history.back()). */
  let pushed = false;
  /** The next popstate is our own history.back(). */
  let ownBack = false;
  let token = 0;
  let opener: HTMLElement | null = null;
  let prefetchTimer = 0;
  const slugAt = (i: number) => projects[i]?.slug ?? '';

  // ---------------------------------------------------------------- the roll, playback and the frame behind
  function enhance() {
    roll?.destroy();
    pb?.destroy();
    roll = initRoll({ root: col, scroller: col, calm: h.calm, counter });
    pb = initPlayback({ prints: roll?.prints ?? [], calm: h.calm, onHold: (on) => roll?.hold(on) });
    if (counter) counter.hidden = !(roll?.prints.length);
  }
  function unenhance() {
    roll?.destroy();
    pb?.destroy();
    roll = pb = null;
  }
  /** -4 EV as the roll comes up (the frame recedes behind the prints). */
  col.addEventListener('scroll', () => {
    const e = h.engine();
    if (!e || h.state() !== 'open') return;
    const d = Math.pow(2, -4 * Math.min(1, Math.max(0, col.scrollTop / (col.clientHeight * 0.85))));
    if (Math.abs(d - e.st.dim) < 0.002) return;
    e.st.dim = d;
    e.invalidate(120);
  }, { passive: true });

  // the article's own links: previous and next swap in place; anything else leaves normally
  col.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-step]');
    if (!a || h.state() !== 'open') return;
    e.preventDefault();
    step(Number(a.dataset.step) || 1);
  });
  // the dialog keeps Tab inside it
  proj.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = $$<HTMLElement>('button, a[href]', proj).filter((x) => !x.hasAttribute('disabled') && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /** Fetch, parse and adopt the page for frame i; resolves false if a newer open or close took over. */
  async function bring(i: number, my: number) {
    const doc = await loadArticle(slugAt(i));
    if (my !== token) return false;
    const { title } = adopt(doc, col);
    document.title = title;
    col.scrollTop = 0;
    return true;
  }
  const items = () => [...col.children, $('.proj__bar', proj)].filter(Boolean) as HTMLElement[];

  // ---------------------------------------------------------------- open
  function open({ fromPop = false, print = null as number | null } = {}) {
    if (h.state() !== 'evf' || h.pos() >= h.works) return;
    h.finishTl();
    const i = h.pos();
    const slug = slugAt(i);
    const my = ++token;
    h.setState('opening');
    h.setSway(false);
    const a = document.activeElement as HTMLElement | null;
    opener = a && a !== document.body && evf.contains(a) && !a.closest('[data-go]') ? a : null;
    if (!fromPop) {
      history.pushState({ vf: 'project', slug }, '', projectUrl(slug));
    }
    pushed = true;
    col.replaceChildren();
    proj.hidden = false;
    evf.inert = true;
    evf.classList.add('is-open');
    let landed = false;
    let ready = false;
    const fail = () => { if (my === token) location.assign(projectUrl(slug, print ?? undefined)); };
    bring(i, my).then((ok) => {
      if (!ok) return;
      ready = true;
      for (const e of items()) e.style.opacity = '0';
      if (landed) arrive();
    }, fail);
    const engine = h.engine();
    if (engine) engine.idleTarget = 0;
    const arrive = () => {
      // the detail arrives after the landing, 100 ms apart
      const it = items();
      if (h.calm || !engine) gsap.fromTo(it, { opacity: 0 }, { opacity: 1, duration: 0.4, clearProps: 'opacity' });
      else gsap.fromTo(it, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: D.land, ease: E.out, stagger: 0.1, clearProps: 'opacity,transform' });
    };
    const settle = () => {
      if (my !== token) return;
      landed = true;
      if (!ready) { fail(); return; } // not parsed by the landing: the page itself
      h.setState('open');
      enhance();
      arrive();
      ($('[data-close]', proj) as HTMLElement).focus({ preventScroll: true });
      if (print && pb) pb.open(print - 1, { flip: false, push: false });
    };
    const full = frameRect('open');
    if (!engine || h.calm) {
      writeRect(full);
      $$('.evf .pw.on').forEach((e) => e.classList.remove('on'));
      const t = gsap.timeline({ onComplete: () => { h.setTl(null); settle(); } });
      h.setTl(t);
      if (engine) {
        const st = engine.st;
        engine.holdPrevious();
        Object.assign(st, { rect: full, nd: 1, ndv: isPhone() ? 1 : 0, radius: 0, rim: 0, mix: 0 });
        t.to(st, { mix: 1, duration: 0.4, onUpdate: h.reveal });
      } else t.to({}, { duration: 0.4 });
      return;
    }
    const st = engine.st;
    const s = h.scenes[i];
    const zoom = openZoom(st.rect);
    const sub = h.target(s);
    const zc = zoomCentre(sub, zoom);
    gsap.to(st, { peak: 0, duration: D.snap, overwrite: 'auto', onUpdate: h.reveal });
    st.zcx = zc.x; st.zcy = zc.y;
    const fl = { v: 23 };
    const flUp = () => { const v = nearestFl(fl.v); flEl.textContent = String(v); fl2.textContent = `${v}mm`; };
    afEl.classList.add('is-off');
    const t = gsap.timeline({ onComplete: () => h.setTl(null) });
    h.setTl(t);
    t.call(settle, [], D.travel);
    t.call(() => { $$('.evf .pw.on').forEach((e) => { if (!e.matches('.ro--fl')) e.classList.remove('on'); }); }, [], 0.08);
    t.to(st.rect, { x: full.x, y: full.y, w: full.w, h: full.h, duration: D.travel, ease: E.lens, onUpdate: () => { writeRect(st.rect); h.reveal(); } }, 0);
    t.to(st, { zoom, dolly: 0.08, focus: sub.z, aperture: apertureOf(s.fnum) * 1.6, radius: 0, rim: 0, vig: 0.38, duration: D.travel, ease: E.lens }, 0);
    st.ndv = isPhone() ? 1 : 0;
    t.to(fl, { v: 56, duration: D.travel, ease: E.lens, onUpdate: flUp }, 0);
    t.to(st, { nd: isPhone() ? 0.9 : 1, duration: D.land, ease: E.out }, D.travel - 0.15);
    t.call(() => $('.ro--fl').classList.remove('on'), [], D.travel - 0.14);
  }

  // ---------------------------------------------------------------- close
  function close(how: 'input' | 'pop' = 'input') {
    if (h.state() === 'opening') {
      // Back mid-zoom: the open is abandoned (its page may still be loading) and the zoom lands, then leaves
      token++;
      h.finishTl();
      h.setState('open');
    }
    if (h.state() !== 'open') return;
    // playback goes with the project; its own entry (if pushed) is stepped over in the same traversal
    const extra = pb?.isOpen() ? pb.close({ fromPop: true, instant: true }) : false;
    if (how === 'input') {
      if (pushed) { ownBack = true; history.go(extra ? -2 : -1); }
      else history.replaceState(null, '', homeUrl(workHash(h.pos() + 1)));
    }
    pushed = false;
    token++;
    h.finishTl();
    h.setState('closing');
    const i = h.pos();
    const rect = frameRect('work');
    const it = items();
    const engine = h.engine();
    const done = () => {
      h.setTl(null);
      h.setState('evf');
      unenhance();
      proj.hidden = true;
      col.replaceChildren();
      gsap.set(it, { clearProps: 'opacity,transform' });
      document.title = homeTitle;
      evf.inert = false;
      evf.classList.remove('is-open');
      afEl.classList.remove('is-off');
      h.setSway(true);
      const back = opener && document.contains(opener) ? opener : $('[data-open]');
      back.focus({ preventScroll: true });
    };
    if (!engine || h.calm) {
      const t = gsap.timeline({ onComplete: done });
      h.setTl(t);
      t.to(it, { opacity: 0, duration: 0.2 });
      t.call(() => {
        writeRect(rect);
        if (engine) {
          const st = engine.st;
          engine.holdPrevious();
          Object.assign(st, { rect, nd: 0, radius: 5, rim: 1, mix: 0, dim: 1, zoom: 1, dolly: 0 });
          gsap.to(st, { mix: 1, duration: 0.3, onUpdate: h.reveal });
        }
      });
      t.add(h.hudOn());
      return;
    }
    const st = engine.st;
    const fl = { v: 56 };
    const k = 0.55; // exits run at about 0.55x
    const t = gsap.timeline({ onComplete: done });
    h.setTl(t);
    t.to(it, { opacity: 0, y: -8, duration: D.snap, ease: E.in });
    t.to(st, { nd: 0, dim: 1, duration: D.step * k * 2, ease: E.in }, 0);
    t.to(st.rect, { x: rect.x, y: rect.y, w: rect.w, h: rect.h, duration: D.travel * k, ease: E.lens, onUpdate: () => { writeRect(st.rect); h.reveal(); } }, 0.06);
    t.to(st, { zoom: 1, dolly: 0, aperture: apertureOf(h.scenes[i].fnum), radius: 5, rim: 1, vig: 0.28, duration: D.travel * k, ease: E.lens }, 0.06);
    t.to(fl, { v: 23, duration: D.travel * k, ease: E.lens, onUpdate: () => { flEl.textContent = String(nearestFl(fl.v)); } }, 0.06);
    t.add(h.hudOn(0.025), 0.3);
    t.call(h.afHome);
  }

  // ---------------------------------------------------------------- previous and next, in place
  function step(dir: number) {
    if (h.state() !== 'open') return;
    const from = h.pos();
    const to = (from + dir + h.works) % h.works;
    const slug = slugAt(to);
    const my = ++token;
    pb?.close({ fromPop: true, instant: true });
    const old = [...col.children] as HTMLElement[];
    const out = gsap.to(old, { opacity: 0, duration: 0.2, ease: 'none' });
    const engine = h.engine();
    h.finishTl();
    h.setPos(to);
    if (engine && !h.calm) h.setTl(h.pull(to, dir, true));
    else {
      h.updateReadouts(to, false);
      if (engine) {
        engine.holdPrevious();
        engine.setScene(h.scenes[to]);
        engine.st.mix = 0;
        engine.st.focus = h.scenes[to].focus;
        gsap.to(engine.st, { mix: 1, duration: 0.4, onUpdate: h.reveal });
      }
    }
    history.replaceState({ vf: 'project', slug }, '', projectUrl(slug));
    loadArticle(slug).then(async (doc) => {
      await out.then();
      if (my !== token) return;
      unenhance();
      const { title } = adopt(doc, col);
      document.title = title;
      col.scrollTop = 0;
      const now = [...col.children] as HTMLElement[];
      gsap.fromTo(now, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none', clearProps: 'opacity' });
      enhance();
      ($('#proj-title') as HTMLElement | null)?.focus({ preventScroll: true });
    }, () => { if (my === token) location.assign(projectUrl(slug)); });
  }

  // ---------------------------------------------------------------- keys, history and the prefetch
  /** Keys while a project is open (main.ts hands them over). */
  function onKey(e: KeyboardEvent) {
    if (pb?.isOpen()) return;
    const S = h.state();
    if (e.key === 'Escape' && (S === 'open' || S === 'opening')) { e.preventDefault(); close('input'); }
    else if (S === 'open' && e.key === 'ArrowRight' && !e.altKey) { e.preventDefault(); step(1); }
    else if (S === 'open' && e.key === 'ArrowLeft' && !e.altKey) { e.preventDefault(); step(-1); }
  }

  function onPop() {
    const r = parse();
    if (ownBack) { ownBack = false; if (r.kind === 'home') return; }
    const S = h.state();
    if (r.kind === 'project') {
      const i = projects.findIndex((p) => p.slug === r.slug);
      if (i < 0) { location.reload(); return; }
      if ((S === 'open' || S === 'opening') && i === h.pos()) { pb?.sync(location.hash); return; }
      if (S === 'open') { location.reload(); return; }
      if (S === 'evf' || S === 'intro') {
        h.jump(i);
        open({ fromPop: true, print: r.print });
      }
      return;
    }
    if (S === 'open' || S === 'opening') close('pop');
  }

  /** A frame became current: prefetch its page once it has stayed 300 ms. */
  function framed(i: number) {
    clearTimeout(prefetchTimer);
    if (i < 0 || i >= h.works) return;
    prefetchTimer = window.setTimeout(() => { if (h.pos() === i && (h.state() === 'evf' || h.state() === 'raising')) prefetch(slugAt(i)); }, PREFETCH_MS);
  }

  function onResize() {
    const e = h.engine();
    if (!e || h.state() !== 'open') return;
    const s = h.scenes[h.pos()];
    const z = landedState(s, subjectOf(s), e.st.zoom);
    e.st.rect = z.rect;
    e.st.zcx = z.zcx;
    e.st.zcy = z.zcy;
    roll?.recache();
  }

  return {
    open,
    close,
    step,
    onKey,
    onPop,
    framed,
    onResize,
    playback: () => pb,
    requests: requestCount,
  };
}

export type ProjectControl = ReturnType<typeof initProject>;
