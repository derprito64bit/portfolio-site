// The portfolio's build (W-F; D-023: the site is the owner's whole portfolio, and the game is one project in it). Static
// output, trailing slashes, one global stylesheet (Swup swaps #swup only and there is no head plugin, so every page must
// already carry every style), and the token seam files written into dist/seams/. /manor/, /arcade/ and /play/ are
// fork-owned paths that this build never emits or indexes.
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { cpSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { buildTokens, readSource } from './scripts/build/tokens.mjs';

const ROOT = fileURLToPath(new URL('./', import.meta.url));
/** Where the client chunk graph goes (outside dist, so it never ships). .size-limit.cjs reads it. */
export const CHUNK_MANIFEST = join(ROOT, 'node_modules/.cache/portfolio-build/vite-manifest.json');

/**
 * Astro turns Vite's build.manifest off for its client build, so this plugin writes the same facts in Vite-manifest
 * shape: one record per client chunk with its source, entry flags and static and dynamic imports (file names).
 */
function chunkManifest() {
  return {
    name: 'portfolio:chunk-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
      if (!chunks.some((c) => c.fileName.startsWith('_astro/'))) return; // the client build only
      const manifest = {};
      for (const c of chunks) {
        const src = c.facadeModuleId ? relative(ROOT, c.facadeModuleId.split('?')[0]).replaceAll('\\', '/') : null;
        manifest[src && !manifest[src] ? src : `_${c.fileName}`] = {
          file: c.fileName,
          name: c.name,
          src,
          isEntry: c.isEntry,
          isDynamicEntry: c.isDynamicEntry,
          imports: c.imports,
          dynamicImports: c.dynamicImports,
          modules: Object.keys(c.modules).map((m) => relative(ROOT, m.split('?')[0]).replaceAll('\\', '/')),
        };
      }
      mkdirSync(join(ROOT, 'node_modules/.cache/portfolio-build'), { recursive: true });
      writeFileSync(CHUNK_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

const SITE = 'https://derprito64bit.github.io';
const DIST = fileURLToPath(new URL('./dist/', import.meta.url));
// Paths the fork owns (publish.ps1 reserved) plus the unlinked bench (W-D003, W-D027). Never in the sitemap.
const NEVER_INDEXED = /^\/(manor|arcade|play|bench)(\/|$)/;

/** True when the built page for this URL ships robots noindex (any page holding a token does, W-D027). */
function builtNoindex(pathname) {
  const file = join(DIST, pathname, pathname.endsWith('/') ? 'index.html' : '');
  if (!existsSync(file)) return true; // unknown output is never advertised
  return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(readFileSync(file, 'utf8'));
}

/** Writes manor-overlay.css, identity.json and can-enter-manor.js next to the site, same origin as the fonts. */
function seams() {
  return {
    name: 'portfolio:seams',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const out = fileURLToPath(new URL('./seams/', dir));
        mkdirSync(out, { recursive: true });
        const files = buildTokens(readSource());
        for (const name of ['manor-overlay.css', 'identity.json', 'can-enter-manor.js']) writeFileSync(join(out, name), files[name]);
        logger.info('wrote seams/manor-overlay.css, seams/identity.json, seams/can-enter-manor.js');
        // While every page holds a placeholder the sitemap integration writes nothing; publish a valid empty one.
        if (!existsSync(fileURLToPath(new URL('./sitemap-index.xml', dir)))) {
          const xml = '<?xml version="1.0" encoding="UTF-8"?>';
          writeFileSync(fileURLToPath(new URL('./sitemap-0.xml', dir)), `${xml}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n`);
          writeFileSync(fileURLToPath(new URL('./sitemap-index.xml', dir)), `${xml}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${SITE}/sitemap-0.xml</loc></sitemap></sitemapindex>\n`);
          logger.info('every page is noindex; wrote an empty sitemap');
        }
        // Derived image stills (scripts/build/images.mjs keeps them out of git).
        const stills = fileURLToPath(new URL('./node_modules/.cache/portfolio-stills/', import.meta.url));
        if (existsSync(stills)) cpSync(stills, fileURLToPath(new URL('./stills/', dir)), { recursive: true });
      },
    },
  };
}

export default defineConfig({
  site: SITE,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  prefetch: false,
  devToolbar: { enabled: false },
  integrations: [
    sitemap({ filter: (page) => { const p = new URL(page).pathname; return !NEVER_INDEXED.test(p) && !builtNoindex(p); } }),
    seams(),
  ],
  vite: {
    plugins: [chunkManifest()],
    build: {
      // One stylesheet for every page (see the header comment).
      cssCodeSplit: false,
    },
  },
});
