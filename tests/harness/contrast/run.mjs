// Contrast instrument (GPU-free, W-D007, W-D032): WCAG 2.x contrast for every text pair and every focus ring and
// surface pair in the tokens, plus a re-measure of the ratios tokens.json records. Text >= 4.5:1, rings >= 3:1.
// Usage: npm run h:contrast -- [--out contrast.json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, cliMain } from '../lib.mjs';

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

export async function run() {
  const t = JSON.parse(readFileSync(join(ROOT, 'content/tokens.json'), 'utf8')).colour;
  const L = t.light;
  const D = t.dark;
  const door = t.door;
  const amber = t.accent.amber;
  const deep = t.accent['amber-deep'];
  const ink = t.accent['on-accent'];
  const ls = t.focusBySurface.lightSurfaces;
  const ds = t.focusBySurface.darkSurfaces;
  const pairs = [
    // text (>= 4.5)
    ['text', 'ink on table', L.ink, L.table], ['text', 'ink on paper', L.ink, L.paper], ['text', 'ink on proof', L.ink, L.proof],
    ['text', 'ink-2 on table', L['ink-2'], L.table], ['text', 'ink-2 on table-lit', L['ink-2'], L['table-lit']], ['text', 'ink-2 on paper', L['ink-2'], L.paper],
    ['text', 'amber-deep on table', deep, L.table], ['text', 'amber-deep on paper', deep, L.paper],
    ['text', 'ink on amber', ink, amber], ['text', 'amber on darkroom', amber, door.darkroom],
    ['text', 'on-dark on darkroom', door['on-dark'], door.darkroom], ['text', 'on-dark-2 on darkroom', door['on-dark-2'], door.darkroom], ['text', 'on-dark-3 on darkroom', door['on-dark-3'], door.darkroom],
    ['text', 'dark: ink on table', D.ink, D.table], ['text', 'dark: ink-2 on table', D['ink-2'], D.table], ['text', 'dark: ink-2 on table-lit', D['ink-2'], D['table-lit']],
    ['text', 'dark: amber on table', amber, D.table], ['text', 'dark: light ink on paper (prints stay paper)', L.ink, D.paper],
    // focus rings (>= 3:1 against the surface, and the halo against the ring)
    ...['table', 'table-lit', 'paper', 'proof'].map((s) => ['ring', `light ring on ${s}`, ls['--focus'], L[s]]),
    ['ring', 'light ring on its halo', ls['--focus'], ls['--focus-halo']],
    ['ring', 'dark ring on darkroom', ds['--focus'], door.darkroom], ['ring', 'dark ring on dark table', ds['--focus'], D.table], ['ring', 'dark ring on dark table-lit', ds['--focus'], D['table-lit']],
    ['ring', 'dark ring on its halo', ds['--focus'], ds['--focus-halo']],
  ];
  const rows = pairs.map(([kind, use, fg, bg]) => {
    const r = ratio(fg, bg);
    const need = kind === 'text' ? 4.5 : 3;
    return { kind, use, fg, bg, ratio: Number(r.toFixed(2)), need, pass: r >= need };
  });
  // The ratios tokens.json records must still hold (within 0.05).
  const recorded = { 'ink on amber': [ink, amber], 'amber-deep on table': [deep, L.table], 'amber on darkroom': [amber, door.darkroom], 'ink-2 on table': [L['ink-2'], L.table], 'on-dark-3 on darkroom': [door['on-dark-3'], door.darkroom] };
  const drift = Object.entries(recorded).map(([k, [a, b]]) => ({ pair: k, recorded: t.contrastMeasured[k], measured: Number(ratio(a, b).toFixed(2)) })).filter((d) => Math.abs(d.recorded - d.measured) > 0.05);
  const failed = rows.filter((r) => !r.pass);
  return { schema: 1, instrument: 'contrast', pass: failed.length === 0 && drift.length === 0, rows, drift, informational: { 'amber on table (never text)': Number(ratio(amber, L.table).toFixed(2)) }, summary: `${rows.length} pairs, ${failed.length} below their bar; recorded ratios ${drift.length ? 'drifted' : 'hold'}` };
}

await cliMain(import.meta.url, run);
