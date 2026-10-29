// The Playwright test runner (W-V0b): the state-machine smoke and the D-055 gating check, in Chromium and WebKit
// (tests/smoke). `npm run test:smoke` runs both engines on the built dist/ (npm run build first).
// Paths:
//   GL (default)  the reference host's GPU, at D2 (1440 x 900, DPR 2); CI runs it at G1 (640 x 400, DPR 1) on software GL.
//   flat frames   H_NO3D=1: Chromium --disable-3d-apis, WebKit an init script that refuses WebGL contexts
//                 (tests/harness/lib.mjs NO_WEBGL_INIT), so both take the page's own flat-frame path.
// SMOKE_PROFILE names a tests/harness/lib.mjs profile (its viewport and DPR; the engines come from the projects here).
// One worker: the host is shared, so one browser at a time.
import { defineConfig } from '@playwright/test';

const CI = Boolean(process.env.CI);
const NO3D = Boolean(process.env.H_NO3D);
// H_SWGL=1 (with PW_BUNDLED=1): software GL (SwiftShader) on the reference host, to reproduce CI's renderer locally.
const SWGL = Boolean(process.env.H_SWGL);
const SWGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export default defineConfig({
  testDir: 'tests/smoke',
  testMatch: '**/*.spec.mjs',
  globalSetup: './tests/smoke/global-setup.mjs',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  // The JSON report carries each step's state, pos, transitional state and frame counts (the 'smoke' annotation).
  reporter: [['list'], ['json', { outputFile: process.env.SMOKE_JSON || 'test-results/smoke.json' }]],
  outputDir: 'test-results',
  use: { headless: true, trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // The installed Chrome (real GPU) on the reference host; Playwright's Chromium in CI or with PW_BUNDLED=1.
        ...(CI || process.env.PW_BUNDLED ? {} : { channel: 'chrome' }),
        launchOptions: { args: ['--mute-audio', '--autoplay-policy=user-gesture-required', '--ignore-gpu-blocklist', ...(NO3D ? ['--disable-3d-apis'] : []), ...(SWGL ? SWGL_ARGS : [])] },
      },
    },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
