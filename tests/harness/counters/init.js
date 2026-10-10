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
// Round 5 (ruling 6049539219 item 4; the axes the earlier rounds missed):
//  (a) an extension is looked up by its name ASCII case-insensitively, as getExtension itself matches it;
//  (b) every same-origin frame is a realm with its own WebGL prototypes and its own rAF: each one installs the same
//      wrappers, and all of them count into the top-most same-origin window's __gateCounters on that window's clock.
//      The top realm also installs into a child realm the moment it reads the frame's contentWindow or contentDocument,
//      so a synchronous access right after append() is covered before the child's own init script runs;
//  (c) every request*AnimationFrame function the engine exposes on window (webkitRequestAnimationFrame and any other
//      alias, enumerated from the window object and its prototype chain, not from a name list) counts like rAF;
//  (d) frame sources no init script can reach (a worker's rAF and WebGL through transferControlToOffscreen, a 'webgpu'
//      canvas context, navigator.gpu) are recorded in __gateCounters.blind; motionWindow fails any window on a page
//      that used one.
(() => {
  if (window.__gateInstalled) return; // a parent realm already installed here (adopt, below)
  // The owner: the top-most same-origin ancestor that has the counters (a cross-origin parent throws: stop there).
  let owner = window;
  try {
    for (let p = window.parent; p !== owner && p.__gateApi; p = p.parent) owner = p;
  } catch {
    /* a cross-origin ancestor: count into the last same-origin one */
  }
  const own = owner === window;
  const api = own ? makeApi() : owner.__gateApi;
  if (own) watchArrivals(api);
  install(window, api);

  function makeApi() {
    const C = (window.__gateCounters = {
      raf: 0, rafRequests: 0, rafByDependency: {}, rafBy: {}, rafByRealm: { top: 0, child: 0 }, draws: 0, clears: 0, blits: 0, drawsBy: {},
      drawsByRealm: { top: 0, child: 0 }, rectReads: 0, rectReadsInRaf: 0, layoutReadsInRaf: 0, layoutReadsInRafBy: {},
      rafTimes: [], drawTimes: [], clearTimes: [], stampsDropped: { rafTimes: 0, drawTimes: 0, clearTimes: 0 },
      lastScrollAt: 0, lastUserInputAt: 0, lastInputAt: 0, lastArrivalAt: 0, arrivals: [], realms: 1, blind: [],
    });
    // Timestamps let the harness measure a window that starts when motion ends, not only when input ends. Each list
    // keeps the NEWEST stamps (between STAMPS / 2 and STAMPS of them: the oldest half goes when it is full), so it never
    // stops stamping: a window measured after a long intro (D2 / passes 100,000 draws before it settles) still sees
    // every stamp inside it (round-2 must-fix counters-draw-cap; the old list stopped at 20,000 and went blind). The
    // uncapped counts (raf, draws, clears) stay beside them, and stampsDropped says how many old stamps went.
    const STAMPS = 20000;
    // One clock for every realm: the owner's performance.now (a child realm's timeOrigin is its own document's).
    const now = () => performance.now();
    const stamp = (list, name) => {
      if (list.length >= STAMPS) C.stampsDropped[name] += list.splice(0, STAMPS / 2).length;
      list.push(now());
    };
    const realmOf = (w) => (w === window ? 'top' : 'child');
    return {
      C, now, inRaf: 0, drawFbo: new WeakMap(),
      // Attribute each callback to the bundle that asked for it: src/ has one call site (the ticker); dependencies
      // such as Lenis and Swup may request frames during input or a visit, and are reported by name.
      source() {
        const m = /\/_astro\/(lenis|swup|Swup)[^/]*\.js/.exec(String(new Error().stack));
        return m ? m[1].toLowerCase() : null;
      },
      rafFired(name, w, dep) {
        C.raf++;
        stamp(C.rafTimes, 'rafTimes');
        C.rafBy[name] = (C.rafBy[name] || 0) + 1;
        C.rafByRealm[realmOf(w)]++;
        if (dep) C.rafByDependency[dep] = (C.rafByDependency[dep] || 0) + 1;
      },
      draw(name, w) {
        C.draws++;
        C.drawsBy[name] = (C.drawsBy[name] || 0) + 1;
        C.drawsByRealm[realmOf(w)]++;
        stamp(C.drawTimes, 'drawTimes');
      },
      clear() {
        C.clears++;
        stamp(C.clearTimes, 'clearTimes');
      },
      blind(kind, w) {
        C.blind.push({ kind, realm: realmOf(w), at: now() });
      },
      input(type) {
        C.lastUserInputAt = C.lastInputAt = now();
      },
      scrolled() {
        C.lastScrollAt = C.lastInputAt = now();
      },
      layoutRead(name) {
        if (!this.inRaf) return;
        C.layoutReadsInRaf++;
        C.layoutReadsInRafBy[name] = (C.layoutReadsInRafBy[name] || 0) + 1;
      },
      rectRead() {
        C.rectReads++;
        if (this.inRaf) C.rectReadsInRaf++;
      },
    };
  }

  // Arrivals (ruling 6030949628 item 1), the top realm's own: a full load or a history traversal that loads (the load
  // event), a bfcache restore (pageshow, persisted) and a Swup visit's end (Swup takes html.is-changing off when the
  // visit ends). A child frame's load is not an arrival.
  function watchArrivals(api) {
    const C = api.C;
    const arrive = (kind) => {
      C.lastArrivalAt = api.now();
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
  }

  /** Installs every wrapper into realm `w`, counting into `api` (the owner's). Runs once per realm. */
  function install(w, api) {
    w.__gateInstalled = true;
    w.__gateCounters = api.C;
    w.__gateApi = api; // a grandchild realm walks up through this one to the owner
    if (w !== owner) api.C.realms++;
    const wrap = (obj, m, before) => {
      const orig = obj?.[m];
      if (typeof orig !== 'function' || orig.__gate) return;
      const f = function (...a) {
        before.call(this, a);
        return orig.apply(this, a);
      };
      f.__gate = true;
      obj[m] = f;
    };

    // Input (the bound: the motion must end within 4 s of it) and scrolls, in every realm.
    w.addEventListener('scroll', () => api.scrolled(), { capture: true, passive: true });
    for (const type of ['wheel', 'pointerdown', 'pointermove', 'pointerup', 'keydown', 'keyup', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mousemove', 'mouseup']) {
      w.addEventListener(type, () => api.input(type), { capture: true, passive: true });
    }

    // (c) Every request*AnimationFrame on the window object and its prototype chain (requestAnimationFrame,
    // webkitRequestAnimationFrame, and whatever other alias the engine has).
    const rafNames = new Set();
    for (let o = w; o; o = Object.getPrototypeOf(o)) {
      for (const k of Object.getOwnPropertyNames(o)) if (/^\w*request\w*animationframe$/i.test(k)) rafNames.add(k);
    }
    for (const name of rafNames) {
      let orig;
      try {
        orig = w[name];
      } catch {
        continue;
      }
      if (typeof orig !== 'function' || orig.__gate) continue;
      const f = function (cb) {
        api.C.rafRequests++;
        const dep = api.source();
        return orig.call(w, (t) => {
          api.rafFired(name, w, dep);
          api.inRaf++;
          try {
            return cb(t);
          } finally {
            api.inRaf--;
          }
        });
      };
      f.__gate = true;
      try {
        w[name] = f;
      } catch {
        /* a read-only alias: nothing to wrap */
      }
    }

    // The context's own draw calls (WebGL 1 and 2) and clears.
    const DRAWS = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'];
    const CLEARS = ['clear', 'clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi'];
    // Draw calls that live on extension objects (the Khronos registry: ratified and community extensions that draw):
    // getExtension returns an object whose methods no context prototype holds, so they are wrapped when it is
    // returned. (a) The lookup is ASCII case-insensitive, as getExtension's own match is.
    const EXT_DRAWS = {
      angle_instanced_arrays: ['drawArraysInstancedANGLE', 'drawElementsInstancedANGLE'],
      webgl_multi_draw: ['multiDrawArraysWEBGL', 'multiDrawElementsWEBGL', 'multiDrawArraysInstancedWEBGL', 'multiDrawElementsInstancedWEBGL'],
      webgl_draw_instanced_base_vertex_base_instance: ['drawArraysInstancedBaseInstanceWEBGL', 'drawElementsInstancedBaseVertexBaseInstanceWEBGL'],
      webgl_multi_draw_instanced_base_vertex_base_instance: ['multiDrawArraysInstancedBaseInstanceWEBGL', 'multiDrawElementsInstancedBaseVertexBaseInstanceWEBGL'],
    };
    const asciiLower = (s) => String(s).replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
    // A blit writes the default framebuffer only while no draw framebuffer is bound (bindFramebuffer with
    // DRAW_FRAMEBUFFER or FRAMEBUFFER, tracked per context, across realms); a blit into a framebuffer object is counted
    // as a blit, not a draw.
    for (const Ctx of [w.WebGLRenderingContext, w.WebGL2RenderingContext]) {
      if (!Ctx) continue;
      const P = Ctx.prototype;
      for (const m of DRAWS) wrap(P, m, () => api.draw(m, w));
      for (const m of CLEARS) wrap(P, m, () => api.clear());
      wrap(P, 'bindFramebuffer', function (a) {
        if (a[0] === this.FRAMEBUFFER || a[0] === 0x8ca9 /* DRAW_FRAMEBUFFER */) api.drawFbo.set(this, a[1] ?? null);
      });
      wrap(P, 'blitFramebuffer', function () {
        api.C.blits++;
        if (!api.drawFbo.get(this)) api.draw('blitFramebuffer', w);
      });
      const getExtension = P.getExtension;
      if (typeof getExtension === 'function' && !getExtension.__gate) {
        const g = function (name) {
          const ext = getExtension.call(this, name);
          const list = ext && EXT_DRAWS[asciiLower(name)];
          if (list) {
            // On the extension's prototype when the methods are there (one wrap covers every context), else on the
            // object itself.
            const proto = Object.getPrototypeOf(ext);
            for (const m of list) wrap(proto && typeof proto[m] === 'function' ? proto : ext, m, () => api.draw(m, w));
          }
          return ext;
        };
        g.__gate = true;
        P.getExtension = g;
      }
    }

    // (d) Frame sources the counters cannot see: recorded, and any window on a page that used one fails.
    const canvasGetContext = (P) => wrap(P, 'getContext', (a) => {
      if (String(a[0]) === 'webgpu') api.blind('getContext webgpu', w);
    });
    canvasGetContext(w.HTMLCanvasElement?.prototype);
    canvasGetContext(w.OffscreenCanvas?.prototype);
    wrap(w.HTMLCanvasElement?.prototype, 'transferControlToOffscreen', () => api.blind('transferControlToOffscreen', w));
    wrap(w.GPU?.prototype, 'requestAdapter', () => api.blind('navigator.gpu.requestAdapter', w));
    wrap(w.GPUAdapter?.prototype, 'requestDevice', () => api.blind('GPUAdapter.requestDevice', w));

    // (b) A same-origin child frame's realm, installed the moment this realm reaches it (its own init script also
    // installs, whichever comes first; a cross-origin frame throws and is left alone).
    const adopt = (cw) => {
      try {
        if (cw && cw !== w && !cw.__gateInstalled && cw.document) install(cw, api);
      } catch {
        /* cross-origin */
      }
    };
    for (const El of [w.HTMLIFrameElement, w.HTMLFrameElement, w.HTMLObjectElement]) {
      const P = El?.prototype;
      if (!P) continue;
      for (const prop of ['contentWindow', 'contentDocument']) {
        const d = Object.getOwnPropertyDescriptor(P, prop);
        if (!d?.get || d.get.__gate) continue;
        const get = function () {
          const v = d.get.call(this);
          adopt(prop === 'contentWindow' ? v : v?.defaultView);
          return v;
        };
        get.__gate = true;
        Object.defineProperty(P, prop, { ...d, get });
      }
    }

    // Layout reads inside rAF (W-F: no forced layout in the ticker). getBoundingClientRect is the one #11 names; the
    // others that force layout are counted beside it (round-3 should-fix S9).
    wrap(w.Element.prototype, 'getBoundingClientRect', () => api.rectRead());
    wrap(w.Element.prototype, 'getClientRects', () => api.layoutRead('getClientRects'));
    const gcs = w.getComputedStyle;
    if (typeof gcs === 'function' && !gcs.__gate) {
      const f = function (...a) {
        api.layoutRead('getComputedStyle');
        return gcs.apply(w, a);
      };
      f.__gate = true;
      w.getComputedStyle = f;
    }
    for (const [Proto, props] of [
      [w.HTMLElement.prototype, ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'offsetParent']],
      [w.Element.prototype, ['clientWidth', 'clientHeight', 'clientTop', 'clientLeft', 'scrollWidth', 'scrollHeight']],
    ]) {
      for (const p of props) {
        const d = Object.getOwnPropertyDescriptor(Proto, p);
        if (!d?.get || d.get.__gate) continue;
        const get = function () {
          api.layoutRead(p);
          return d.get.call(this);
        };
        get.__gate = true;
        Object.defineProperty(Proto, p, { ...d, get });
      }
    }
  }
})();
