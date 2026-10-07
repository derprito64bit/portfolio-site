// Gate-owned counters (W-D030), installed with page.addInitScript before any page script runs. They count what the
// browser actually did, independent of the stage's own __stage.stats, so the two can be cross-checked.
// The idle window counts from the motion end (Orchestrator rulings on #11, 5992928262 and 6030949628): the later of the
// last input event (scroll, wheel, pointer or key), the last arrival (a full load, a bfcache restore, a Swup visit's end)
// and the last frame the stage presented.
// Presented frames: every way WebGL can put pixels on the default framebuffer is counted and stamped (round-3 must-fix
// counters-draw-cap: the WebGL 1 and 2 IDL and the Khronos extension registry, listed in DRAWS, CLEARS and EXT_DRAWS
// below). drawTimes holds the draw calls (the context's own, the extensions' and a blit into the default framebuffer);
// clearTimes holds the clears (clear and clearBuffer*). Every stage render clears the canvas first (autoClear off, one
// explicit clear), so a presented stage frame always leaves a clear stamp, tail and clear-only frames included.
(() => {
  const C = (window.__gateCounters = {
    raf: 0, rafRequests: 0, rafByDependency: {}, draws: 0, clears: 0, blits: 0, drawsBy: {},
    rectReads: 0, rectReadsInRaf: 0, layoutReadsInRaf: 0, layoutReadsInRafBy: {},
    rafTimes: [], drawTimes: [], clearTimes: [], stampsDropped: { rafTimes: 0, drawTimes: 0, clearTimes: 0 },
    lastScrollAt: 0, lastUserInputAt: 0, lastInputAt: 0, lastArrivalAt: 0, arrivals: [],
  });
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
  // Arrivals (ruling 6030949628 item 1): a full load or a history traversal that loads (the load event), a bfcache
  // restore (pageshow, persisted) and a Swup visit's end (Swup takes html.is-changing off when the visit ends).
  const arrive = (kind) => {
    C.lastArrivalAt = performance.now();
    C.arrivals.push({ kind, at: C.lastArrivalAt });
  };
  addEventListener('load', () => arrive('load'), { once: true });
  addEventListener('pageshow', (e) => { if (e.persisted) arrive('bfcache'); });
  let changing = false;
  // Init scripts can run before <html> exists: watch it once it does.
  const watchHtml = () => {
    const h = document.documentElement;
    if (!h) return false;
    new MutationObserver(() => {
      const now = h.classList.contains('is-changing');
      if (changing && !now) arrive('swup');
      changing = now;
    }).observe(h, { attributes: true, attributeFilter: ['class'] });
    return true;
  };
  if (!watchHtml()) {
    const mo = new MutationObserver(() => {
      if (watchHtml()) mo.disconnect();
    });
    mo.observe(document, { childList: true });
  }
  // A visit without the animated classes (reduced motion, or a page with nothing to fade) still replaces the #swup
  // container (Swup swaps the element itself): that replacement is its arrival (and the class change after it, when
  // there is one, comes later and wins).
  addEventListener('DOMContentLoaded', () => {
    const parent = document.getElementById('swup')?.parentNode;
    if (!parent) return;
    new MutationObserver((recs) => {
      if (recs.some((r) => [...r.addedNodes].some((n) => n.id === 'swup'))) arrive('swup');
    }).observe(parent, { childList: true });
  }, { once: true });

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

  const draw = (name) => {
    C.draws++;
    C.drawsBy[name] = (C.drawsBy[name] || 0) + 1;
    stamp(C.drawTimes, 'drawTimes');
  };
  const clear = () => {
    C.clears++;
    stamp(C.clearTimes, 'clearTimes');
  };
  const wrap = (obj, m, before) => {
    const orig = obj[m];
    if (typeof orig !== 'function' || orig.__gate) return;
    const w = function (...a) {
      before.call(this, a);
      return orig.apply(this, a);
    };
    w.__gate = true;
    obj[m] = w;
  };
  // The context's own draw calls (WebGL 1 and 2) and clears.
  const DRAWS = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'];
  const CLEARS = ['clear', 'clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi'];
  // Draw calls that live on extension objects (the Khronos registry: ratified and community extensions that draw):
  // getExtension returns an object whose methods no context prototype holds, so they are wrapped when it is returned.
  const EXT_DRAWS = {
    ANGLE_instanced_arrays: ['drawArraysInstancedANGLE', 'drawElementsInstancedANGLE'],
    WEBGL_multi_draw: ['multiDrawArraysWEBGL', 'multiDrawElementsWEBGL', 'multiDrawArraysInstancedWEBGL', 'multiDrawElementsInstancedWEBGL'],
    WEBGL_draw_instanced_base_vertex_base_instance: ['drawArraysInstancedBaseInstanceWEBGL', 'drawElementsInstancedBaseVertexBaseInstanceWEBGL'],
    WEBGL_multi_draw_instanced_base_vertex_base_instance: ['multiDrawArraysInstancedBaseInstanceWEBGL', 'multiDrawElementsInstancedBaseVertexBaseInstanceWEBGL'],
  };
  // A blit writes the default framebuffer only while no draw framebuffer is bound (bindFramebuffer with DRAW_FRAMEBUFFER
  // or FRAMEBUFFER, tracked per context); a blit into a framebuffer object is counted as a blit, not a draw.
  const drawFbo = new WeakMap();
  for (const Ctx of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!Ctx) continue;
    const P = Ctx.prototype;
    for (const m of DRAWS) wrap(P, m, () => draw(m));
    for (const m of CLEARS) wrap(P, m, clear);
    wrap(P, 'bindFramebuffer', function (a) {
      if (a[0] === this.FRAMEBUFFER || a[0] === 0x8ca9 /* DRAW_FRAMEBUFFER */) drawFbo.set(this, a[1] ?? null);
    });
    wrap(P, 'blitFramebuffer', function () {
      C.blits++;
      if (!drawFbo.get(this)) draw('blitFramebuffer');
    });
    const getExtension = P.getExtension;
    if (typeof getExtension === 'function') {
      P.getExtension = function (name) {
        const ext = getExtension.call(this, name);
        const list = ext && EXT_DRAWS[String(name)];
        if (list) {
          // On the extension's prototype when the methods are there (one wrap covers every context), else on the object.
          const proto = Object.getPrototypeOf(ext);
          for (const m of list) wrap(proto && typeof proto[m] === 'function' ? proto : ext, m, () => draw(m));
        }
        return ext;
      };
    }
  }

  // Layout reads inside rAF (W-F: no forced layout in the ticker). getBoundingClientRect is the one #11 names; the
  // others that force layout are counted beside it (round-3 should-fix S9).
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    C.rectReads++;
    if (inRaf) C.rectReadsInRaf++;
    return rect.call(this);
  };
  const layoutRead = (name) => {
    if (!inRaf) return;
    C.layoutReadsInRaf++;
    C.layoutReadsInRafBy[name] = (C.layoutReadsInRafBy[name] || 0) + 1;
  };
  wrap(Element.prototype, 'getClientRects', () => layoutRead('getClientRects'));
  const gcs = window.getComputedStyle;
  window.getComputedStyle = function (...a) {
    layoutRead('getComputedStyle');
    return gcs.apply(window, a);
  };
  for (const [Proto, props] of [
    [HTMLElement.prototype, ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'offsetParent']],
    [Element.prototype, ['clientWidth', 'clientHeight', 'clientTop', 'clientLeft', 'scrollWidth', 'scrollHeight']],
  ]) {
    for (const p of props) {
      const d = Object.getOwnPropertyDescriptor(Proto, p);
      if (!d?.get) continue;
      Object.defineProperty(Proto, p, { ...d, get() { layoutRead(p); return d.get.call(this); } });
    }
  }
})();
