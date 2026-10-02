> **Fact pack `tools-licences`**, Wave 0.5 (2026-10-02). It was researched by a Sonnet specialist and spot-checked by an independent skeptic,
> whose verdict was `fix`. **The corrections at the end override the text above them.** Claims are labelled
> measured, documented or estimate.

# Free-tools and licence scout (2026-10-02)

All versions and dates come from the npm registry or PyPI (measured today). Sizes are gzip level 9 of files fetched from jsDelivr, or esbuild bundles gzip-sized with `gzip-size-cli`. Where a number came from an esm.sh bundle it is marked est. Evidence files are in `portfolio-evidence/factpacks/scout/`.

## Allowlist: runtime libraries

| Lib | Version (npm date) | Licence | gzip kB | Verdict |
|---|---|---|---|---|
| astro | 7.3.5 (2026-09-24) | MIT | 0 JS by default (build-time) | LOCK. Needs Node >=22.12. |
| swup | 4.10.0 (2026-09-03) | MIT | 8.2 (core, measured) | LOCK. |
| @swup/astro | 1.8.0 (2026-02-14) | MIT | plugins add on top | CONDITIONAL. Last publish predates Astro 7 (2026-06-22) and it declares no peer range, so Astro 7 support is untested. Smoke-test it, or use plain `swup` plus `@swup/*` plugins directly. |
| gsap | 3.15.0 (2026-04-13) | "Standard no-charge" | core 28.4, ScrollTrigger 18.0, SplitText 3.6, CustomEase 3.7 (measured) | LOCK, see licence note. |
| animejs | 4.5.0 (2026-06-22) | MIT | animate+spring 14.1, plus stagger+createTimeline 16.8 (esbuild, measured). Full bundle 41.0. | LOCK as the spring engine. |
| lenis | 1.3.26 (2026-08-05) | MIT | 5.4 | LOCK. |
| three | 0.186.1 = r186 (2026-09-24) | MIT | WebGLRenderer-only tree-shake 132 (esbuild, measured). Full `three.module.min` 90.2 plus `three.core.min` 104.8 = 195. | LOCK. Budget about 135 kB gz, not "small". |
| @paper-design/shaders | 0.0.81 (2026-09-17) | Apache-2.0 | ShaderMount plus one shader about 40 (est., esm.sh). Full 64.5 (est.). | CONDITIONAL. Pre-1.0 API, pin the exact version. `sideEffects:false`, no dependencies. |
| troika-three-text | 0.52.5 (2026-07-24) | MIT | 56.4 (esm) | CONDITIONAL. Loads fallback fonts from a CDN at runtime, see red flags. |
| postprocessing (pmndrs) | 6.39.5 (2026-09-09) | Zlib | EffectComposer+RenderPass+Bloom+EffectPass about 16 (est., esm.sh, three external); full 157.6 | LOCK, but peer `three >=0.168 <0.187`. It blocks a bump to r187. |
| detect-gpu | 5.0.70 (2025-02-23) | MIT | 3.3 | CONDITIONAL. Fetches from a third-party CDN by default, see red flags. |
| ogl (fallback) | 1.0.11 (2025-01-27) | Unlicense | Renderer+Program+Mesh+Triangle 14.4 (est., esm.sh) | LOCK as fallback only. Stable but no release in 20 months. |
| stegu/webgl-noise | no npm; repo LICENSE | MIT (Ashima Arts 2011, Stefan Gustavson 2011-2016) | 0 (GLSL snippets) | LOCK. Keep the copyright header in the shader source. |

Maintenance signal: 10 of 13 published within 6 months. detect-gpu, ogl and @swup/astro (Feb 2026) are the stale ones.

### Licence and API facts
- **GSAP**: Standard "no charge" licence, effective 2025-04-30, last modified 2025-05-30 (https://gsap.com/standard-license). It grants a non-exclusive, worldwide licence for commercial use, including personal portfolios. The formerly Club-only plugins, including SplitText, are included. The files `SplitText.min.js`, `CustomEase.min.js`, `ScrollTrigger.min.js`, `ScrollSmoother.min.js`, `Flip`, `Draggable` and `MorphSVGPlugin` all ship in the npm 3.15.0 package. Prohibited: tools that let end users build or edit animations through a visual interface "similar to Webflow", reverse engineering to build competing products, and removing notices. There is no attribution or telemetry clause. It is not an OSI licence, and the SPDX string is non-standard (`SEE LICENSE`-style).
- **anime.js 4.5.0**: `import { animate, spring } from 'animejs'`. Usage is `animate(el,{x:100, ease: spring({bounce:.5,duration:350})})` or `spring({stiffness:95,damping:13})` (https://animejs.com/documentation/easings/spring). The package also exports subpaths: `./timer`, `./animation`, `./timeline`, `./animatable`, `./draggable`, `./scope`, `./engine` and others. `sideEffects` is limited to the adapters, so the root import tree-shakes (measured).
- **@paper-design/shaders**: 37 shader modules in `dist/shaders/` (jsDelivr listing). They are: color-panels, dithering, dot-grid, dot-orbit, fluted-glass, gem-smoke, god-rays, grain-gradient, halftone-cmyk, halftone-dots, heatmap, image-dithering, lens-distortion, liquid-metal, mesh-gradient, metaballs, neuro-noise, paper-texture, perlin-noise, pulsing-border, simplex-noise, smoke-ring, spiral, static-mesh-gradient, static-radial-gradient, swirl, voronoi, warp, water and waves. It ships a NOTICE file.
- **Runtime network and telemetry**: no `fetch`, `XMLHttpRequest` or `sendBeacon` strings in gsap.min, lenis.min or paper shader-mount (grep count 0, measured). That is a string check, not a full audit.

## Tooling (dev only)

| Tool | Version (date) | Licence | Verdict |
|---|---|---|---|
| @gltf-transform/cli | 4.5.1 (2026-09-28) | MIT | LOCK. Node >=20. Depends on sharp, meshoptimizer, draco3dgltf and gltf-validator. |
| sharp | 0.35.5 (2026-09-27) | Apache-2.0 | LOCK. Bundles libvips (LGPL-3.0, dynamic prebuilt binary). Build tool only, never shipped. |
| @axe-core/playwright | 4.13.0 (2026-08-11) | MPL-2.0 | LOCK. File-level copyleft is irrelevant for a dev tool. Pulls axe-core ~4.13.0. |
| lighthouse | 13.5.0 (2026-09-18) | Apache-2.0 | LOCK. Needs Node >=22.19. |
| @lhci/cli | 0.15.1 (2025-06-25) | Apache-2.0 | RED FLAG, see below. |
| size-limit | 14.1.0 (2026-09-27) | MIT | LOCK. Node ^22.19, ^24.5 or >=26. Needs a `@size-limit/*` preset to measure anything. |
| glyphhanger | 6.0.0 (2026-06-05) | MIT | OPTIONAL. Needs jsdom, and uses a puppeteer-based spider and pyftsubset. Prefer fonttools. |
| fonttools (pyftsubset) | 4.66.1 (2026-09-29) | MIT | LOCK. Python >=3.11; `brotli` 1.2.0 (MIT) is needed for woff2 output. |

## Font shortlist

Latin woff2 sizes are for the Fontsource Latin slices (jsDelivr file sizes, measured, bytes on disk). Axes beyond weight come from the Fontsource metadata and the full-file names (e.g. `opsz`), not from design specs.

| Family | Role | Licence | Variable and weights | Latin woff2 |
|---|---|---|---|---|
| Fraunces | display serif | OFL-1.1 | VF, wght 100-900, plus opsz; full file adds SOFT/WONK | wght 36.6 kB (italic 45.7); opsz 67.3 kB; full 121 kB |
| Instrument Serif | display serif | OFL-1.1 | static 400 plus italic | 21.0 kB (italic 22.1) |
| Gloock | display serif | OFL-1.1 | static 400 | 26.4 kB |
| Newsreader | editorial serif | OFL-1.1 | VF, wght 200-800, plus opsz | wght 58.1 kB (italic 64.5); opsz 132 kB |
| Source Serif 4 | editorial serif | OFL-1.1 | VF, wght 200-900, plus opsz | wght 50.8 kB; opsz 122 kB |
| Bricolage Grotesque | grotesk | OFL-1.1 | VF, wght 200-800, opsz and wdth variants | wght 41.3 kB |
| Hanken Grotesk | sans | OFL-1.1 | VF, wght 100-900 | 34.7 kB (italic 35.6) |
| Inter Tight | sans | OFL-1.1 | VF, wght 100-900 | 44.9 kB |
| JetBrains Mono | mono | OFL-1.1 | VF, wght 100-800 | 40.4 kB |
| Geist Mono | mono | OFL-1.1 | VF, wght 100-900 | 23.1 kB |
| IBM Plex Mono | mono | OFL-1.1 | static 400/700 plus italics | 14.7 kB per static cut |
| Ronzino (Collletttivo) | grotesk | OFL | static, 6 styles, Latin; v1.000 2025-01-17 | not measured |
| Le Murmure (Velvetyne) | display accent | OFL-1.1 | static single style; Latin, Greek, Cyrillic | not measured |
| Terminal Grotesque (Velvetyne) | pixel accent | OFL-1.1 | static; Regular and Open | not measured |
| Gambetta, Zodiak, Boska, Sentient, Erode (Fontshare) | serif | ITF FFL v2.0 | each family has 2 variable styles (roman and italic) | not measured; ship as delivered |
| Switzer, General Sans, Satoshi (Fontshare) | sans | ITF FFL v2.0 | same, with 2 variable styles per family | not measured; ship as delivered |

Suggested stack: Fraunces or Instrument Serif for display, Newsreader for editorial, Hanken Grotesk or Bricolage Grotesque for sans, Geist Mono or JetBrains Mono for mono. Licence terms are documented at https://fontshare.com/licenses/sil-ofl for OFL and in the ITF text below. Velvetyne and Collletttivo licence statements come from their individual font pages, not from the font files themselves.

## Red flags

1. **Fontshare (ITF FFL v2.0, 17 Aug 2026) forbids subsetting and format conversion.** I read the licence text from the live Fontshare bundle (`https://www.fontshare.com/js/main.d962d2d8.js`). Section 01 allows self-hosting through `@font-face`, for personal or commercial use, and the Fontshare API is optional. Section 02 says "You may not modify... This includes... subsetting, format conversion". Section 05 forbids Derivative Works without written consent. So `pyftsubset` or glyphhanger on a Fontshare font breaches the licence. You may only ship the full files as delivered, the WOFF2 included in the kit, so a Latin subset is not possible. OFL fonts have no such restriction, though they must keep the licence text and respect any Reserved Font Name. I did not check which of the shortlisted OFL fonts declare a Reserved Font Name. Note: Fontshare's own page for the licence is a JS app, so a plain fetch returns nothing.
2. **detect-gpu** loads its benchmark data from `https://unpkg.com/detect-gpu@5.0.70/dist/benchmarks` at runtime (found in the esm file). That is a third-party call from your site. Self-host the benchmark folder and pass `benchmarksURL`. Also stale: last release 2025-02-23.
3. **troika-three-text** has a default `unicodeFontsURL` of `https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/packages/data`. It is only used for glyph fallback, so supply a font file that covers your text and set `unicodeFontsURL` to a self-hosted path if you need it.
4. **@lhci/cli 0.15.1** (2025-06-25) bundles Lighthouse 12.6.1, not 13, so LHCI scores will not match Lighthouse 13.5. Either run `lighthouse` 13.5 directly in CI or accept the version split. LHCI is not actively released.
5. **postprocessing 6.39.5** caps `three` below 0.187. Plan upgrades together.
6. **@swup/astro** and Astro 7: see the allowlist row. Not verified.
7. **@paper-design/shaders** is 0.0.x. Pin an exact version.
8. **GSAP** is free for this use but proprietary. If the portfolio is ever packaged as a visual animation builder, the prohibited-use clause applies.

## Gaps
- Gzip sizes for @paper-design/shaders, postprocessing and ogl are esm.sh estimates, not esbuild measurements. The three and anime.js figures are esbuild measurements.
- Latin subset sizes for the Fontshare, Velvetyne and Collletttivo fonts were not measured.
- No end-to-end Astro 7 plus @swup/astro build was run (read-only rules).

## Verification corrections (these override the text above)

- **Claim:** @paper-design/shaders has "37 shader modules in dist/shaders/ (jsDelivr listing)"; the same claim is repeated in the items[] notes.
  - **Correction:** The jsDelivr flat listing for 0.0.81 shows 30 .js shader modules in dist/shaders/ (and 30 .d.ts). The pack's own enumerated list also has 30 names. 37 is wrong. Downstream agents should say 30. (source: https://data.jsdelivr.com/v1/packages/npm/@paper-design/shaders@0.0.81?structure=flat)
- **Claim:** Maintenance signal: "10 of 13 published within 6 months. detect-gpu, ogl and @swup/astro (Feb 2026) are the stale ones."
  - **Correction:** Only 9 of the 13 have an npm publish date within 6 months of 2026-10-02: astro, swup, gsap (2026-04-13), animejs, lenis, three, paper shaders, troika, postprocessing. The 10th is stegu/webgl-noise, which is not on npm and has no date, so it cannot count. Minor, but the arithmetic is wrong. (source: registry.npmjs.org time fields for each package)
- **Claim:** Font rows' date column (e.g. Fraunces 2025-09-10, Geist Mono 2026-06-08), under the intro "All versions and dates come from the npm registry".
  - **Correction:** Those dates are the Google Fonts lastModified values from api.fontsource.org. The actual npm publish date of @fontsource/fraunces 5.3.0 and @fontsource-variable/fraunces 5.3.0 is 2026-07-19. The version 5.3.0 and the font sizes are correct, but the dates are not npm dates. Fontsource's lastModified is a different thing. (source: https://api.fontsource.org/v1/fonts/fraunces (lastModified 2025-09-10) vs registry.npmjs.org/@fontsource/fraunces (time[5.3.0] = 2026-07-19))

## Unsupported claims (treat as estimates until re-sourced)

- @paper-design/shaders ~40 kB (ShaderMount plus one shader) and full 64.5 kB, postprocessing ~16 kB, and ogl 14.4 kB are esm.sh estimates. The pack discloses this, and I did not reproduce them. Treat them as unverified. No evidence files back them (the scout folder holds only e1-e4, three, anime and ogl-index).
- The "0 fetch/XMLHttpRequest/sendBeacon hits" grep claims for gsap, lenis and shader-mount were not re-run. The pack says it is a string check only. The troika and detect-gpu CDN URLs were confirmed by grep.
- GitHub LICENSE URLs in items[].licenceUrl were not fetched, as the pack itself admits. The licence names do match the npm metadata.
- IBM Plex Mono is described as "static 400/700 plus italics", but Fontsource lists weights 100-700. The claim is true for the shortlisted cuts but implies there is no thinner weight.
- The GSAP "Plain English Summary" on the licence page says use is free "as long as end users are not charged a fee of any kind" and points to a Business Club licence otherwise. The pack omits this caveat. The formal clauses do not repeat it, but agents should know it exists. A free portfolio is fine.
- Red-flag text about Fontshare section numbers (01, 02, 05) was not individually mapped. The prohibition wording itself is confirmed.

Verifier notes: Verified against sources, all matching: npm versions, dates, licences and engines for astro 7.3.5 (2026-09-24, node>=22.12; 7.0.0 on 2026-06-22), swup 4.10.0, @swup/astro 1.8.0 (2026-02-14, no peerDependencies, MIT), gsap 3.15.0 (licence string), animejs 4.5.0 (exports ./timer ./animation ./timeline ./animatable ./draggable ./scope ./engine, sideEffects limited to adapters, MIT), lenis 1.3.26, three 0.186.1, @paper-design/shaders 0.0.81 (Apache-2.0, sideEffects false, no deps, NOTICE file present), troika 0.52.5, postprocessing 6.39.5 (Zlib, peer three >=0.168 <0.187), detect-gpu 5.0.70 (2025-02-23), ogl 1.0.11 (Unlicense, 2025-01-27), @lhci/cli 0.15.1 (pins lighthouse 12.6.1), lighthouse 13.5.0 (node>=22.19), size-limit 14.1.0 (engines match), sharp 0.35.5, gltf-transform 4.5.1, axe playwright 4.13.0 (MPL-2.0, axe-core ~4.13.0), glyphhanger 6.0.0, fonttools 4.66.1 (python>=3.11, MIT), brotli 1.2.0. Also confirmed: gzip sizes within about 1% for swup (8248 vs 8.2), lenis (5424), gsap core 28.3, ScrollTrigger 18.0, SplitText 3.6, CustomEase 3.7, three module 89.8 plus core 104.1 (the pack says 90.2 plus 104.8, which is a trivial gzip implementation difference), detect-gpu 3.3, postprocessing full 157.3 (pack says 157.6). The scout evidence files reproduce exactly: e1 three WebGLRenderer = 527,601 B raw and about 132 kB gz, e2 133 kB, e4 anime animate+spring 14.0 kB, e3 with stagger and timeline 16.7 kB. Full anime.esm.min.js is about 40.8 kB gz (pack says 41.0). The GSAP licence text confirms effective 2025-04-30, last modified 2025-05-30, the Webflow-competing visual-builder prohibition, the reverse-engineering restriction and the no-removal-of-notices clause, with no attribution or telemetry clause. The animejs spring docs confirm bounce and duration. The detect-gpu unpkg benchmarks URL and the troika unicode-font-resolver jsDelivr URL are both literally in the dist files. The stegu LICENSE copyright lines (Ashima 2011; Gustavson 2011-2016) are correct. The Fontshare ITF FFL v2.0 (17 Aug 2026) text, read from the gzip-compressed main.d962d2d8.js (needs curl --compressed), does forbid subsetting and format conversion in two places, and allows self-hosting through @font-face. The Fontshare API confirms licence itf_ffl and 2 variable styles for each of Gambetta, Zodiak, Boska, Sentient, Erode, Switzer, General Sans and Satoshi; they also ship about 10-18 static styles, which the pack does not mention, but delivered files may still be used. Fontsource woff2 sizes for Fraunces, Newsreader, Geist Mono, Instrument Serif and IBM Plex Mono match exactly. The Ronzino, Le Murmure and Terminal Grotesque dates and licences match their pages. Overall the pack is accurate and well sourced. Fix the 37-vs-30 shader count, the 10-vs-9 maintenance count and the font date labelling, and treat the esm.sh size estimates as unverified. Agents should ask the owner before relying on them for budgets.

## Known gaps

- The sizes for @paper-design/shaders, postprocessing and ogl are esm.sh estimates; only three and animejs were bundled with esbuild.
- No Latin-subset woff2 sizes for Fontshare, Velvetyne or Collletttivo fonts.
- @swup/astro compatibility with Astro 7 was not tested; I did not run a build because of the read-only rule.
- I did not check which OFL fonts on the shortlist declare a Reserved Font Name, which matters if a subset is renamed.
- Runtime-network checks were string greps of dist files (fetch, XMLHttpRequest, sendBeacon), not a traffic capture.
- Licence URLs for the GitHub LICENSE files were not individually fetched; they are the conventional repo paths.
- The GitHub API was rate-limited, so the Velvetyne repo licences come from the website only.

## Local evidence (not committed; third-party screenshots stay outside the repos)

- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\scout\e1.out.js`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\scout\e2.out.js`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\scout\e3.out.js`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\scout\e4.out.js`
