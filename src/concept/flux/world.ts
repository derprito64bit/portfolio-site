// Shared state for the Flux page: one clock, one pointer, one scroll.
import type { Engine, Drop } from './gl/engine';
import type { Texture } from 'ogl';

export const world = {
  engine: null as Engine | null,
  rm: false,
  phone: false,
  coarse: false,
  W: 1,
  H: 1,
  t: 0,
  pointer: { x: -9999, y: -9999, vx: 0, vy: 0, speed: 0, seen: false, down: false, moved: false },
  scrollY: 0,
  scrollV: 0,
  pull: 0, // intro to work: 0..1
  phase: 'loading' as 'loading' | 'intro' | 'open',
  covers: [] as Texture[],
  coverCanvases: [] as HTMLCanvasElement[],
  lenis: null as any,
};

/** Field space (height 1, y up, scrolled) from css px. */
export function toField(x: number, y: number): [number, number] {
  const e = world.engine;
  const aspect = world.W / world.H;
  const fx = (x / world.W - 0.5) * aspect;
  const fy = 0.5 - y / world.H - (e ? e.scroll : 0);
  return [fx, fy];
}
/** css px from field space. */
export function fromField(fx: number, fy: number): [number, number] {
  const e = world.engine;
  const aspect = world.W / world.H;
  return [(fx / aspect + 0.5) * world.W, (0.5 - (fy + (e ? e.scroll : 0))) * world.H];
}

/** Drops ink at a css px point: rings spread from it and push the surface aside. */
export function dropInk(x: number, y: number, size = 0.09, vivid = 1): Drop | null {
  const e = world.engine;
  if (!e) return null;
  let [fx, fy] = toField(x, y);
  // land exactly under the pointer, wherever the surface has been carried
  const [dx, dy] = e.sampleD(x, y);
  fx += dx * (world.W / world.H);
  fy += dy;
  const d: Drop = { x: fx, y: fy, r: 0.0001, k: 7.5, vivid };
  e.drops.push(d);
  (d as any).born = world.t;
  (d as any).size = size;
  (d as any).life = 9;
  return d;
}
