// Shared stage state: the counters the gate cross-checks (__stage.stats), the clock and the user-timing marks.

/** Counters read by tests/harness/counters and GES-1 manifests. Every field only ever grows, except the gauges. */
export const stats = {
  /** rAF callbacks run by the ticker (the only rAF call site in src/). */
  ticks: 0,
  /** Frames that rendered (ticker frames plus layout renders). */
  draws: 0,
  /** Renders run from the slots ResizeObserver callback because layout moved a slot (outside rAF; also in draws). */
  layoutRenders: 0,
  /** Canvas re-anchors (the rail moved the canvas to keep it over the viewport). */
  reanchors: 0,
  /** Frames presented again after a frame that drew something new (WebKit shows a canvas one frame late; #61). */
  tailFrames: 0,
  /** Active frames that skipped the render: nothing to draw and the canvas already clear. */
  renderSkips: 0,
  /** WebGL draw calls issued by those frames (renderer.info.render.calls, summed). */
  drawCalls: 0,
  /** Slot re-measures, and how many of them ran inside a ticker frame. */
  measures: 0,
  measuresInTick: 0,
  /** Canvas drawing-buffer reallocations. */
  reallocs: 0,
  wakes: 0,
  sleeps: 0,
  swaps: 0,
  losses: 0,
  restores: 0,
  governorSteps: 0,
  motionLogInvalid: 0,
  /** Gauges. */
  dpr: 0,
  canvasPx: 0,
  /** The drawing buffer in pixels (floor(W x dpr) by floor(Hc x dpr)). */
  canvasW: 0,
  canvasH: 0,
};

const query = new URLSearchParams(location.search);
/** Test-only switches. ?t=<ms> runs the stage on a manual clock driven by __stage.seek(ms). */
export const flags = {
  manualClock: query.has('t'),
  startMs: Number(query.get('t')) || 0,
  /** ?busy=<ms> spins each active frame for that long (governor tests). */
  busyMs: Math.max(0, Number(query.get('busy')) || 0),
  /** ?debug=drift draws flat debug colours in the fixtures (drift harness). */
  debug: query.get('debug') || '',
  /** ?notail turns the present tail off (the negative control of the WebKit present check, #61). */
  noTail: query.has('notail'),
};

let manualNow = flags.startMs;
/** The one clock for stage timelines. */
export function now(): number {
  return flags.manualClock ? manualNow : performance.now();
}
export function setManualNow(ms: number): void {
  manualNow = ms;
}

/** A user-timing mark with detail, plus a 'name=value' twin that Lighthouse's user-timings audit can show. */
export function mark(name: string, value?: string): void {
  try {
    performance.mark(name, value === undefined ? undefined : { detail: { value } });
    if (value !== undefined) performance.mark(`${name}=${value}`);
  } catch {
    /* marks are evidence only */
  }
}

// ---------------------------------------------------------------- __motionLog (W-D030 schema)
export interface MotionEntry {
  id: string;
  kind: string;
  spring: string | null;
  trigger: string;
  t0: number;
  t1: number;
  from: number;
  to: number;
  peak: number;
  settle2Ms: number | null;
  tier: string;
  reduced: boolean;
}
const MOTION_KEYS: (keyof MotionEntry)[] = ['id', 'kind', 'spring', 'trigger', 't0', 't1', 'from', 'to', 'peak', 'settle2Ms', 'tier', 'reduced'];

declare global {
  interface Window {
    __motionLog: MotionEntry[];
  }
}
window.__motionLog = window.__motionLog || [];

/** Append one motion record. Records that break the schema are counted and dropped, never thrown. */
export function logMotion(entry: MotionEntry): boolean {
  const ok =
    MOTION_KEYS.every((k) => k in entry) &&
    Object.keys(entry).length === MOTION_KEYS.length &&
    typeof entry.id === 'string' &&
    typeof entry.kind === 'string' &&
    (entry.spring === null || typeof entry.spring === 'string') &&
    typeof entry.trigger === 'string' &&
    [entry.t0, entry.t1, entry.from, entry.to, entry.peak].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    (entry.settle2Ms === null || Number.isFinite(entry.settle2Ms)) &&
    typeof entry.tier === 'string' &&
    typeof entry.reduced === 'boolean' &&
    entry.t1 >= entry.t0;
  if (!ok) {
    stats.motionLogInvalid++;
    return false;
  }
  window.__motionLog.push(entry);
  if (window.__motionLog.length > 500) window.__motionLog.splice(0, window.__motionLog.length - 500);
  return true;
}
