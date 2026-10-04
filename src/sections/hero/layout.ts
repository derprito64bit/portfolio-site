// Hero stage layout (W-D009, W-D013): where the camera, print 1, the strip and the effects slot sit, per band.
// It runs twice: inlined before first paint (Hero.astro serialises this function into an inline script, so the first
// frame is already laid out and nothing shifts), and from hero.ts on width, font and text-spacing changes.
// It must stay self-contained (no imports, no outer references): it is stringified.
//
// Rules it enforces, from the plan and the brief:
// - stage height = min(content width, 100svh minus the measured text stack) (W-D009);
// - print 1 is at least 50% of the content width below 64rem, and its image window is at least 220 px at 64rem and
//   wider (window = 46/54 of the print width);
// - the whole camera and print 1 sit in the first screen; print 1 overlaps the grip side, never the lens;
// - the h1, lede and CTA are no-fly rects: nothing GL sits on them, and the eject has headroom below them;
// - no text box over a GL rect at rest (the strip never touches the camera or the print);
// - the LCP element stays the h1 on mouse profiles (the camera poster is kept below 85% of the h1's LCP area, its
//   name's text) and the h1 or print 1's still on touch (the poster stays below 85% of the larger of the two).
export function heroLayout(hero: HTMLElement, nudge = false): void {
  const doc = hero.ownerDocument;
  const win = doc.defaultView as Window;
  const row = hero.querySelector('.hero-row') as HTMLElement | null;
  const h1 = hero.querySelector('h1') as HTMLElement | null;
  const copy = hero.querySelector('.hero-copy') as HTMLElement | null;
  if (!row || !h1 || !copy) return;
  const mm = (q: string) => win.matchMedia(q).matches;
  const W = row.clientWidth;
  const vh = win.innerHeight;
  const split = mm('(min-width: 64rem), (orientation: landscape) and (max-height: 500px)');
  const band = split ? 'split' : mm('(max-width: 479px)') ? 'phone' : 'stacked';
  const touch = !mm('(pointer: fine) and (hover: hover)');
  const A = Number(hero.getAttribute('data-aspect-' + band)) || 1.35;
  // The strip is a fixed two-row block (W-D032 targets): row 1 Shutter + Lens, row 2 Look + readout.
  const SW = 344;
  const SH = 96;
  const GS = 8; // gap between the camera and the strip
  const PR = 54 / 86; // print width / height
  const WIN = 46 / 54; // image window / print width
  const HEAD = 0.15; // eject headroom above the camera, as a share of its width (the flight's measured apex + margin)
  const OVER = 0.32; // most of the camera's width print 1 may cover (the grip side; the lens starts near 44%)
  const TILT = (1.2 * Math.PI) / 180; // print 1's slot tilt (Hero.astro .hero-print rotate)
  const TC = Math.cos(TILT);
  const TS = Math.sin(TILT);
  const r = (n: number) => Math.round(n);
  const rowBox = row.getBoundingClientRect();
  const rowTop = rowBox.top + win.scrollY;
  // The h1's LCP size is its name's text, not its box: the brackets are positioned spans that paint on their own,
  // and the box runs the content width. The fallback face draws the same text box (Wordmark.astro), so a late font
  // changes neither this area nor the layout.
  let h1Area = 0;
  const range = doc.createRange();
  h1.childNodes.forEach((n) => {
    if (n.nodeType !== 3 || !(n.textContent || '').trim()) return;
    range.selectNodeContents(n);
    for (const b of range.getClientRects()) h1Area += b.width * b.height;
  });
  if (!h1Area) {
    const h1Box = h1.getBoundingClientRect();
    h1Area = h1Box.width * h1Box.height;
  }
  let textRight = 0;
  let copyBottom = 0;
  copy.querySelectorAll('.hero-line, .hero-cta a').forEach((el) => {
    const b = el.getBoundingClientRect();
    textRight = Math.max(textRight, b.right - rowBox.left);
    copyBottom = Math.max(copyBottom, b.bottom - rowBox.top);
  });
  const fits = W >= SW;
  let arrangement: 'beside' | 'below' | 'short';
  let rowH: number;
  let cam: { x: number; y: number; w: number; h: number };
  let pr: { x: number; y: number; w: number; h: number };
  let strip: { x: number; y: number } | null;
  const capArea = (printArea: number) => 0.85 * (touch ? Math.max(h1Area, printArea) : h1Area);
  if (split) {
    const avail = vh - rowTop - 6;
    const short = avail < SH + 260 || !fits;
    arrangement = short ? 'short' : 'beside';
    rowH = Math.max(avail, 200);
    const stripRoom = short ? 0 : SH + GS;
    // Print 1: as tall as the row allows, at least a 220 px window, about a quarter of the content width.
    // 10 px under the row's top stays free: the landing lift and the tilt never reach the h1.
    let pw = Math.min((rowH - 10) * PR, Math.max(259, 0.24 * W));
    if (short) pw = Math.min((rowH - 10) * PR, 0.3 * W);
    // On a mouse, print 1's still appears late (the eject's handback, with no input yet), so its LCP size, the box
    // of the tilted card, stays under the h1's: the LCP stays the h1 (budgets.md).
    if (!touch) pw = Math.min(pw, Math.sqrt((0.98 * h1Area) / ((TC + TS / PR) * (TC / PR + TS))));
    // Where the row is tall enough, print 1 sits under the copy, in the column the copy leaves empty, at the largest
    // size that fits there with a window of 220 px or more (a big desktop's first screen: the print fills the lower
    // left and the camera is seen whole). Otherwise it keeps clear of the lede and CTA, beside the camera's grip.
    const camFor = (p: number) => Math.min((rowH - stripRoom) / (HEAD + 1 / A), Math.sqrt(capArea(p * (p / PR)) * A), 0.46 * W, 760);
    const roomUnder = (rowH - copyBottom - 28) * PR; // 28 px: the landing lift and tilt stay clear of the CTA
    const pwBeside = pw;
    let under = !short && roomUnder * WIN >= 220;
    if (under) pw = Math.min(pw, roomUnder);
    let cw = camFor(pw);
    // Under the copy the print keeps 24 px clear of the camera; beside it, it sits left of the strip, over the grip.
    if (under && pw + 24 > W - cw) {
      under = false;
      pw = pwBeside;
      cw = camFor(pw);
    }
    const left = under ? 0 : textRight + 24;
    let right = under ? pw : Math.min(short ? W : W - SW - 8, W - cw + OVER * cw);
    if (!under && right - left < pw) {
      // Not enough room between the copy and the camera: shrink the camera until the print fits, then the print.
      const need = pw - (right - left);
      cw = Math.max(160, cw - need / (1 - OVER));
      right = Math.min(short ? W : W - SW - 8, W - cw + OVER * cw);
      pw = Math.max(Math.min(pw, right - left), 100);
    }
    const ch = cw / A;
    // Compact the row to what it holds (a tall portrait split, like a 1024 x 1366 tablet, would otherwise leave a
    // gap between the copy and the camera), keeping everything bottom-aligned.
    rowH = Math.min(rowH, Math.max(pw / PR + (under ? copyBottom + 28 : 0), HEAD * cw + ch + stripRoom, copyBottom + 24));
    cam = { x: W - cw, y: rowH - stripRoom - ch, w: cw, h: ch };
    pr = { x: right - pw, y: rowH - pw / PR, w: pw, h: pw / PR };
    strip = short ? { x: W - SW, y: rowH + 12 } : { x: W - SW, y: rowH - SH };
    if (short) rowH += 12 + SH;
  } else {
    arrangement = 'below';
    const stageTop = copyBottom + 20;
    const pw = Math.max(0.5 * W, 140);
    const ph = pw / PR;
    const room = vh - (rowTop + stageTop) - GS - SH - 12;
    const areaH = Math.max(Math.min(W, room), ph);
    let cw = Math.min(0.5 * W / (1 - OVER), Math.sqrt(capArea(pw * ph) * A), areaH / (HEAD + 1 / A), W - 24);
    cw = Math.max(cw, 120);
    const ch = cw / A;
    cam = { x: W - cw, y: stageTop + Math.min(HEAD * cw, areaH - ch), w: cw, h: ch };
    pr = { x: 0, y: stageTop + areaH - ph, w: pw, h: ph };
    strip = fits ? { x: W - SW, y: stageTop + areaH + GS } : null;
    rowH = stageTop + areaH + (fits ? GS + SH : 0);
  }
  // The effects slot covers everything GL draws during a print's flight: the camera with its eject headroom and the
  // print. Hidden at rest, so no text ever sits over a GL rect while nothing moves.
  const fxTop = Math.max(0, Math.min(cam.y - HEAD * cam.w, pr.y) - 8);
  const fxLeft = Math.max(0, Math.min(cam.x, pr.x) - 16);
  const fxBottom = Math.max(cam.y + cam.h, pr.y + pr.h) + 16;
  const s = hero.style;
  // A re-layout can move a slot without resizing it, which the stage's ResizeObserver cannot see. A nudge of
  // 0.01 px, alternating between runs, makes every slot report a resize, so the stage re-measures them all.
  const eps = nudge && !hero.hasAttribute('data-nudge') ? 0.01 : 0;
  if (nudge) hero.toggleAttribute('data-nudge');
  const px = (k: string, v: number) => s.setProperty(k, r(v) + (k.endsWith('-w') ? eps : 0) + 'px');
  px('--row-h', rowH);
  // The camera slot's size lands on whole canvas pixels where it can (below), at the canvas DPR of the tier this
  // device would get with GL (fine pointer and hover: full, else lite), so the layout is the same on every tier and
  // mode: static and reduced shift nothing against auto (0 px).
  const naturalFull = mm('(pointer: fine) and (hover: hover)');
  let g = win.devicePixelRatio || 1;
  {
    const probe = doc.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;width:0;height:100lvh;visibility:hidden';
    doc.body.appendChild(probe);
    const area = doc.documentElement.clientWidth * Math.round((probe.offsetHeight || vh) * 1.25);
    probe.remove();
    const cap = naturalFull ? [2, 4.5e6] : [1.5, 1.5e6];
    g = Math.min(g, cap[0]);
    if (area * g * g > cap[1]) g = Math.sqrt(cap[1] / area);
  }
  // The stage measures slots with offsetWidth/Height (whole px), so the size is whole px too, the height at or just
  // under width / aspect (the poster fits by height exactly as GL does). three.js floors the scissored viewport to
  // whole canvas pixels, so of the sizes up to 3 px under the computed width, the one whose width and height land
  // closest to whole canvas pixels (at a fractional effective DPR, a floored height draws GL up to a pixel short of
  // the poster). Only ever down from the computed width, so the LCP cap above still holds after the snap.
  const left = rowBox.left + win.scrollX;
  const off = (v: number) => Math.abs(v * g - Math.round(v * g));
  let camW = Math.floor(cam.w);
  let camH = Math.floor(camW / A);
  let best = Infinity;
  for (let c = Math.floor(cam.w); c >= Math.floor(cam.w) - 3 && c > 0; c--) {
    for (const hh of [Math.floor(c / A), Math.floor(c / A) - 1]) {
      const e = off(c) + off(hh);
      if (hh > 0 && e < best - 1e-6) {
        best = e;
        camW = c;
        camH = hh;
      }
    }
  }
  // Its position is whole CSS pixels in the page: Chrome paints the poster image on whole CSS pixels (measured: a
  // slot at x.65 px showed its poster about a third of a CSS pixel off the GL frame, which the camera registers to
  // the slot's exact box), so on whole pixels the poster, the slot and the first GL frame coincide.
  const camX = Math.round(left + cam.x) - left;
  const camY = Math.round(rowTop + cam.y) - rowTop;
  s.setProperty('--cam-x', camX + 'px');
  s.setProperty('--cam-y', camY + 'px');
  s.setProperty('--cam-w', camW + eps + 'px');
  s.setProperty('--cam-h', camH + 'px');
  px('--pr-x', pr.x);
  px('--pr-y', pr.y);
  px('--pr-w', pr.w);
  px('--pr-h', pr.h);
  px('--fx-x', fxLeft);
  px('--fx-y', fxTop);
  px('--fx-w', W - fxLeft);
  px('--fx-h', fxBottom - fxTop);
  if (strip) {
    px('--strip-x', strip.x);
    px('--strip-y', strip.y);
  }
  hero.setAttribute('data-band', band);
  hero.setAttribute('data-arrangement', strip ? arrangement : 'flow');
  hero.setAttribute('data-laid', '');
  void doc;
  void WIN;
}

/**
 * The camera poster to show before GL (scripts/build/posters/stage.js posterSet): the set of the LOD that GL will
 * draw, at the size GL will draw it, so the poster and the first GL frame are the same picture (acceptance: mean
 * diff <= 4/255). GL draws at the tier's effective DPR (W-D017: full DPR <= 2 and 4.5 Mpx, lite DPR <= 1.5 and
 * 1.5 Mpx over the riding canvas, 100lvh x 1.25), LOD0 only on full at 600 device px and wider (D-021); the static
 * tier has no GL frame to match and gets the sharpest LOD0. Runs inline right after the poster is parsed, then on
 * every layout change. Self-contained (stringified like heroLayout). `load`: fetch it even under the drawing.
 */
export function heroPoster(hero: HTMLElement, load = false): void {
  const doc = hero.ownerDocument;
  const win = doc.defaultView as Window;
  const root = doc.documentElement;
  const img = hero.querySelector('.hero-poster') as HTMLImageElement | null;
  const src = hero.querySelector('.hero-poster-avif') as HTMLSourceElement | null;
  const camEl = hero.querySelector('[data-hero-camera]') as HTMLElement | null;
  if (!img || !camEl) return;
  const sets = JSON.parse(hero.getAttribute('data-posters') || '{}');
  const band = hero.getAttribute('data-band') || 'stacked';
  const tier = doc.documentElement.getAttribute('data-tier') || 'static';
  const camW = camEl.offsetWidth;
  let dpr = win.devicePixelRatio || 1;
  let lod = 0;
  if (tier !== 'static') {
    const probe = doc.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;width:0;height:100lvh;visibility:hidden';
    doc.body.appendChild(probe);
    const area = doc.documentElement.clientWidth * Math.round((probe.offsetHeight || win.innerHeight) * 1.25);
    probe.remove();
    const cap = tier === 'full' ? [2, 4.5e6] : [1.5, 1.5e6];
    dpr = Math.min(dpr, cap[0]);
    if (area * dpr * dpr > cap[1]) dpr = Math.sqrt(cap[1] / area);
    lod = tier === 'full' && camW * dpr >= 600 ? 0 : 1;
  }
  const list: [number, string, string][] = (sets[band] || sets.stacked)[lod ? 'lod1' : 'lod0'];
  const need = camW * dpr;
  // The nearest size by ratio: the poster carries the detail GL will show, no more and no less.
  let pick = list[0];
  for (const p of list) if (Math.abs(Math.log(p[0] / need)) < Math.abs(Math.log(pick[0] / need))) pick = p;
  const base = hero.getAttribute('data-poster-base') || '';
  img.setAttribute('data-lod', String(lod));
  // Under the drawing (W-D012 data-cam=drawing) the poster is not on screen. On the full tier's opening GL develops
  // the drawing itself, so the poster waits until hero.ts asks for it (a guard, the end of the opening); elsewhere it
  // loads at low priority for the crossfade, never ahead of the LCP image.
  const drawing = root.getAttribute('data-cam') === 'drawing';
  if (drawing && !load && root.getAttribute('data-hero') === 'eject') return;
  if (img.getAttribute('data-file') === pick[2]) return;
  if (drawing) img.setAttribute('fetchpriority', 'low');
  img.setAttribute('data-file', pick[2]);
  if (src) {
    src.srcset = base + pick[1];
    src.media = 'all';
  }
  img.src = base + pick[2];
}
