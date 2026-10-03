// The committed GPU bench (W-D003, W-D030): ms per frame at the real canvas size, with readPixels fences, on the
// pages that carry [data-bench]. tests/harness/gpu calls __bench.run() on fresh loads; a person can press Run on
// /bench/ and copy the JSON. Scenarios use the probe's wet-print stand-in until the develop shader lands (W-C2).
import { Mesh, OrthographicCamera, PlaneGeometry, Scene } from 'three';
import { HERO, wetMaterial } from './probe.ts';
import { view } from '../rail.ts';
import { getTier } from '../tier.ts';
import type { GLApi } from './index.ts';

export interface BenchResult {
  schema: 1;
  scenario: string;
  renderer: string;
  tier: string;
  dpr: number;
  canvas: { w: number; h: number; px: number };
  warmup: number;
  frames: number;
  medianMs: number;
  p95Ms: number;
  meanMs: number;
  samples: number[];
  shader: string;
  at: string;
}

/** Print sizes in CSS px per scenario: the hero's three wet prints, and eight wet sheet prints (W-D031, 4 columns). */
const SCENARIOS: Record<string, { w: number; h: number; n: number; cols: number }> = {
  hero3: { w: HERO.w, h: HERO.h, n: 3, cols: 3 },
  sheet8: { w: 300, h: Math.round((300 * 86) / 54), n: 8, cols: 4 },
};

export function install(gl: GLApi): void {
  async function run(opts: { scenario?: string; warmup?: number; frames?: number } = {}): Promise<BenchResult> {
    const scenario = opts.scenario ?? 'sheet8';
    const spec = SCENARIOS[scenario];
    if (!spec) throw new Error(`unknown scenario ${scenario}`);
    const warmup = opts.warmup ?? 30;
    const frames = opts.frames ?? 60;
    const r = gl.renderer;
    const scene = new Scene();
    const W = view.W;
    const H = view.Hc;
    const cam = new OrthographicCamera(0, W, H, 0, -1, 1);
    const geo = new PlaneGeometry(1, 1);
    const mats = Array.from({ length: spec.n }, (_, i) => wetMaterial(i * 3.7));
    mats.forEach((m, i) => {
      const mesh = new Mesh(geo, m);
      const col = i % spec.cols;
      const row = Math.floor(i / spec.cols);
      mesh.scale.set(spec.w, spec.h, 1);
      mesh.position.set(24 + col * (spec.w + 24) + spec.w / 2, H - 24 - row * (spec.h + 24) - spec.h / 2, 0);
      scene.add(mesh);
    });
    if (r.compileAsync) await r.compileAsync(scene, cam);
    const ctx = r.getContext() as WebGL2RenderingContext;
    const px = new Uint8Array(4);
    const samples: number[] = [];
    r.setRenderTarget(null);
    r.setViewport(0, 0, W, H);
    for (let i = 0; i < warmup + frames; i++) {
      mats.forEach((m, k) => (m.uniforms.uDev.value = ((i + k * 7) % 60) / 60));
      const a = performance.now();
      r.clear();
      r.render(scene, cam);
      ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
      const b = performance.now();
      if (i >= warmup) samples.push(Math.round((b - a) * 1000) / 1000);
      if (i % 10 === 9) await new Promise((res) => setTimeout(res, 0));
    }
    geo.dispose();
    mats.forEach((m) => m.dispose());
    r.clear();
    const sorted = [...samples].sort((x, y) => x - y);
    const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
    return {
      schema: 1,
      scenario,
      renderer: gl.rendererName,
      tier: getTier(),
      dpr: view.dpr,
      canvas: { w: Math.round(W * view.dpr), h: Math.round(H * view.dpr), px: Math.round(W * view.dpr) * Math.round(H * view.dpr) },
      warmup,
      frames,
      medianMs: q(0.5),
      p95Ms: q(0.95),
      meanMs: Math.round((samples.reduce((x, y) => x + y, 0) / samples.length) * 1000) / 1000,
      samples,
      shader: 'stand-in wet print (noise fbm, layered mix) until the develop shader lands',
      at: new Date().toISOString(),
    };
  }

  (window as unknown as { __bench: unknown }).__bench = { run, scenarios: Object.keys(SCENARIOS) };

  const button = document.querySelector<HTMLButtonElement>('[data-bench-run]');
  const out = document.querySelector<HTMLElement>('[data-bench-out]');
  const select = document.querySelector<HTMLSelectElement>('[data-bench-scenario]');
  if (button && out) {
    button.disabled = false;
    button.addEventListener('click', async () => {
      button.disabled = true;
      out.textContent = 'Running...';
      const result = await run({ scenario: select?.value });
      out.textContent = JSON.stringify(result, null, 2);
      button.disabled = false;
    });
  }
}
