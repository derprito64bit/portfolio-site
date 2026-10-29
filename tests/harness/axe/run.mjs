// axe instrument (W-V0a): @axe-core/playwright on the WCAG tags over every state of the Viewfinder that a person can
// reach with the page's own inputs, and the 404 page. 0 violations of any impact (budgets.md: axe 0; the json budgets
// block's zero.axeViolationsWcag). Incomplete results are reported, not failed.
//   states of /: the intro, the raised EVF (Enter), the open project (Enter on
//   Open, with the dialog up). Profiles D2 and P2 (390 wide), plus R1 (320 wide) on the intro and the 404.
// Usage: npm run h:axe -- [--profiles D2,P2,R1] [--out axe.json]
import { AxeBuilder } from '@axe-core/playwright';
import { budget, cliMain, newContext, serve, sleep, waitSettled } from '../lib.mjs';

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function scan(page, label, rows) {
  const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  rows.push({
    state: label,
    violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) })),
    incomplete: r.incomplete.map((x) => x.id),
    passes: r.passes.length,
  });
}

export async function run(opts = {}) {
  const profiles = String(opts.profiles || 'D2,P2,R1').split(',');
  const max = budget('site.zero.axeViolationsWcag');
  const srv = await serve();
  const rows = [];
  try {
    for (const profile of profiles) {
      const ctx = await newContext(profile);
      const page = await ctx.newPage();
      await page.goto(`${srv.base}/`, { waitUntil: 'load' });
      await waitSettled(page, 15000);
      await scan(page, `${profile} / intro`, rows);
      if (profile !== 'R1') {
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.getElementById('intro')?.hidden === true, null, { timeout: 30000 });
        await sleep(300);
        await scan(page, `${profile} / raised`, rows);
        await page.focus('[data-open]');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => !document.getElementById('proj')?.hidden && Boolean(document.activeElement?.closest('#proj')), null, { timeout: 30000 });
        await scan(page, `${profile} / open project`, rows);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('proj')?.hidden === true, null, { timeout: 30000 });
      }
      await page.goto(`${srv.base}/404.html`, { waitUntil: 'load' });
      await scan(page, `${profile} /404.html`, rows);
      await ctx.close();
    }
  } finally {
    await srv.close();
  }
  const total = rows.reduce((n, r) => n + r.violations.length, 0);
  return {
    schema: 1, instrument: 'axe', pass: total <= max && rows.length > 0, tags: AXE_TAGS, rows,
    summary: `${rows.length} states, ${total} violations${total ? `: ${rows.flatMap((r) => r.violations.map((v) => `${r.state} ${v.id}`)).join(', ')}` : ''}; ${rows.reduce((n, r) => n + r.incomplete.length, 0)} incomplete`,
  };
}

await cliMain(import.meta.url, run);
