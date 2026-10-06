// Gate-owned counters (W-D030), installed with page.addInitScript before any page script runs. They count what the
// browser actually did, independent of the stage's own __stage.stats, so the two can be cross-checked.
// The idle window counts from the motion end (Orchestrator ruling on #11, 5992928262): the later of the last input
// event (scroll, wheel, pointer or key) and the last frame the stage presented. Every stage render clears the canvas
// first (autoClear off, one explicit clear), so clearTimes holds every presented frame, tail and clear-only frames
// included; drawTimes holds the frames that drew.
(() => {
  const C = (window.__gateCounters = { raf: 0, rafRequests: 0, rafByDependency: {}, draws: 0, clears: 0, rectReads: 0, rectReadsInRaf: 0, rafTimes: [], drawTimes: [], clearTimes: [], stampsDropped: { rafTimes: 0, drawTimes: 0, clearTimes: 0 }, lastScrollAt: 0, lastUserInputAt: 0, lastInputAt: 0 });
  // Timestamps let the harness measure a window that starts when motion ends, not only when input ends. Each list keeps
  // the NEWEST stamps (between STAMPS / 2 and STAMPS of them: the oldest half goes when it is full), so it never stops
  // stamping: a window measured after a long intro (D2 / passes 100,000 draws before it settles) still sees every
  // stamp inside it (round-2 must-fix counters-draw-cap; the old list stopped at 20,000 and went blind). The uncapped
  // counts (raf, draws, clears) stay beside them, and stampsDropped says how many old stamps went.
  const STAMPS = 20000;
  const stamp = (list, name) => {
    if (list.length >= STAMPS) C.stampsDropped[name] += list.splice(0, STAMPS / 2).length;
    list.push(performance.now());
  };
  addEventListener('scroll', () => { C.lastScrollAt = C.lastInputAt = performance.now(); }, { capture: true, passive: true });
  // The user's own input (the bound: the motion must end within 4 s of it).
  for (const type of ['wheel', 'pointerdown', 'pointermove', 'pointerup', 'keydown', 'keyup', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mousemove', 'mouseup']) {
    addEventListener(type, () => { C.lastUserInputAt = C.lastInputAt = performance.now(); }, { capture: true, passive: true });
  }
  let inRaf = 0;
  const raf = window.requestAnimationFrame;
  // Attribute each callback to the bundle that asked for it: src/ has one call site (the ticker); dependencies such
  // as Lenis and Swup may request frames during input or a visit, and are reported by name.
  const source = () => {
    const m = /\/_astro\/(lenis|swup|Swup)[^/]*\.js/.exec(String(new Error().stack));
    return m ? m[1].toLowerCase() : null;
  };
  window.requestAnimationFrame = function (cb) {
    C.rafRequests++;
    const dep = source();
    return raf.call(window, (t) => {
      C.raf++;
      stamp(C.rafTimes, 'rafTimes');
      if (dep) C.rafByDependency[dep] = (C.rafByDependency[dep] || 0) + 1;
      inRaf++;
      try {
        return cb(t);
      } finally {
        inRaf--;
      }
    });
  };
  const DRAWS = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'];
  for (const Ctx of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!Ctx) continue;
    for (const m of DRAWS) {
      const orig = Ctx.prototype[m];
      if (typeof orig !== 'function') continue;
      Ctx.prototype[m] = function (...a) {
        C.draws++;
        stamp(C.drawTimes, 'drawTimes');
        return orig.apply(this, a);
      };
    }
    const clear = Ctx.prototype.clear;
    if (typeof clear === 'function') {
      Ctx.prototype.clear = function (...a) {
        C.clears++;
        stamp(C.clearTimes, 'clearTimes');
        return clear.apply(this, a);
      };
    }
  }
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    C.rectReads++;
    if (inRaf) C.rectReadsInRaf++;
    return rect.call(this);
  };
})();
