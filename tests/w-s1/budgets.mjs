// The acceptance numbers no token holds, read from the locked documents at run time (A2: no literal duration or budget
// in tests/w-s1). Each one is found by its sentence, so a reworded budget fails loudly here instead of the suite
// silently testing an old number. When the orchestrator lands a machine-readable budgets block (round 2 review), this
// reader switches to it and keeps its shape.
//   docs/agents/budgets.md              pre-GL JS, GL chunk, the automatic-motion cap, the delayed-GL line
//   docs/direction/front-door-plan.md   W-D012's head script size; the W-S1 brief's poster parity
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { H } from './lib.mjs';

const read = (file) => readFileSync(join(H.ROOT, file), 'utf8');
/** The first capture of `re` in `file`, as a number (thousands separators dropped). Throws when the sentence is gone. */
function find(file, text, re, what) {
  const m = re.exec(text);
  if (!m) throw new Error(`budgets: ${what} not found in ${file} (${re})`);
  return Number(m[1].replace(/,/g, ''));
}

export function loadBudgets() {
  const budgets = read('docs/agents/budgets.md');
  const plan = read('docs/direction/front-door-plan.md');
  const b = (re, what) => find('docs/agents/budgets.md', budgets, re, what);
  const p = (re, what) => find('docs/direction/front-door-plan.md', plan, re, what);
  return {
    /** "pre-GL JS <= 35 kB gz, summed from the network log before the stage:gl-start mark". */
    preGlBytes: b(/pre-GL JS <= ([\d.]+) kB gz/, 'pre-GL JS') * 1000, // kB to bytes, as budgets.md counts them
    /** "GL chunk (three, addons, anime, stage GL, effects) <= 185 kB gz". */
    glBytes: b(/GL chunk \(three, addons, anime, stage GL, effects\) <= ([\d.]+) kB gz/, 'GL chunk') * 1000, // kB to bytes, as budgets.md counts them
    /** "No automatic motion over 5 s". */
    motionCapMs: b(/No automatic motion over ([\d.]+) s\b/, 'automatic motion cap') * 1000, // s to ms
    /** "With GL delayed 3 s, a developed print 1 is visible by FCP + 2.6 s". */
    delayGlMs: b(/With GL delayed ([\d.]+) s,/, 'delayed GL') * 1000, // s to ms
    printVisibleAfterFcpMs: b(/visible by FCP \+ ([\d.]+) s\b/, 'print 1 after FCP') * 1000, // s to ms
    /** W-D012: "An inline head script (no fetch, under 0.8 kB with data-cam)". */
    headScriptBytes: p(/inline head script \(no fetch, under ([\d.]+) kB/, 'head script') * 1000, // kB to bytes, as budgets.md counts them
    /** The W-S1 brief: "Poster vs first GL frame: mean diff <= 4/255". */
    parityMax: p(/Poster vs first GL frame: mean diff <= ([\d.]+)\/255/, 'poster parity'),
  };
}
