// Content instrument (GPU-free): Content v2 rules and the hashes of
// every content file, so a manifest can prove which content a run used.
// Usage: npm run h:content -- [--out content.json]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateContent } from '../../../src/lib/content/validate.js';
import { ROOT, cliMain, sha256 } from '../lib.mjs';

export async function run() {
  const read = (f) => JSON.parse(readFileSync(join(ROOT, 'content', f), 'utf8'));
  const tokens = read('tokens.json');
  const input = { projects: read('projects.json'), honours: read('honours.json'), profile: read('profile.json'), lookIds: tokens.filmLooks.ids };
  const { errors, warnings } = validateContent(input);
  const files = Object.fromEntries(readdirSync(join(ROOT, 'content')).sort().map((f) => [f, sha256(readFileSync(join(ROOT, 'content', f)))]));
  const featured = input.projects.projects.filter((p) => p.featured).length;
  const placeholders = input.projects.projects.filter((p) => p.placeholder).length;
  const pass = errors.length === 0;
  return {
    schema: 1, instrument: 'content', pass, errors, warnings, files,
    projects: input.projects.projects.length, featured, placeholders,
    summary: `${errors.length} errors, ${warnings.length} warnings; ${input.projects.projects.length} projects (${placeholders} placeholders, ${featured} featured)`,
  };
}

await cliMain(import.meta.url, run);
