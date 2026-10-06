// Running timelines. Every automatic motion registers here, so the live motion axis can end all of them at once
// (W-D017) and __stage.seek can drive them on the manual clock (W-D030).
import { guard, now } from './state.ts';

export interface Timeline {
  id: string;
  /** Jump to the end state. */
  finish(): void;
  /** False once finished. */
  readonly active: boolean;
  /** Optional: render the state at `ms` on the stage clock (seeked filmstrips). */
  seek?(ms: number): void;
}

const running = new Set<Timeline>();
let wake: () => void = () => {};
export function bindWake(fn: () => void): void {
  wake = fn;
}

export function track(t: Timeline): () => void {
  running.add(t);
  wake();
  return () => running.delete(t);
}
// Each timeline runs under guard() on its own (Breaker 2.1 #1): one that throws is reported and counted in
// stats.hookErrors, and the others still finish, step and seek. A timeline whose `active` throws is finished (its end
// state, guarded too) and dropped, so it can neither keep the ticker awake nor stop the frame before its render.
/** t.active under guard. A throw finishes the timeline (guarded) and reads as false, so the caller drops it. */
function readActive(t: Timeline): boolean {
  let threw = true;
  const on = guard(() => {
    const v = t.active;
    threw = false;
    return v;
  }, false);
  if (threw) guard(() => t.finish(), undefined);
  return on;
}
export function finishAll(): number {
  let n = 0;
  for (const t of [...running]) {
    if (readActive(t)) {
      guard(() => t.finish(), undefined);
      n++;
    }
  }
  running.clear();
  return n;
}
export function anyActive(): boolean {
  for (const t of running) if (!readActive(t)) running.delete(t);
  return running.size > 0;
}
export function seekAll(ms: number): void {
  for (const t of running) guard(() => t.seek?.(ms), undefined);
}

/** A plain eased tween on the stage clock, for fixtures and simple DOM-free values. */
export function tween(opts: {
  id: string;
  from: number;
  to: number;
  duration: number;
  ease?: (t: number) => number;
  onUpdate: (v: number) => void;
}): Timeline {
  const t0 = now();
  const ease = opts.ease ?? ((t: number) => t);
  let done = false;
  const timeline: Timeline = {
    id: opts.id,
    get active() {
      if (done) return false;
      const p = Math.min(1, (now() - t0) / opts.duration);
      opts.onUpdate(opts.from + (opts.to - opts.from) * ease(p));
      if (p >= 1) done = true;
      return !done;
    },
    finish() {
      done = true;
      opts.onUpdate(opts.to);
    },
    seek(ms: number) {
      const p = Math.min(1, Math.max(0, (ms - t0) / opts.duration));
      opts.onUpdate(opts.from + (opts.to - opts.from) * ease(p));
    },
  };
  track(timeline);
  return timeline;
}
