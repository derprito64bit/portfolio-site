// Contrast instrument (GPU-free, W-D007, W-V0a): WCAG 2.x contrast for the Viewfinder's text pairs and its focus ring,
// read from the custom properties in src/evf/style.css (:root), so a palette change is measured, not assumed. The 404
// page uses the same values. Text >= 4.5:1, the focus ring >= 3:1 (budgets.md; ring contrast from the json budgets block).
// Usage: npm run h:contrast -- [--out contrast.json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, budget, cliMain } from '../lib.mjs';

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The hex custom properties of the first :root block of a stylesheet. */
export function rootColours(css) {
  const block = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]));
}

export async function run() {
  const c = rootColours(readFileSync(join(ROOT, 'src/evf/style.css'), 'utf8'));
  for (const k of ['--black', '--panel', '--ink', '--ink-2', '--ink-3', '--phos']) if (!c[k]) throw new Error(`contrast: ${k} is not a hex custom property in src/evf/style.css :root`);
  const ringMin = budget('site.focusRing.contrastMin');
  const pairs = [];
  for (const bg of ['--black', '--panel']) {
    for (const fg of ['--ink', '--ink-2', '--ink-3', '--phos']) pairs.push(['text', `${fg} on ${bg}`, c[fg], c[bg]]);
  }
  pairs.push(['ring', 'focus ring (--phos) on --black', c['--phos'], c['--black']], ['ring', 'focus ring (--phos) on --panel', c['--phos'], c['--panel']]);
  // The skip link and the 404 page: ink on black is covered above; the skip link is ink-on-light inverted.
  pairs.push(['text', 'skip link: --black on --ink', c['--black'], c['--ink']]);
  const rows = pairs.map(([kind, use, fg, bg]) => {
    const r = ratio(fg, bg);
    const need = kind === 'text' ? 4.5 : ringMin;
    return { kind, use, fg, bg, ratio: Number(r.toFixed(2)), need, pass: r >= need };
  });
  const failed = rows.filter((r) => !r.pass);
  return {
    schema: 2, instrument: 'contrast', pass: failed.length === 0, rows,
    summary: `${rows.length} pairs; ${failed.length ? `FAILING: ${failed.map((r) => `${r.use} ${r.ratio}`).join(', ')}` : `lowest ${Math.min(...rows.map((r) => r.ratio))}:1`}`,
  };
}

await cliMain(import.meta.url, run);
