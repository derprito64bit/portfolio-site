// Gate-owned counters (W-D030), installed with page.addInitScript before any page script runs. They count what the
// browser actually did, independent of the stage's own __stage.stats, so the two can be cross-checked.
(() => {
  const C = (window.__gateCounters = { raf: 0, rafRequests: 0, rafByDependency: {}, draws: 0, rectReads: 0, rectReadsInRaf: 0 });
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
        return orig.apply(this, a);
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
