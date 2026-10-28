# Dependencies (allowlist, locked in Wave 2)

Only the foundation crew (W-F) edits `package.json` and the lockfile. Everyone else files a `depRequests[]` request.

**Direction reset (D-037, owner 2026-10-28):** the agent designing the new site installs the free libraries and tools it needs itself (`npm install`, skills). That lifts the W-F-only rule above and the REJECTED row below: GSAP with ScrollTrigger and SplitText, shader and post-processing packages, and the rest. Add a row per package in the same PR: the package, version, licence, size in kB gz, and why. `scripts/check/deps.mjs` (CI) needs three things. Install with an exact version (`npm install --save-exact <pkg>`). Add a table row `| <pkg> | <the same exact version> | <licence> | <kB gz> | <why> |` above the REJECTED row. And take the package's name off the REJECTED row (gsap, for one, is on it). No paid tiers, no visible third-party branding on the site, no licence that blocks a portfolio. The table below is the Darkroom build's, kept as history.

| Package | Version | Licence | Size (gz) | Why |
|---|---|---|---|---|
| astro | 7.3.5 | MIT | 0 (build); Node >=22.12, pin Node 24 | Static pages, content collections, local fonts, image build |
| swup | 4.10.0 | MIT | 8.2 (measured) | Page swaps around the persistent canvas (W-D015) |
| @swup/a11y-plugin | 5.2.1 | MIT | estimate 2-4, measured at landing | Route announcement and focus, extended by W-D015's focus rules |
| three | 0.186.1 | MIT | 132 (WebGLRenderer tree-shake, measured) plus GLTFLoader and meshopt decoder (estimate); GL chunk only | The one canvas, prints, camera, exhibits, loupe |
| animejs | 4.5.0 | MIT | 16.8 (measured), inside the GL chunk | Timelines and staggers, ticked by our loop |
| lenis | 1.3.26 | MIT | 5.4 (documented), full tier only | Optional wheel feel layer; first runtime cut |
| Bricolage Grotesque (mark, display, text subsets) | google/fonts ofl/bricolagegrotesque @84745e5 | OFL-1.1, no RFN | 86.9 woff2 (measured) | The bridging face (D-002) |
| Geist Mono 500 subset | google/fonts ofl/geistmono | OFL-1.1 | 9.9 woff2 (measured) | Edge print only; first font cut |
| Instax Mini Camera sound pack (Headphaze, Freesound pack 38900) | sounds 696763, 696760 | CC0-1.0 | 15.1 opus sprite (measured), after opt-in only | Shutter, eject, detent sounds |
| @astrojs/sitemap | 3.7.4 | MIT | 0 (build) | Sitemap with noindex, /bench/ and fork-path filters |
| @astrojs/check + typescript | 0.9.x / 6.0.x | MIT / Apache-2.0 | 0 (dev) | Type check gate |
| sharp | 0.35.5 | Apache-2.0 (libvips LGPL-3.0 dynamic binary) | 0 (build) | AVIF/WebP, look bake, LQIP |
| @gltf-transform/cli | 4.5.1 | MIT | 0 (build) | Meshopt with pivot-safe flags |
| fonttools + brotli (via uvx) | 4.66.1 / 1.2.0 | MIT | 0 (build) | Font subsetting |
| satori | 0.35.0 | MPL-2.0 | 0 (build) | OG images (conditional; a Playwright screenshot of an OG page is the fallback) |
| @playwright/test (Chromium and WebKit browsers) | pin at W-F install | Apache-2.0 | 0 (dev) | GES-1 harness, device profiles, WebKit runs |
| @axe-core/playwright | 4.13.0 | MPL-2.0 | 0 (dev) | Accessibility gate |
| lighthouse | 13.5.0 (exact) | Apache-2.0 | 0 (dev, npx; Node >=22.19) | Performance and accessibility gate (no @lhci/cli) |
| size-limit + @size-limit/file | 14.1.0 | MIT | 0 (dev) | Per-chunk budgets from the Vite manifest |
| NVDA (desktop tool, not in package.json) | current stable | GPL-2.0 | 0 | Screen-reader transcripts at G3a and W-C10 |
| gsap | 3.15.0 | GSAP Standard "no charge" licence (Webflow; free for commercial use, notices kept) | about 57 for core + ScrollTrigger, SplitText, Flip, DrawSVG, CustomEase (Refraction app chunk measured in the PR, with our code) | Refraction concept: pinned theatre (ScrollTrigger), masked type reveals (SplitText), plate-to-page open (Flip), overlay etch (DrawSVG), the glass ease (CustomEase) |
| ogl | 1.0.11 | Unlicense | about 10 (Refraction entry chunk 24.1 measured, with the glass shaders and lens rig) | Refraction concept: the one WebGL2 canvas, scene target and refraction pass |
| @fontsource-variable/mona-sans | 5.3.0 | OFL-1.1 (font), MIT (package) | 98.1 woff2, latin wdth+wght subset (measured) | Refraction concept: the single type family; its width axis carries the roles (expanded display, normal UI, condensed readouts) |
| REJECTED: @paper-design/shaders, troika-three-text, postprocessing, detect-gpu, stegu/webgl-noise, @swup/astro, @swup/head-plugin, @swup/preload-plugin, @lhci/cli | n/a | n/a | saves about 46-120 kB gz | No beat needs them |
