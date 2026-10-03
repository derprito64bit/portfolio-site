// W-F build acceptance (GPU-free): the build emits /, /work/<slug>/ for every project, /404.html, the /work/ redirect
// and /bench/ (noindex); the sitemap excludes noindex pages and /manor, /arcade, /play and /bench; the seam files are
// there; the 4 fonts fit their budget.
// Usage: node tests/w-f/build.mjs [--out build.json]
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, cliMain } from '../harness/lib.mjs';

export async function run() {
  const dist = join(ROOT, 'dist');
  const projects = JSON.parse(readFileSync(join(ROOT, 'content/projects.json'), 'utf8')).projects;
  const want = ['index.html', ...projects.map((p) => `work/${p.slug}/index.html`), '404.html', 'work/index.html', 'bench/index.html'];
  const routes = want.map((f) => {
    const file = join(dist, f);
    const html = existsSync(file) ? readFileSync(file, 'utf8') : '';
    return { file: f, exists: Boolean(html), noindex: /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html) };
  });
  const redirect = readFileSync(join(dist, 'work/index.html'), 'utf8');
  const redirectOk = /http-equiv="refresh"\s+content="0; url=\/#sheet"/.test(redirect) && /location\.replace\('\/#sheet'\)/.test(redirect);
  const benchNoindex = routes.find((r) => r.file === 'bench/index.html')?.noindex === true;

  const sitemapFiles = ['sitemap-index.xml', 'sitemap-0.xml'].filter((f) => existsSync(join(dist, f)));
  const urls = sitemapFiles.flatMap((f) => [...readFileSync(join(dist, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).filter((u) => !u.endsWith('.xml'));
  const forbidden = urls.filter((u) => /\/(manor|arcade|play|bench)(\/|$)/.test(new URL(u).pathname));
  const noindexed = new Set(routes.filter((r) => r.noindex).map((r) => `/${r.file.replace(/index\.html$/, '')}`));
  const noindexInSitemap = urls.filter((u) => noindexed.has(new URL(u).pathname));

  const seams = ['seams/manor-overlay.css', 'seams/identity.json', 'seams/can-enter-manor.js'].map((f) => ({ file: f, exists: existsSync(join(dist, f)), bytes: existsSync(join(dist, f)) ? statSync(join(dist, f)).size : 0 }));
  const reserved = ['manor', 'arcade', 'play'].filter((d) => existsSync(join(dist, d)));

  const fonts = ['bricolage-mark.woff2', 'bricolage-display-wd90.woff2', 'bricolage-text.woff2', 'geist-mono-500.woff2'].map((f) => ({ file: f, bytes: statSync(join(dist, 'fonts', f)).size }));
  const fontTotal = fonts.reduce((n, f) => n + f.bytes, 0);
  const home = readFileSync(join(dist, 'index.html'), 'utf8');
  const preloaded = [...home.matchAll(/<link rel="preload" href="\/fonts\/([^"]+)"/g)].map((m) => m[1]);
  const preloadBytes = preloaded.reduce((n, f) => n + statSync(join(dist, 'fonts', f)).size, 0);

  const pass = routes.every((r) => r.exists) && redirectOk && benchNoindex && sitemapFiles.length === 2 && forbidden.length === 0 && noindexInSitemap.length === 0 && seams.every((s) => s.exists) && reserved.length === 0 && fonts.length === 4 && fontTotal <= 100_000 && preloadBytes <= 46_000;
  return {
    schema: 1, suite: 'w-f/build', pass, routes, redirectOk, benchNoindex, sitemap: { files: sitemapFiles, urls, forbidden, noindexInSitemap }, seams, reservedDirsInDist: reserved,
    fonts: { files: fonts, totalBytes: fontTotal, preloaded, preloadBytes },
    summary: `${routes.filter((r) => r.exists).length}/${routes.length} routes; sitemap ${urls.length} URLs (${forbidden.length} forbidden, ${noindexInSitemap.length} noindex); fonts ${fontTotal} B, preload ${preloadBytes} B`,
  };
}

await cliMain(import.meta.url, run);
