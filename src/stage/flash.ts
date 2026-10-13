// One global flash limiter (W-D011, W-D032): automatic flashes and shutter presses, key repeat included, share it.
// At most one flash per durations.flashMinGap, none under reduced motion. Callers that get false skip the flash, not
// the action. The logged peak is W-D011's flash shape (tokens: flash.peakOpacity at flash.peakAtMs).
import { durations, flash } from '../lib/tokens.js';
import { isReduced } from './motion.ts';
import { getTier } from './tier.ts';
import { logMotion, now } from './state.ts';

let last = -Infinity;

export function requestFlash(trigger: string, id = 'flash'): boolean {
  const t = now();
  if (isReduced() || t - last < durations.flashMinGap) return false;
  last = t;
  logMotion({ id, kind: 'flash', spring: null, trigger, t0: t, t1: t + durations.flash, from: 0, to: 0, peak: flash.peakOpacity, settle2Ms: null, tier: getTier(), reduced: false });
  return true;
}
