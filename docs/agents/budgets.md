# Budgets (locked in Wave 2)

A change that exceeds a budget fails its gate. Evidence standard: GES-1 (W-D030).

## Front Door

- Lighthouse 13.5.0 under the GES-1 protocol (built dist over gzip, 5 runs, median by score, auto tier, valid only on a real renderer): performance >= 90 mobile and >= 95 desktop; accessibility 100; best practices >= 95. SEO is not gated while noindex is on.
- LCP <= 2.5 s mobile and <= 2.0 s desktop. The LCP element is the h1 on mouse profiles, or the h1 or print 1's still on touch profiles. CLS <= 0.02. TBT <= 150 ms, mobile and desktop.
- JS: pre-GL JS <= 35 kB gz, summed from the network log before the stage:gl-start mark. GL chunk (three, addons, anime, stage GL, effects) <= 185 kB gz. Effects <= 10 kB gz (6.0 measured).
- Fonts <= 100 kB woff2 (96.8 planned); preloaded <= 46 kB.
- 3D: camera LOD0 <= 30k tris and <= 250 kB gz; LOD1 <= 5k and <= 60 kB gz; Manor LOD <= 1.5k tris; cartridge <= 1.5k and 20 kB; loupe <= 3k and 40 kB; gear <= 4k and 40 kB; an owner work model <= 50k and 1 MB, on its own project only. 3D per page <= 1.5 MB gz.
- Canvas: <= 4.5 Mpx on full and <= 1.5 Mpx on lite (effective DPR lowered to fit); DPR caps 2 and 1.5.
- Print stills: sheet 512 px long edge, enlargements and hero 1024 px, AVIF with WebP fallback; home images <= 600 kB on the first scroll-through (estimate until real images).
- GPU worst moment (8 wet sheet prints): <= 4 ms per frame on the reference integrated GPU at the tier the rules give it. Until it is measured: a reference-host median x 30 <= 4 ms passes; passing only at x 10 is 'at risk' and goes to the owner. A real number comes from /bench/. Crews stay <= 1.5x the prototype median, with no regression over 20% against gpu-baseline.json.
- Idle: 0 rAF callbacks and 0 draws from 1 s to 4 s after the last input, from gate-owned counters; idle main thread <= 1 ms/s, reported with the display Hz.
- Hero: hero:readable minus stage:gl-ready <= 2100 ms (median of 3 cold loads). With GL delayed 3 s, a developed print 1 is visible by FCP + 2.6 s. No automatic motion over 5 s.
- Input blocking: 0 ms, except the Swup out phase (<= 160 ms). Handoff navigates at 720 +- 20 ms.
- Layout: overflow 0 px as the maximum over the run, at every profile and mode. No clipped text under text spacing, at 200% zoom or at 320 px. Targets >= 44x44 px (shared floor with the Manor: 24 px). Text >= 12 px. Contact within 5.0 screens at 390x844.
- Drift: 0 px misplaced prints under wheel, touch and keys in Chromium and WebKit, including an 80 px toolbar collapse mid-fling.
- Accessibility: axe 0 violations of any impact on WCAG tags (shared floor: 0 serious or critical). Focus ring >= 3:1 with >= 90% ring coverage at every Tab stop. WCAG 2.3.1 flash analysis passes. Every motion has a reduced path that is live.
- Sound: 0 bytes until opt-in, then <= 16 kB.
- Process: every crew, gate and review agent runs on Opus 5.5 at effort xhigh (W-D001).

## Manor

- Hard limits per zone (frozen, ArtPlayTests): at most 120 batches and 60,000 tris. Batches here count audited MeshRenderers plus world-space Canvases; the M-QA guard adds the canvases.
- pf.foyer: cap 85 / 24k, at most 8 registered lights (plan: 4). Measured 73 / 18,664 today with 2 pods and 6 canvases. Estimate after this plan: about 62 mesh batches + 6 canvases.
- pf.gallery: cap 80 / 44k, at most 8 lights (plan: 5). Measured 63 / 40,292 today with 11 canvases. Estimate: about 55 mesh batches + 15 canvases; about 36k tris (m-red-detail projection).
- pf.honours: cap 90 / 45k, at most 8 lights (plan: 4). Estimate only. Medal devices take at most 2 Mats each.
- pf.lens (Camera Room): cap 85 / 40k, at most 8 lights (plan: 3). Pickups take at most 2 Mats each. Estimate only.
- pf.wing: cap 55 / 25k, at most 8 lights (plan: 2, cool). Estimate only.
- pf.workshop: cap 75 / 30k, at most 4 light candidates. Estimate about 50 / 15k (WS-D08).
- pf.study: cap 60 / 20k, at most 3 light candidates. Estimate about 38 / 10.5k (WS-D08).
- pw.starry (G): at most 90 batches / 20k tris and 4 lights (G-D011).
- Per hero: authored at most 8,000 tris and 4 batches with no Ultra twins. Code fallback: DECA 4 / 850, gantry 4 / 2.5k, camera 2 / 2.1k, robot 2 / 1.4k. X-T5 viewmodel at most 2,500 tris, outside zone budgets.
- Per door: padless, 0 device batches, 1 lintel canvas (the Foyer's side doors carry 2). A door print adds 1 PrintCard batch to its source room. The replica sets total at most 4k tris in the Gallery diorama (est.; verify they are not audited).
- Ultra-only detail: Brass/Gilt costs +1 batch once per zone and Trim +0. Ultra twins count on every tier, so they never count as budget relief.
- Each new Mat in a zone costs +1 batch: Gilt, Marble, Velvet (net 0 only as a full TextileRed swap), Flame, Silver.
- GPU: pools on vs pools off on Low must stay within 1.0 ms at 1080p, otherwise Low falls back to emissive flames only. Every Place stays within 25 ms (art bible).
- Routes at 4.5 m/s (M-QA): fast path (Foyer, Gallery bay 1, the Workshop print, the Workshop inlay) within 60 s, modelled at 34 s. Everything path (Study bureau, 8 frames, Workshop, Hall at maximum, Camera Room) within 180 s, modelled at 145 s.
- Download: the first Manor visit measures 18.0 MB (gzip); up/web-diet saves about 2.8 MB raw. Each authored hero FBX is 2 MB or less in the repo, about 0.6 MB or less in Web.data (est.).
- Boot: +2 diorama captures for the door prints. Streaming target: a Lazy room's first build within 300 ms, hard cap 500 ms.
