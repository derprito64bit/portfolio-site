// Swap instrument (W-D015): page swaps never rebuild GL.
//  1. persistence: the same <canvas> element and the same WebGL context survive 6 Swup round trips (/bench/ <->
//     /bench/swap/), and renderer geometry and texture counts come back to their baseline;
//  2. scroll: Back restores the scroll position to +-1 px (home -> a print on the sheet -> project -> Back), and
//     Forward restores the project page's position.
// Usage: npm run h:swap -- [--profiles D2,P2] [--trips 6] [--out swap.json]
import { cliMain, newContext, serve, sleep, waitSettled } from '../lib.mjs';

const visitEnd = (page, path) => page.waitForFunction((p) => location.pathname === p && !document.documentElement.classList.contains('is-changing') && !document.documentElement.hasAttribute('aria-busy'), path, { polling: 50, timeout: 10000 });

export async function run(opts = {}) {
  const profiles = String(opts.profiles || 'D2,P2').split(',');
  const trips = Number(opts.trips) || 6;
  const srv = await serve();
  const rows = [];
  try {
    for (const profile of profiles) {
      const ctx = await newContext(profile);
      const page = await ctx.newPage();
      await page.goto(`${srv.base}/bench/`, { waitUntil: 'load' });
      await waitSettled(page, 15000);
      await page.waitForFunction(() => window.__stage.gl, null, { polling: 100, timeout: 15000 });
      await page.evaluate(() => {
        window.__canvas0 = document.getElementById('gl');
        window.__ctx0 = window.__stage.gl.renderer.getContext();
      });
      const baseline = await page.evaluate(() => window.__stage.gl.info());
      const trace = [];
      for (let i = 0; i < trips; i++) {
        await page.click('a[href="/bench/swap/"] >> nth=0');
        await visitEnd(page, '/bench/swap/');
        await waitSettled(page, 8000);
        trace.push({ trip: i + 1, at: 'swap', ...(await page.evaluate(() => window.__stage.gl.info())) });
        await page.click('a[href="/bench/"] >> nth=0');
        await visitEnd(page, '/bench/');
        await waitSettled(page, 8000);
        trace.push({ trip: i + 1, at: 'bench', ...(await page.evaluate(() => window.__stage.gl.info())) });
      }
      const after = await page.evaluate(() => ({ sameCanvas: document.getElementById('gl') === window.__canvas0, sameContext: window.__stage.gl.renderer.getContext() === window.__ctx0, swaps: window.__stage.stats.swaps, losses: window.__stage.stats.losses, info: window.__stage.gl.info() }));
      const countsBack = after.info.geometries === baseline.geometries && after.info.textures === baseline.textures && after.info.entities === baseline.entities;

      // Back and Forward restore scroll on real routes.
      await page.goto(`${srv.base}/`, { waitUntil: 'load' });
      await waitSettled(page, 12000);
      const link = page.locator('#sheet ~ ol a[data-gl-id]').nth(5);
      await link.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -37));
      await sleep(400);
      const yBefore = await page.evaluate(() => window.scrollY);
      await link.click();
      await visitEnd(page, '/work/project-06/');
      await page.evaluate(() => window.scrollTo(0, 120));
      await sleep(400);
      const yProject = await page.evaluate(() => window.scrollY);
      await page.goBack();
      await visitEnd(page, '/');
      await sleep(150);
      const yBack = await page.evaluate(() => window.scrollY);
      await page.goForward();
      await visitEnd(page, '/work/project-06/');
      await sleep(150);
      const yForward = await page.evaluate(() => window.scrollY);
      const backOk = Math.abs(yBack - yBefore) <= 1;
      const forwardOk = Math.abs(yForward - yProject) <= 1;

      rows.push({ profile, trips, baseline, after, trace, countsBack, scroll: { yBefore, yBack, yProject, yForward, backOk, forwardOk }, pass: after.sameCanvas && after.sameContext && countsBack && backOk && forwardOk });
      await ctx.close();
    }
  } finally {
    await srv.close();
  }
  return { schema: 1, instrument: 'swap', pass: rows.every((r) => r.pass), rows, summary: rows.map((r) => `${r.profile}: ${r.trips} round trips, same canvas ${r.after.sameCanvas}, same context ${r.after.sameContext}, counts back ${r.countsBack} (geo ${r.after.info.geometries}/${r.baseline.geometries}, tex ${r.after.info.textures}/${r.baseline.textures}); Back ${r.scroll.yBack} vs ${r.scroll.yBefore}, Forward ${r.scroll.yForward} vs ${r.scroll.yProject}`).join(' | ') };
}

await cliMain(import.meta.url, run);
