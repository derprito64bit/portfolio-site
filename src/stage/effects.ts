// The effects API (W-F ships it as a no-op). Every call resolves at once with the final state, so crews can build
// against it today. Crews plug the real effects in with registerEffect() (W-S2 registers 'develop' from src/gl/prints
// after stage:gl-start through window.__stage.registerEffect, #14 ruling 2; W-C2 may re-register it with the looks);
// callers never change. A no-op develop still exercises the handback (take, then give) and never touches focus.
import { give, take } from './slots.ts';

export interface DevelopResult { id: string; d: 1; developed: true }
export interface LookResult { id: string; look: string }
export interface MeshRevealResult { id: string; on: boolean }
export interface DripResult { covered: true }

export interface Effects {
  /** Develop a print to its baked still (d = 1). Each print develops once per session. */
  develop(id: string, opts?: { duration?: number; trigger?: string }): Promise<DevelopResult>;
  /** Re-grade a print to a film look id (tokens filmLooks). */
  look(id: string, look: string): Promise<LookResult>;
  /** Show or hide the mesh of an exhibit. */
  meshReveal(id: string, on: boolean): Promise<MeshRevealResult>;
  /** The handoff ink drip. The real one raises the canvas to z 41 for its 520 ms. */
  drip(opts?: { trigger?: string }): Promise<DripResult>;
}

type Maybe<T> = T | undefined | Promise<T | undefined>;
/**
 * A registered effect: the call's own arguments, then `next`, the implementation it replaced (the one registered before
 * it, or the built-in no-op). An impl serves its own ids and hands every other id on (`return next(id, opts)`), or
 * returns undefined to fall through to `next` with the same arguments, so it never needs to import src/stage to give
 * other ids the no-op (take, then give).
 */
export interface EffectImpls {
  develop(id: string, opts: { duration?: number; trigger?: string } | undefined, next: Effects['develop']): Maybe<DevelopResult>;
  look(id: string, look: string, next: Effects['look']): Maybe<LookResult>;
  meshReveal(id: string, on: boolean, next: Effects['meshReveal']): Maybe<MeshRevealResult>;
  drip(opts: { trigger?: string } | undefined, next: Effects['drip']): Maybe<DripResult>;
}

/** The built-in no-ops: the bottom of every chain. */
const defaults: Effects = {
  async develop(id) {
    take(id);
    give(id);
    return { id, d: 1, developed: true };
  },
  async look(id, look) {
    return { id, look };
  },
  async meshReveal(id, on) {
    return { id, on };
  },
  async drip() {
    return { covered: true };
  },
};
/** The implementation each effect runs now: the latest registration, chained to the ones before it. */
const current: Effects = { ...defaults };
const developed = new Set<string>();

/**
 * Plug a real effect in behind effects.<name>(): it receives the call's arguments and then the implementation it
 * replaces. Registering again chains: the newest runs first, and its `next` is the one before it.
 */
export function registerEffect<K extends keyof Effects>(name: K, impl: EffectImpls[K]): void {
  const next = current[name] as (...a: unknown[]) => Promise<unknown>;
  const run = impl as unknown as (...a: unknown[]) => unknown;
  (current as unknown as Record<string, unknown>)[name] = async (...args: unknown[]) => {
    const r = await run(...args, next);
    return r === undefined ? next(...args) : r;
  };
}
export function isDeveloped(id: string): boolean {
  return developed.has(id);
}

export const effects: Effects = {
  async develop(id, opts) {
    const r = await current.develop(id, opts);
    developed.add(id);
    return r;
  },
  look: (id, look) => current.look(id, look),
  meshReveal: (id, on) => current.meshReveal(id, on),
  drip: (opts) => current.drip(opts),
};
