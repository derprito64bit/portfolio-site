// The test-chart manifest (scripts/build/media-fixtures.mjs), read at build from the build cache. astro.config.mjs renders
// the charts at astro:build:start, so a build always has it; without it (astro check, a fresh dev server) placeholder
// prints render as typed placeholder boxes at their declared size.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FixtureManifest } from './prints.ts';

export const FIXTURE_MANIFEST = join(process.cwd(), 'node_modules/.cache/portfolio-fixtures/manifest.json');

export function readFixtures(file = FIXTURE_MANIFEST): FixtureManifest | null {
  if (process.env.PORTFOLIO_FIXTURES === '0' || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as FixtureManifest;
}
