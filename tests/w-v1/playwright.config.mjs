// W-V1's browser rows (tests/w-v1/*.spec.mjs) in Chromium and WebKit, on the built dist/ (served by the smoke's
// globalSetup on a free port). A2 (non-timing) and A5 to A13 run on the flat path (WebGL off), DOM only, at 1440 x 900 and
// 390 x 844; A14 runs with GL at 640 x 400, DPR 1. Timings (A2's 1.2, 0.8 and 1.5 s, 55 frames) are the gate's.
// Run: npm run build, then npm run test:w-v1.
import { defineConfig } from '@playwright/test';

const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  globalSetup: '../smoke/global-setup.mjs',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  reporter: [['list'], ['json', { outputFile: process.env.W_V1_JSON || '../../test-results/w-v1.json' }]],
  outputDir: '../../test-results/w-v1',
  use: { headless: true, trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // the installed Chrome (real GPU) on the reference host; Playwright's Chromium in CI or with PW_BUNDLED=1
        ...(CI || process.env.PW_BUNDLED ? {} : { channel: 'chrome' }),
        launchOptions: { args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] },
      },
    },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
