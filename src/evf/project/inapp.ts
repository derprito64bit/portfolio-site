// The open project in the Viewfinder (D-041, W-V1 A2; moved out of main.ts). From a frame, Open runs the zoom (23 to 56
// mm, 1.1 s) while the project page is fetched and adopted into #proj's column; it pushes /work/<slug>/ and the page's
// title. Close (Esc, the Back button, browser Back) zooms out in 0.6 s to the same frame and returns focus to the opener;
// in-app it is history.back(). Previous and next swap the article in place (0.4 s crossfade, replaceState) with the frame
// behind pulled to its neighbour. A popstate onto a /work/ URL that is not open moves the frame there without animation,
// then opens; one that only drops #print-NN closes playback. The prefetch starts once a frame has been current 300 ms.
import { gsap, D, E } from '../motion';
import type { Engine, Rect } from '../gl/engine';
import type { Scene } from '../scenes';
import { projects } from '../data';
import { frameRect, writeRect, isPhone } from '../layout';
import { parse, projectUrl, homeUrl, workHash } from '../router';
import type { RollControl } from './roll';
import type { PlaybackControl } from './playback';
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
  /** With no WebGL, the frame's CSS tint cover shows frame i (previous and next move it behind the open view). */
  cover(i: number): void;
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
  col.tabIndex = -1;
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

  // ---------------------------------------------------------------- the frame's box never moves (A7: CLS)
  // The zoom moves no layout: the frame's box (and the HUD hung off it) stays the work frame's from Open to Close. The
  // GL draws the travel from the engine's rect and the corner marks follow it by transform, so no frame of the open or
  // the close is a layout shift, input or not (browser Back). With no WebGL the box is the cover (coverFill).
  const frameEl = $('[data-frame]');
  const marks = () => $$('.mk', frameEl);
  /** The frame's box, as layout.ts last wrote it. */
  const boxRect = (): Rect => {
    const s = document.documentElement.style, v = (k: string) => parseFloat(s.getPropertyValue(k)) || 0;
    return { x: v('--fx'), y: v('--fy'), w: v('--fw'), h: v('--fh') };
  };
  /** The marks at rect r's corners, over the box b, by translation alone. */
  function marksAt(r: Rect, b: Rect) {
    const l = r.x - b.x, t = r.y - b.y, rr = l + r.w - b.w, bb = t + r.h - b.h;
    for (const m of marks()) {
      const c = m.classList;
      m.style.transform = `translate(${c.contains('mk--tr') || c.contains('mk--br') ? rr : l}px,${c.contains('mk--bl') || c.contains('mk--br') ? bb : t}px)`;
    }
  }
  /** Open: the marks are off the view's corners and stay hidden (a resize while open never draws them over the page). */
  const marksOff = () => { for (const m of marks()) m.style.visibility = 'hidden'; };
  const marksHome = () => { for (const m of marks()) { m.style.transform = ''; m.style.visibility = ''; } };
  /** No WebGL: the tint cover is the frame's own box, so the box fills the view while open: one write at Open (and on a
   *  resize while open), one at the close's swap. A scaled transform here lost the page in CI's WebKit. */
  const coverFill = (on: boolean) => writeRect(frameRect(on ? 'open' : 'work'));

  // ---------------------------------------------------------------- the roll, playback and the frame behind
  // their code is a lazy chunk, loaded with the prefetch or at Open, so the home page's first script stays lean; it also
  // wires the open view's scroll (the frame recedes) and Tab trap (project/view.ts), which only matter once it is in
  type Enh = typeof import('./enhance');
  let enh: Enh | null = null;
  let enhLoad: Promise<Enh> | null = null;
  const loadEnh = () => (enhLoad ??= import('./enhance').then((m) => {
    if (!enh) m.wireView(proj, col, () => h.state() === 'open', h.engine);
    return (enh = m);
  }, (e) => { enhLoad = null; throw e; }));
  function enhance() {
    roll?.destroy();
    pb?.destroy();
    if (!enh) return;
    roll = enh.initRoll({ root: col, scroller: col, calm: h.calm, counter });
    pb = enh.initPlayback({ prints: roll?.prints ?? [], calm: h.calm, onHold: (on) => roll?.hold(on) });
    // the roll shows the counter once a print takes focus; with no roll it stays hidden
    if (counter && !roll) { counter.textContent = ''; counter.hidden = true; }
  }
  function unenhance() {
    roll?.destroy();
    pb?.destroy();
    roll = pb = null;
  }
  // the article's own links: previous and next swap in place; anything else leaves normally
  col.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-step]');
    if (!a || h.state() !== 'open') return;
    e.preventDefault();
    step(Number(a.dataset.step) || 1);
  });
  /** Fetch, parse and adopt the page for frame i; resolves false if a newer open or close took over. */
  async function bring(i: number, my: number) {
    const m = await loadEnh();
    const doc = await m.loadArticle(slugAt(i));
    if (my !== token) return false;
    const { title } = m.adopt(doc, col);
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
    // Close returns focus to the control that opened (#78): a focused control in the EVF, else Open frame. Enter on the
    // EVF itself, a click on the frame or a tap at the AF box focus no control, so they come back to Open frame too.
    const a = document.activeElement as HTMLElement | null;
    opener = a && a !== evf && evf.contains(a) && a.matches('button, a[href]') && !a.closest('[data-go]') ? a : null;
    if (!fromPop) {
      history.pushState({ vf: 'project', slug }, '', projectUrl(slug));
    }
    pushed = true;
    col.replaceChildren();
    proj.hidden = false;
    evf.inert = true;
    evf.classList.add('is-open');
    let ready = false;
    let arrived = false;
    const bar = $('.proj__bar', proj);
    const fail = () => { if (my === token) location.assign(projectUrl(slug, print ?? undefined)); };
    const engine = h.engine();
    if (engine) engine.idleTarget = 0;
    gsap.set(bar, { opacity: 0 });
    bring(i, my).then((ok) => {
      if (!ok) return;
      ready = true;
      for (const e of col.children) (e as HTMLElement).style.opacity = '0';
    }, fail);
    /** The bar is up by the landing; then the header's details expose one by one from the landing, 100 ms apart, with
     *  no rise (the exposure grammar), and the blocks below the fold follow the last of them. A crossfade on the calm
     *  and flat paths. `lead` is how long before the landing it runs (0 when the page was parsed late). */
    const arrive = (lead = 0) => {
      if (arrived || !ready || my !== token) return;
      arrived = true;
      const kids = [...col.children] as HTMLElement[];
      gsap.fromTo(bar, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none', clearProps: 'opacity' });
      if (h.calm || !engine) { gsap.fromTo(kids, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none', clearProps: 'opacity' }); return; }
      const head = kids.find((k) => k.matches('.pj__head'));
      const details = head ? ([...head.children] as HTMLElement[]) : [];
      const roll = kids.find((k) => k.matches('.roll'));
      const rest = kids.filter((k) => k !== head && k !== roll);
      const at = Math.max(0, lead - 0.1); // the first detail 0.1 s before the landing, so it is there as the zoom settles
      if (head) { gsap.set(details, { opacity: 0 }); head.style.opacity = ''; }
      gsap.to(details, { opacity: 1, duration: 0.36, ease: E.out, stagger: 0.1, delay: at, clearProps: 'opacity' });
      // the roll is the last beat of the same exposure: up in 0.2 s at the landing, so print 1's own expose (-3 EV to
      // clear) is what shows, not a late block fade
      if (roll) gsap.fromTo(roll, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none', delay: lead, clearProps: 'opacity' });
      gsap.fromTo(rest, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: E.out, delay: at + details.length * 0.1, clearProps: 'opacity' });
    };
    const settle = () => {
      if (my !== token) return;
      if (!ready) { fail(); return; } // not parsed by the landing: the page itself
      h.setState('open');
      marksOff();
      enhance();
      arrive();
      // the column itself (tabindex -1, the scroller): the keys scroll the page at once, Space never presses Back, and
      // Tab goes on into the article (Shift+Tab reaches Back). A focused title inside it lost the page in CI's WebKit
      // over long column scrolls.
      col.focus({ preventScroll: true });
      // a traversal straight onto .../#print-NN: playback follows the entry (and knows whether it pushed it)
      const here = parse();
      if (print && pb && here.kind === 'project' && here.print === print) pb.sync(location.hash);
    };
    const full = frameRect('open');
    if (!engine || h.calm) {
      if (!engine) coverFill(true);
      marksOff();
      $$('.evf .pw.on').forEach((e) => e.classList.remove('on'));
      const t = gsap.timeline({ onComplete: () => { h.setTl(null); settle(); } });
      h.setTl(t);
      if (engine) {
        const st = engine.st;
        engine.holdPrevious();
        Object.assign(st, { rect: full, nd: 1, ndv: isPhone() ? 1 : 0, radius: 0, rim: 0, mix: 0 });
        t.to(st, { mix: 1, duration: 0.4, onUpdate: h.reveal });
      } else t.to({}, { duration: 0.4 });
      t.call(arrive, [], 0.15);
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
    t.call(arrive, [0.25], D.travel - 0.25);
    t.call(() => { $$('.evf .pw.on').forEach((e) => { if (!e.matches('.ro--fl')) e.classList.remove('on'); }); }, [], 0.08);
    const box = boxRect(), R = st.rect;
    t.to(R, { x: full.x, y: full.y, w: full.w, h: full.h, duration: D.travel, ease: E.lens, onUpdate: () => { marksAt(R, box); h.reveal(); } }, 0);
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
      marksHome();
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
        coverFill(false);
        marksHome();
        if (engine) {
          const st = engine.st;
          engine.holdPrevious();
          Object.assign(st, { rect, nd: 0, radius: 5, rim: 1, mix: 0, dim: 1, zoom: 1, dolly: 0 });
          gsap.to(st, { mix: 1, duration: 0.3, onUpdate: h.reveal });
        } else h.cover(i);
        // the frame shown may not be the one opened (previous and next): the AF goes to its subject
        h.afHome();
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
    // the box is the work frame's already (main.ts keeps it so on a resize while open): this writes nothing new
    writeRect(rect);
    const R = st.rect;
    marksAt(R, rect);
    for (const m of marks()) m.style.visibility = '';
    t.to(R, { x: rect.x, y: rect.y, w: rect.w, h: rect.h, duration: D.travel * k, ease: E.lens, onUpdate: () => { marksAt(R, rect); h.reveal(); } }, 0.06);
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
    // the counter leaves with the old roll; the new roll shows it once one of its prints takes focus
    if (counter) counter.hidden = true;
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
      } else h.cover(to);
    }
    history.replaceState({ vf: 'project', slug }, '', projectUrl(slug));
    loadEnh().then((m) => m.loadArticle(slug).then((doc) => ({ m, doc }))).then(async ({ m, doc }) => {
      await out.then();
      if (my !== token) return;
      unenhance();
      const { title } = m.adopt(doc, col);
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

  /** Back home after a project: the entry's address names the frame now shown (previous and next may have moved it). */
  const homeHere = () => { if (location.pathname === '/') history.replaceState(history.state, '', homeUrl(workHash(h.pos() + 1))); };

  function onPop() {
    const r = parse();
    // our own Back lands home; playback's own Back, still on its way (Esc, Esc), lands on the page first: let it pass
    if (ownBack) { if (r.kind === 'project' && r.slug === slugAt(h.pos())) return; ownBack = false; if (r.kind === 'home') { homeHere(); return; } }
    let S = h.state();
    // a traversal while the camera lowers or raises: that move lands first, then the entry is acted on
    if (S === 'raising' || S === 'lowering') { h.finishTl(); S = h.state(); }
    if (r.kind === 'project') {
      const i = projects.findIndex((p) => p.slug === r.slug);
      if (i < 0) { location.reload(); return; }
      if ((S === 'open' || S === 'opening') && i === h.pos()) { pb?.sync(location.hash); return; }
      // another project's entry while one is open or opening (a stale forward entry that previous/next's replaceState
      // left behind): the open view goes at once, then the frame moves there and opens; the entry behind it is not ours
      let stray = false;
      if (S === 'open' || S === 'opening') { close('pop'); h.finishTl(); S = h.state(); stray = true; }
      // Forward during the close: the close lands first
      if (S === 'closing') { h.finishTl(); S = h.state(); }
      if (S === 'evf' || S === 'intro') {
        h.jump(i);
        // playback must not claim a #print entry that was pushed for another project's page
        if (stray && r.print) history.replaceState({ vf: 'project', slug: r.slug }, '', location.href);
        open({ fromPop: true, print: r.print });
        if (stray) pushed = false;
      }
      return;
    }
    if (S === 'open' || S === 'opening') { close('pop'); homeHere(); return; }
    // an address typed or traversed to another frame: move there without animation
    const to = r.frame ? r.frame - 1 : -1;
    if (S === 'evf' && to >= 0 && to < h.works && to !== h.pos()) h.jump(to);
  }

  /** A frame became current: prefetch its page once it has stayed 300 ms. */
  function framed(i: number) {
    clearTimeout(prefetchTimer);
    if (i < 0 || i >= h.works) return;
    prefetchTimer = window.setTimeout(() => { if (h.pos() === i && (h.state() === 'evf' || h.state() === 'raising')) { loadEnh().then((m) => m.prefetch(slugAt(i)), () => {}); } }, PREFETCH_MS);
  }

  function onResize() {
    if (h.state() !== 'open') return;
    const e = h.engine();
    // main.ts has written the new work frame's box: the cover fills the view again from it
    if (!e) { coverFill(true); return; }
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
  };
}

export type ProjectControl = ReturnType<typeof initProject>;
