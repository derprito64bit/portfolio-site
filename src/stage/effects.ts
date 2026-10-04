// The effects API (W-F ships it as a no-op). Every call resolves at once with the final state, so crews can build
// against it today. W-S1 and W-C2 plug the real effects in with registerEffect(); callers never change.
// A no-op develop still exercises the handback (take, then give) and never touches focus.
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

const impls: Partial<Effects> = {};
const developed = new Set<string>();

export function registerEffect<K extends keyof Effects>(name: K, impl: Effects[K]): void {
  impls[name] = impl;
}
export function isDeveloped(id: string): boolean {
  return developed.has(id);
}

export const effects: Effects = {
  async develop(id, opts) {
    if (impls.develop) {
      const r = await impls.develop(id, opts);
      developed.add(id);
      return r;
    }
    take(id);
    give(id);
    developed.add(id);
    return { id, d: 1, developed: true };
  },
  async look(id, look) {
    return impls.look ? impls.look(id, look) : { id, look };
  },
  async meshReveal(id, on) {
    return impls.meshReveal ? impls.meshReveal(id, on) : { id, on };
  },
  async drip(opts) {
    return impls.drip ? impls.drip(opts) : { covered: true };
  },
};
