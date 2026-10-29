// The engine's frame counters (#92; D-053, D-055). They exist only under ?vf-test (src/evf/testhooks.ts): without it the
// engine's `stats` is null, nothing here is allocated, and each pass costs one null check. Each channel counts the GL
// draw calls that rendered its pass, at the call itself, so a skipped pass counts 0:
//   scene      the current frame's procedural scene into its render target (the EVF and the raise);
//   composite  the graded frame onto the screen;
//   eyepiece   the intro snapshot and the scene through the eyepiece onto the screen (the raise);
//   readback   the 64 x 40 metering render (its readPixels runs at the start of the next drawn frame).
// `frames` counts the frames that reached the screen: every drawn frame clears and presents the canvas, also when no
// pass ran in it (the frame is hidden: alpha 0, or no scene yet). Integer increments only; no allocation per frame.
export interface FrameCounts { frames: number; scene: number; composite: number; eyepiece: number; readback: number }

export const CHANNELS = ['scene', 'composite', 'eyepiece', 'readback'] as const;

export const newCounts = (): FrameCounts => ({ frames: 0, scene: 0, composite: 0, eyepiece: 0, readback: 0 });
