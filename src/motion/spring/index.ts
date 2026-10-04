// ion-spring v1 (W-D010, W-D002): the exact closed-form step of a damped spring, for every GL value.
// One table (src/lib/tokens.js springs: press, detent, settle, lag), canonical as (Hz, zeta) at mass 1. The step is
// the analytic solution over dt, not an integrator, so a value lands on the same curve at 30, 60 or 144 Hz and through
// a hitch: the trajectory depends only on time. Peaks are found inside a step (where the velocity crosses zero), so a
// __motionLog record carries the true overshoot, not the frame-sampled one.
// Owner: W-S1 (v1), then W-C3. Pure maths: no DOM, no three, safe to run under node --test.
import { springs } from '../../lib/tokens.js';

export type SpringName = 'press' | 'detent' | 'settle' | 'lag';

export interface SpringParams {
  /** Undamped natural frequency in Hz. */
  hz: number;
  /** Damping ratio. */
  zeta: number;
}

const TAU = Math.PI * 2;

/** The table entry for a named spring, as (Hz, zeta). */
export function params(name: SpringName): SpringParams {
  const s = springs[name];
  return { hz: s.hz, zeta: s.zeta };
}

/** Analytic overshoot of a step response from rest, in percent (0 when critically damped or overdamped). */
export function overshootPct(p: SpringParams): number {
  if (p.zeta >= 1) return 0;
  return 100 * Math.exp((-p.zeta * Math.PI) / Math.sqrt(1 - p.zeta * p.zeta));
}

/**
 * Exact state of a spring after dt seconds. x is the displacement from the target, v its velocity (units per second).
 * Returns the new [x, v]. Handles under-, critically and over-damped springs.
 */
export function stepExact(x: number, v: number, dt: number, p: SpringParams): [number, number] {
  const w0 = TAU * p.hz;
  const z = p.zeta;
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    const e = Math.exp(-z * w0 * dt);
    const c = Math.cos(wd * dt);
    const s = Math.sin(wd * dt);
    const b = (v + z * w0 * x) / wd;
    return [e * (x * c + b * s), e * (v * c - ((w0 * w0 * x + z * w0 * v) / wd) * s)];
  }
  if (z === 1) {
    const e = Math.exp(-w0 * dt);
    const b = v + w0 * x;
    return [e * (x + b * dt), e * (v - w0 * b * dt)];
  }
  // Overdamped: two real roots r1 > r2 (both negative).
  const q = w0 * Math.sqrt(z * z - 1);
  const r1 = -z * w0 + q;
  const r2 = -z * w0 - q;
  const c2 = (v - r1 * x) / (r2 - r1);
  const c1 = x - c2;
  const e1 = Math.exp(r1 * dt);
  const e2 = Math.exp(r2 * dt);
  return [c1 * e1 + c2 * e2, c1 * r1 * e1 + c2 * r2 * e2];
}

/**
 * The extremum of x inside (0, dt], if the velocity crosses zero there (underdamped springs only): the displacement
 * and the time at that instant, or null.
 */
function extremumWithin(x: number, v: number, dt: number, p: SpringParams): { x: number; t: number } | null {
  if (p.zeta >= 1) return null;
  const w0 = TAU * p.hz;
  const z = p.zeta;
  const wd = w0 * Math.sqrt(1 - z * z);
  // v(t) = e^(-z w0 t) (v cos(wd t) - K sin(wd t)), K = (w0^2 x + z w0 v) / wd. Zero where tan(wd t) = v / K.
  const K = (w0 * w0 * x + z * w0 * v) / wd;
  let t = Math.atan2(v, K) / wd;
  if (t <= 1e-9) t += Math.PI / wd;
  if (t > dt) return null;
  return { x: stepExact(x, v, t, p)[0], t };
}

/** Settle tolerance: within 2% of the travel, as the tokens table's settle2Ms. */
export const SETTLE_FRACTION = 0.02;

/**
 * One animated value on a named spring. Drive it from the ticker's onStep hook: step(dt) returns true while it moves.
 * Retargeting keeps the velocity, so an interrupted motion continues smoothly (springs are interruptible).
 */
export class Spring {
  value: number;
  velocity = 0;
  target: number;
  readonly params: SpringParams;
  /** The extreme value reached since the last retarget, in the direction of travel (for __motionLog peaks). */
  peak: number;
  /** The value the last retarget started from. */
  from: number;
  private elapsed = 0;
  /** Last time (s since the retarget) the value was outside 2% of the travel. */
  private lastOutside = 0;
  private resting = true;
  /** Rest threshold in value units (also below which the spring snaps to the target). */
  private readonly epsilon: number;
  readonly name: SpringName | 'custom';

  // No parameter properties: node --test runs this file with type stripping only.
  constructor(name: SpringName | 'custom', value = 0, custom?: SpringParams, epsilon = 1e-4) {
    this.name = name;
    this.params = custom ?? params(name as SpringName);
    this.value = value;
    this.target = value;
    this.from = value;
    this.peak = value;
    this.epsilon = epsilon;
  }

  /** Move toward a new target from the current state (velocity is kept). */
  to(target: number): this {
    this.from = this.value;
    this.target = target;
    this.peak = this.value;
    this.elapsed = 0;
    this.lastOutside = 0;
    this.resting = this.value === target && this.velocity === 0;
    return this;
  }

  /** Jump to a value with no motion (reduced motion, snaps). */
  set(value: number): this {
    this.value = value;
    this.target = value;
    this.from = value;
    this.peak = value;
    this.velocity = 0;
    this.elapsed = 0;
    this.lastOutside = 0;
    this.resting = true;
    return this;
  }

  get atRest(): boolean {
    return this.resting;
  }

  /** Milliseconds from the last retarget until the value stayed within 2% of the travel (final once at rest). */
  get settle2Ms(): number {
    return Math.round(this.lastOutside * 1000);
  }

  /** Overshoot past the target as a percentage of the travel (0 for no travel). */
  get overshootPct(): number {
    const travel = this.target - this.from;
    if (Math.abs(travel) < 1e-12) return 0;
    return Math.max(0, ((this.peak - this.target) / travel) * 100);
  }

  /** Advance dt seconds. Returns true while the value is still moving. */
  step(dt: number): boolean {
    if (this.resting) return false;
    const x0 = this.value - this.target;
    const travel = this.target - this.from;
    const tol = SETTLE_FRACTION * Math.abs(travel);
    const ext = extremumWithin(x0, this.velocity, dt, this.params);
    const [x, v] = stepExact(x0, this.velocity, dt, this.params);
    const dir = Math.sign(travel) || 1;
    if (ext) {
      const val = this.target + ext.x;
      if ((val - this.peak) * dir > 0) this.peak = val;
    }
    // 2% settle: the exact instant inside this step where |x| last falls to the tolerance (bisection on the exact
    // solution), so the time does not depend on the frame rate.
    const outA = Math.abs(x0) > tol ? 0 : ext && Math.abs(ext.x) > tol ? ext.t : -1;
    if (Math.abs(x) > tol) this.lastOutside = this.elapsed + dt;
    else if (outA >= 0) {
      let lo = outA;
      let hi = dt;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (Math.abs(stepExact(x0, this.velocity, mid, this.params)[0]) > tol) lo = mid;
        else hi = mid;
      }
      this.lastOutside = this.elapsed + lo;
    }
    this.elapsed += dt;
    this.value = this.target + x;
    this.velocity = v;
    if ((this.value - this.peak) * dir > 0) this.peak = this.value;
    if (Math.abs(x) < this.epsilon && Math.abs(v) < this.epsilon * 10) {
      this.value = this.target;
      this.velocity = 0;
      this.resting = true;
      return false;
    }
    return true;
  }
}

/**
 * Sample a step response 0 -> 1 from rest at a fixed rate (Hz), with an optional hitch (one long frame). Used by the
 * conformance test (tests/w-s1) and spring-conformance.json: the same curve at 30, 60 and 144 Hz.
 */
export function sampleStep(name: SpringName, rateHz: number, opts: { hitchMs?: number; hitchAt?: number; seconds?: number } = {}): {
  overshootPct: number;
  settle2Ms: number;
  maxAbsErr: number;
} {
  const p = params(name);
  const s = new Spring(name, 0, undefined, 1e-7).to(1);
  const seconds = opts.seconds ?? 2;
  let t = 0;
  let maxAbsErr = 0;
  let frame = 0;
  while (t < seconds && !s.atRest) {
    const dt = opts.hitchMs && frame === (opts.hitchAt ?? 10) ? opts.hitchMs / 1000 : 1 / rateHz;
    s.step(dt);
    t += dt;
    frame++;
    if (s.atRest) break;
    // The analytic step response from rest at time t.
    const [x] = stepExact(-1, 0, t, p);
    maxAbsErr = Math.max(maxAbsErr, Math.abs(s.value - (1 + x)));
  }
  return { overshootPct: Math.round(s.overshootPct * 1000) / 1000, settle2Ms: s.settle2Ms, maxAbsErr };
}
