// W-V1's browser rows (tests/w-v1/*.spec.mjs) in Chromium and WebKit, on the built dist/ (served by the smoke's
// globalSetup on a free port). A2 (non-timing) and A5 to A13 run on the flat path (WebGL off), DOM only, at 1440 x 900 and
// 390 x 844; A14 runs with GL at 640 x 400, DPR 1. Timings (A2's 1.2, 0.8 and 1.5 s, 55 frames) are the gate's.
// Run: npm run build, then npm run test:w-v1.
import { defineConfig } from '@playwright/test';

// probe only: the browser's own stderr and exit in the log
// (P5: no pw:browser log)

const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: '.',
  testMatch: '**/roll.spec.mjs',
  grep: /brackets on|centre line leads|hover to focus/,
  repeatEach: 3,
  globalSetup: './global-setup.mjs',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  reporter: [['list'], ['json', { outputFile: process.env.W_V1_JSON || '../../test-results/w-v1.json' }]],
  outputDir: '../../test-results/w-v1',
  use: { headless: true, trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    { name: 'webkit', use: { browserName: 'webkit', launchOptions: { env: { ...process.env, WEBKIT_SKIA_ENABLE_CPU_RENDERING: '1' } } } },
  ],
});
