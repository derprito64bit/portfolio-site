#!/usr/bin/env node
// media-caps (W-V0a, budgets-v2 "Media"): the byte caps on the images in dist/, read from the json budgets block
// (site.media.capBytes), never from a literal.
//   - Page images are AVIF or WebP only (no JPEG, PNG or GIF), outside the site icons at the root of dist/.
//   - A file's class comes from a "-<class>-" token in its name (small, mid, large, first, extreme, poster), the way
//     scripts/build/images.mjs names the ladder. A file without a class token is held to the large cap, the loosest.
//   - LQIP placeholders (the lqip fields of the generated manifests, and inline data:image URIs in built pages) decode
//     to the lqip cap at most.
// It passes when dist/ holds no media. Usage: node scripts/check/media-caps.mjs [--dist dist] [--json report.json]
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { budget, readBudgets } = require('./budgets.cjs');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const IMAGE = /\.(avif|webp|jpe?g|png|gif)$/i;
const OK_FORMAT = /\.(avif|webp)$/i;
const CLASSES = { small: 'small', mid: 'mid', large: 'large', first: 'firstPrint', extreme: 'extreme', poster: 'poster' };
const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)])) : []);

/** The class of an image file by its name, or null. */
export function classOf(file) {
  const m = /[-_.](small|mid|large|first|extreme|poster)[-_.]/i.exec(file.replaceAll('\\', '/').split('/').pop());
  return m ? m[1].toLowerCase() : null;
}

/** Decoded byte length of a base64 data URI. */
const dataBytes = (uri) => Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64').length;

/**
 * @param {{ dist: string, manifests?: string[], budgets?: any }} o
 * @returns {{ problems: string[], images: number, lqips: number }}
 */
export function checkMedia({ dist, manifests = [], budgets = readBudgets() }) {
  const caps = Object.fromEntries(Object.keys(CLASSES).map((c) => [c, budget(`site.media.capBytes.${CLASSES[c]}`, budgets)]));
  const lqipCap = budget('site.media.capBytes.lqip', budgets);
  const problems = [];
  let images = 0;
  let lqips = 0;
  for (const f of walk(dist).filter((x) => IMAGE.test(x))) {
    const rel = relative(dist, f).replaceAll('\\', '/');
    if (!rel.includes('/')) continue; // the site icons at the root (favicon, apple-touch-icon)
    images++;
    if (!OK_FORMAT.test(f)) problems.push(`${rel}: ${/\.[^.]+$/.exec(f)[0].toLowerCase()} in the page (AVIF first, WebP fallback only)`);
    const cls = classOf(f) ?? 'large';
    const bytes = statSync(f).size;
    if (bytes > caps[cls]) problems.push(`${rel}: ${bytes} B over the ${cls} cap of ${caps[cls]} B${classOf(f) ? '' : ' (no class token in the name; held to the large cap)'}`);
  }
  const uris = [];
  for (const m of manifests.filter(existsSync)) {
    const scan = (v) => {
      if (Array.isArray(v)) v.forEach(scan);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (k === 'lqip' && typeof x === 'string' ? uris.push([`${relative(ROOT, m).replaceAll('\\', '/')}`, x]) : scan(x));
    };
    scan(JSON.parse(readFileSync(m, 'utf8')));
  }
  for (const f of walk(dist).filter((x) => x.endsWith('.html'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/data:image\/(?:webp|avif|jpeg|png|gif);base64,[A-Za-z0-9+/=]+/g)) uris.push([relative(dist, f).replaceAll('\\', '/'), m[0]]);
  }
  for (const [where, uri] of uris) {
    lqips++;
    const n = dataBytes(uri);
    if (n > lqipCap) problems.push(`${where}: an LQIP of ${n} B is over the ${lqipCap} B cap`);
  }
  return { problems, images, lqips };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const dist = resolve(ROOT, opt('--dist', 'dist'));
  if (!existsSync(dist)) {
    console.error('media-caps: dist/ is missing; run npm run build first');
    process.exit(1);
  }
  const { problems, images, lqips } = checkMedia({ dist, manifests: [join(ROOT, 'src/lib/content/stills.json'), join(ROOT, 'src/lib/content/media.json')] });
  if (opt('--json')) writeFileSync(opt('--json'), `${JSON.stringify({ schema: 1, check: 'media-caps', images, lqips, problems }, null, 2)}\n`);
  if (problems.length) {
    console.error(`media-caps: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`media-caps: ${images} images and ${lqips} LQIPs within the budgets-v2 caps${images + lqips ? '' : ' (no media yet)'}`);
}
