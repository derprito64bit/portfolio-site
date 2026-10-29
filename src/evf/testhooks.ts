// Test hooks (D-055). window.__vf, window.__vfEngine and the engine's frame counters attach only when the page's URL has
// ?vf-test, read once at boot. Without it there is no global, no stats object and no counting work per frame: the hooks
// are no-ops and the engine is built with stats off. This file is the only place in src/ that names the globals
// (scripts/check/lint.mjs enforces it); tests/unit/evf/testhooks.test.mjs checks both ways.
// The API keeps the concept's shape (go, openProject, closeProject, lower, raise, setSim, state, pos) plus stats() and
// resetStats(), which read the counters (tests/harness/idle, tests/smoke, the W-V1 to W-V3 gates).
import type { FrameCounts } from './gl/stats';

export const TEST_PARAM = 'vf-test';

/** True when the query string names vf-test (`?vf-test`, `?vf-test=1`, `?a=1&vf-test`). The hash never counts. */
export const isTestMode = (search: string): boolean => new URLSearchParams(search).has(TEST_PARAM);

export interface VfControls {
  go: (to: number, dir?: number) => void;
  openProject: () => void;
  closeProject: () => void;
  lower: () => void;
  raise: () => void;
  setSim: (i: number) => void;
  state: () => string;
  pos: () => number;
}

/** What stats() returns: the counts since the last resetStats() (or since boot), over `ms` milliseconds. */
export interface StatsSnapshot extends FrameCounts {
  /** Milliseconds since the counters were last reset. */
  ms: number;
  /** False on the flat-frame path (no WebGL engine): every count is 0 there. */
  engine: boolean;
}

interface Counted { stats: FrameCounts | null }

export interface TestHooks {
  /** Build the engine with frame counters (true only under ?vf-test). */
  readonly stats: boolean;
  /** Expose the engine as window.__vfEngine (only under ?vf-test). */
  engine: (e: Counted) => void;
  /** Expose window.__vf (only under ?vf-test); `engine` returns the live engine or null. */
  attach: (controls: VfControls, engine: () => Counted | null) => void;
}

const OFF: TestHooks = Object.freeze({ stats: false, engine: () => {}, attach: () => {} });

/** Reads the query once; off, every hook is a no-op and nothing is attached. */
export function testHooks(win: object, search: string, now: () => number = () => performance.now()): TestHooks {
  if (!isTestMode(search)) return OFF;
  const w = win as Record<string, unknown>;
  let since = now();
  return {
    stats: true,
    engine: (e) => { w.__vfEngine = e; },
    attach: (controls, engine) => {
      w.__vf = {
        ...controls,
        stats: (): StatsSnapshot => {
          const s = engine()?.stats ?? null;
          return {
            frames: s?.frames ?? 0, scene: s?.scene ?? 0, composite: s?.composite ?? 0, eyepiece: s?.eyepiece ?? 0, readback: s?.readback ?? 0,
            ms: now() - since, engine: Boolean(s),
          };
        },
        resetStats: () => {
          const s = engine()?.stats;
          if (s) s.frames = s.scene = s.composite = s.eyepiece = s.readback = 0;
          since = now();
        },
      };
    },
  };
}
