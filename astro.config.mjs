// The portfolio's build (D-040). Static output, trailing slashes, per-page CSS, sitemap with a noindex filter, the client
// chunk manifest for size-limit, and the empty-sitemap fallback while every page is noindex. /manor/, /arcade/ and /play/
// belong to the game's repo and are not emitted here.
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { cpSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

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
// Paths the game repo owns (never in the sitemap).
const NEVER_INDEXED = /^\/(manor|arcade|play)(\/|$)/;

/** True when the built page for this URL ships robots noindex (any page holding a token does, W-D027). */
function builtNoindex(pathname) {
  const file = join(DIST, pathname, pathname.endsWith('/') ? 'index.html' : '');
  if (!existsSync(file)) return true; // unknown output is never advertised
  return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(readFileSync(file, 'utf8'));
}

/** The sitemap fallback and the derived image stills. */
function seams() {
  return {
    name: 'portfolio:post-build',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        // While every page is noindex the sitemap integration writes nothing; publish a valid empty one.
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
      // Per-page CSS: each page carries only its own stylesheet.
      cssCodeSplit: true,
    },
  },
});
