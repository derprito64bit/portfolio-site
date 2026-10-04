// The hero's GPU bench (tests/w-s1 gpu, W-D030 GPU). Its own chunk: HeroCamera.bench() imports it on demand, so only
// the tests (and /bench/) ever load it, and the GL bytes every visitor downloads do not carry it (budgets.md, review
// round 2 must-fix 3).
import { Mesh, OrthographicCamera, PlaneGeometry, Scene } from 'three';
import type * as Develop from '../effects/develop/index.ts';

export interface BenchHooks {
  renderer: any;
  view: { W: number; Hc: number; dpr: number };
  /** Print 1's still, the image the bench prints carry. */
  stillSrc: string;
  lite: boolean;
  tier: string;
  develop: typeof Develop;
  stillTexture(src: string, w: number, h: number): Promise<any>;
  invalidate(): void;
}

/**
 * The hero's wet moment on the GPU: three hero-size prints (520 x 828 CSS px, the bench's hero3 size) developing at
 * once with this tier's develop shader, over the real canvas at its real DPR. Same method as /bench/: warm-up frames,
 * then readPixels-fenced frames; returns ms per frame.
 */
export async function benchHero(h: BenchHooks, opts: { warmup?: number; frames?: number } = {}): Promise<Record<string, unknown>> {
  const warmup = opts.warmup ?? 30;
  const frames = opts.frames ?? 60;
  const r = h.renderer;
  const { W, Hc: H, dpr } = h.view;
  const scene = new Scene();
  const cam = new OrthographicCamera(0, W, H, 0, -1, 1);
  const tex = await h.stillTexture(h.stillSrc, 520 * dpr, 828 * dpr);
  const geo = new PlaneGeometry(1, 1);
  const dev = h.develop;
  const mats = [0, 1, 2].map((i) => dev.createDevelopMaterial({ map: tex, lite: h.lite, seed: i * 0.37, grain: dev.grainScale(520 * dpr) }));
  mats.forEach((m, i) => {
    m.depthTest = false;
    const mesh = new Mesh(geo, m);
    mesh.scale.set(520, 828, 1);
    mesh.position.set(24 + i * (520 + 24) + 260, H - 24 - 414, 0);
    scene.add(mesh);
  });
  if (r.compileAsync) await r.compileAsync(scene, cam);
  const ctx = r.getContext() as WebGL2RenderingContext;
  const px = new Uint8Array(4);
  const samples: number[] = [];
  r.setRenderTarget(null);
  r.setScissorTest(false);
  r.setViewport(0, 0, W, H);
  for (let i = 0; i < warmup + frames; i++) {
    mats.forEach((m, k) => {
      m.uniforms.uD.value = ((i + k * 7) % 60) / 60;
      m.uniforms.uRoll.value = ((i + k * 11) % 30) / 30;
    });
    const a = performance.now();
    r.clear();
    r.render(scene, cam);
    ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    const b = performance.now();
    if (i >= warmup) samples.push(Math.round((b - a) * 1000) / 1000);
    // Yield a task every 10 frames, so the page stays responsive.
    if (i % 10 === 9) await new Promise((res) => setTimeout(res));
  }
  geo.dispose();
  mats.forEach((m) => m.dispose());
  tex.dispose();
  r.clear();
  h.invalidate();
  const sorted = [...samples].sort((x, y) => x - y);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  return { schema: 1, scenario: 'hero3-develop', shader: h.lite ? 'develop v1.1 LITE' : 'develop v1.1', tier: h.tier, dpr, canvas: { w: Math.round(W * dpr), h: Math.round(H * dpr) }, warmup, frames, medianMs: q(0.5), p95Ms: q(0.95), samples };
}
