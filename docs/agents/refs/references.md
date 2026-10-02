> **Fact pack `web-refs`**, Wave 0.5 (2026-10-02). It was researched by a Sonnet specialist and spot-checked by an independent skeptic,
> whose verdict was `fix`. **The corrections at the end override the text above them.** Claims are labelled
> measured, documented or estimate.

## Owner-named references (2026-10-02, these outrank the survey below)

| Site | Award | Credited tech | What the owner means by it |
|---|---|---|---|
| [PORTFOLIO ZXC](https://www.awwwards.com/sites/portfolio-zxc) (portfolio-zxc.com) | Honorable Mention, 2026-08-03 | Three.js, Blender, Vite; 3D, Unusual Navigation, Gallery, Interaction Design | A 2D site that uses **3D models heavily**: a tactile keyboard that morphs into project spaces, a "clockwork iris" loading screen, a desktop-room interface. Models are built in Blender and rendered in three.js |
| [Jesper Landberg](https://www.awwwards.com/sites/jesper-landberg-4) (jesperlandberg.com) | SOTD + Developer Award, 2026-09-29 (7.73 / DEV 8.17) | GSAP, Three.js, Nuxt.js; Animation, Infinite Scroll | A 2D, black-and-white editorial site whose **3D-driven effects and transitions** (home to project, project to project, home to profile) are mesmerising |

Takeaway: the Front Door is a 2D layout with **real 3D** at its heart: models and scenes made in Blender and
rendered with three.js, and WebGL transitions choreographed with GSAP. Study the techniques; never copy them.


# Web references fact pack (Track W), 2026-10-02

Method: Awwwards pages fetched (documented: award, date, credited tech, description, palette). Live sites loaded in Chromium via playwright-cli, 1440x900 and 390x844, 6 s after navigation; DOM probe for canvas count, computed fonts, background, horizontal overflow. **Not measured:** easing, durations, hover and page-transition feel, reduced-motion behaviour (no scroll or pointer scripting, no frame traces). Motion fields below are limited to Awwwards-documented features and what is visible in the hero frame; anything beyond is labelled estimate. Library detection is an HTML-string heuristic and can false-positive.

Screenshots: C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\<slug>-1440.png and -390.png (all 24 captured, none blocked).

Cut from the candidate list: Studio K95 (Honorable Mention, 2018) and Produx (Honorable Mention, 13 Jun 2026) do not qualify. SSTR has no resolvable Awwwards slug. Replaced by Pensatori Irrazionali, Leo Parpeix, Gionatan Nese (all SOTD, Sep 2026). Michael Gatt is a composer and Pensatori a creative house, so "personal or small studio" is stretched for those two.

## The 12 (documented = Awwwards page; measured = my probe)
1. **Jesper Landberg** jesperlandberg.com. SOTD 29 Sep 2026. GSAP, Three.js, Nuxt, Infinite Scroll. Signature: the project list is a 3D curved-card gallery floating over a grid floor, no page scroll (measured: scrollHeight = viewport, 1 canvas). Single sans, white on black, tiny uppercase UI. Mobile (measured): same site, cards stack vertically, no overflow. Borrow: one spatial metaphor replaces the card grid. Avoid: custom scroll model with no native scroll (reduced-motion and a11y cost; estimate).
2. **Meer Mohsin** meermohsin.me. SOTD 26 Sep 2026. HTML5, GSAP, Three.js. Measured: Lenis present, 3 canvases, scrollHeight 28172 px at desktop. Signature: a red chrome-wing emblem hero with giant clipped type and blurred secondary copy; palette #990000 / #090909 (documented). Mobile: works, 4 canvases, 23294 px tall (heavy). Borrow: one iconic object plus one accent colour. Avoid: 28k px of scroll-jacked story and low-contrast blurred copy (hero text unreadable at rest).
3. **Gil Huybrecht** gilhuybrecht.com. SOTD 21 Sep 2026. Next.js, DatoCMS, WebGL, Infinite Scroll. Signature: the homepage IS an index, a text list of services and awards (SOTD 15x etc.) above project strips, each project shown as 2 to 5 numbered thumbnails with a Grid / Gallery toggle (measured visually). White on near-black #0D0D0F, one sans, no decorative type. Mobile (measured): canvas count drops 1 to 0, thumbnails go 2-up, 5174 px tall. Borrow: numbered, toggleable index instead of cards; drop WebGL on mobile. Avoid: nothing here; risk is plainness without distinctive motion.
4. **Michael Gatt** michaelgatt.com. SOTD 18 Aug 2026. WebGL, Vue, Nuxt. Signature: sound-gate loader, "click anywhere to turn on your sound" with words staggered on a diagonal, then "enter without sound". Zapf Humanist, #0F0F0F/#CFCFCF. Documented features: player equalizer, scroll storytelling on About, interactive loader. Mobile: identical gate. Borrow: opt-in sound with a visible silent path. Avoid: a blank gate hides all content from a crawler or a slow device (hero frame is just text).
5. **HAOQI.DESIGN** haoqi.design. SOTD 14 Aug 2026. Next.js, WebGL, Figma. Signature: glossy 3D "hello" script with a 3D cursor arrow over a sky-blue field and a crosshair grid; mono HUD readouts (GMT clock, 0720 X 0450 Y). Fonts: custom "tiktok" sans plus mono (measured). Theme toggle and sound toggle in nav. Mobile (measured): keeps canvas, headline moves up, grid lines retained, 1 page-height hero. Borrow: HUD micro-text as texture. Avoid: five font treatments in one hero.
6. **Pensatori Irrazionali** pensatori-irrazionali.com. SOTD 20 Sep 2026. WebGL, GSAP, Three.js. Measured: 4 canvases desktop, 1 mobile; 13453 px / 9004 px tall; fonts helveticaNow, PP Editorial, Some Type Mono, Ballet. Signature: a 3D ribbon of client logos sweeping across a light grey page; documented: menu with video, custom 404, loader, "Universe" WebGL gallery. Borrow: canvas count reduced on phone. Avoid: client-logo wall as the hero proof (reads as agency template).
7. **Leo Parpeix** leoparpeix.com. SOTD 14 Sep 2026. WebGL, After Effects, Blender (documented); Webflow detected. Signature: a rendered clay-toned studio scene with a soft flower sculpture as hero, grain overlay, headline "Driven by detail. Obsessed with seamless motion." Measured: 2 canvases both sizes, 13231 / 8320 px. Mobile (measured): same scene re-cropped, no overflow. Borrow: Blender-baked, single-palette scene is the brand. Avoid: relying on a heavy prerendered scene without a lite fallback (estimate).
8. **Gionatan Nese '26** gionatannese.com. SOTD 5 Sep 2026. WebGL, Three.js, GSAP, Infinite Scroll, Sound. Signature: a floating radial cloud of project thumbnails with a numbered "Creative Space 1/2/3" switcher, white void. Fonts: Lay Grotesk plus Teodor serif (measured). Documented WPO 7.8/10. Mobile (measured): identical layout, nav pills fit, no scroll. Borrow: tiny thumbnails as navigation. Avoid: 30 px thumbnails are unreadable and have tiny touch targets on 390 px.
9. **G. Colombel** guillaumecolombel.fr. Nominee 24 Sep 2026. WebGL, Three.js (documented). Measured: 2 canvases, no page scroll, Neue Montreal. Signature: each project is a 3D world; hero is a glowing monolith in a fog desert with extruded outlined type bending around the horizon. Mobile: same scene, monolith scales to fit. Borrow: project = environment, not thumbnail. Avoid: audio and heavy scene on first load.
10. **Alejandro HA** alejandroha.com. Nominee 23 Sep 2026. GSAP, Barba.js, Webflow (documented; measured: Lenis, 0 canvases). Signature: 72 px wide-tracked serif-sans "ALEJANDRO [HA]" over a monochrome self-portrait, entirely DOM, no WebGL. Font atyp-bl-variable. Documented: scroll-driven services transition. Mobile (measured): heading wraps to 2 lines at 38 px, scrollHeight 10026. Borrow: proof that GSAP + Barba without WebGL is Awwwards-grade. Avoid: pill CTA stacks that crowd the hero on phone.
11. **kstoimenov (Portfolio '26)** kstoimenov.com. Nominee 28 Sep 2026. GSAP, Figma. Measured: Next.js, 2 canvases, lausanne + manier fonts. Signature: vertical-ribbed green gradient shader behind a headline that alternates sans and italic serif lines ("to Wow's", "remarkable"), floating pill nav at the bottom. Documented: custom cursor, follow menu, scroll testimonials. Mobile (measured): pill nav docks bottom, CTA full width, 14107 px. Borrow: sans/italic-serif line alternation, thumb-reachable bottom nav. Avoid: neon gradient as the only identity.
12. **John Gearhart** johngearhart.me. Nominee 28 Sep 2026. Awwwards credits CSS, HTML5, JavaScript (probe heuristically also finds GSAP/Barba; unverified). Signature: full-screen "swipe up or down to browse" case-study carousel in a rounded image frame with colour-swapped backgrounds, condensed display type (Bebas Neue, Neue Haas, Heathergreen). Documented: frosted page transitions, 3D icon nav. Mobile (measured): works, no overflow, image reflows. Borrow: full-bleed single project per screen with a swipe affordance. Avoid: stock-fashion placeholder content (the demo project is "Ana Deufont, April 2022").

## Patterns across the set
- Awwwards-credited tech (documented, n=12): WebGL or Three.js 10, GSAP 7, Nuxt/Next 5, Lenis detected on 9 sites (measured heuristic), Barba 1 to 2, Webflow 2.
- No card grid. Replacements: curved 3D gallery, radial thumbnail cloud, numbered thumbnail index, project-as-world, full-screen swipe carousel.
- Index pages are mostly 1 to 2 type families plus mono or italic serif accent; palettes are 2 to 3 colours, black/white dominant (6 of 12 are black or white with one accent).
- Hero is one signature object (monolith, flower, ribbon, "hello" script), not a headline wall.
- Mobile strategy (measured): keep the same concept, shrink canvas count (Pensatori 4 to 1, Gil 1 to 0), nothing overflowed horizontally at 390 px.
- Native scroll heights of 8000 to 28000 px are normal for story-driven sites; gallery-style sites have none.
- Free-tool check: GSAP (incl. ScrollTrigger), Three.js, Lenis, Barba are free; Webflow, DatoCMS, Figma have paid tiers and none is needed.

## Traps to avoid
- Gating content behind sound or a loader (Gatt hero is blank text).
- Blurred low-contrast hero copy (Meer Mohsin).
- Tiny thumbnails as the only nav (Nese) on touch.
- Heavy 3D on mobile with no reduced canvas count.
- Placeholder or stock project content (Gearhart).
- Copying a signature: ribbon, monolith, "hello", curved cards, radial cloud and ribbed gradient are each one author's identity.
- Unmeasured motion claims: durations and easing here are NOT measured; specialists should instrument a candidate site before quoting numbers.

Housekeeping: one stray snapshot file was created by my first playwright-cli call at C:\Users\Aaron\Documents\GitHub\project.ion\.claude\worktrees\overhaul\.playwright-cli\page-2026-10-02T20-48-48-397Z.yml; deletion was denied by the permission classifier, so the owner should remove it. All other output is under the evidence folder (including _snap scratch files).

## Verification corrections (these override the text above)

- **Claim:** Patterns: Awwwards-credited tech (documented, n=12): WebGL or Three.js 10, GSAP 7, Nuxt/Next 5, Webflow 2.
  - **Correction:** The pack's own per-item Awwwards tech fields give WebGL or Three.js on 9 sites (Alejandro HA, kstoimenov and Gearhart have none). They give GSAP on 6 sites, because Gearhart has no GSAP credit. Nuxt or Next is credited on 4 sites (Jesper, Gil, Gatt, Haoqi); kstoimenov's Next.js is only a probe result. Webflow is credited on 1 site (Alejandro); Leo's Webflow is a heuristic detection. The headline counts mix documented and measured data and overstate the documented totals. (source: Pack items[].tech vs awwwards.com/sites/* (fetched: jesper-landberg-4, gil-huybrecht, michael-gatt, haoqi-design, alejandro-ha-web-developer, portfolio-26-1, john-gearhart-portfolio-2026))
- **Claim:** Lenis detected on 9 sites (measured heuristic).
  - **Correction:** Only Meer Mohsin, Gil Huybrecht and Alejandro HA are named as Lenis sites anywhere in the pack. The per-site items support 3 at most, not 9. I could not re-run the probe, so the figure is unsupported. (source: Pack items[].effects and docMarkdown; no probe output is attached)
- **Claim:** John Gearhart: 'Awwwards credits CSS, HTML5, JavaScript'.
  - **Correction:** The Awwwards page lists CSS3, HTML5 and JavaScript, plus 3D, Gestures/Interaction and Microinteractions. This is minor. (source: https://www.awwwards.com/sites/john-gearhart-portfolio-2026)

## Unsupported claims (treat as estimates until re-sourced)

- HAOQI.DESIGN 'Documented: theme and sound toggles in nav'. The Awwwards page text I fetched does not mention theme or sound toggles. They may be visible only on the live site, so this is a measured or seen claim, not a documented one.
- '6 of 12 are black or white with one accent'. No per-site data supports this, and the pack does not say how sites were counted.
- Gearhart 'demo project is Ana Deufont, April 2022'. The live site shows 'COMPLETED April 2022' but a text fetch did not show 'Ana Deufont'. The name could be in an image, or it could be wrong.
- Probe-based measurements (canvas counts, scrollHeights such as 28172, 23294, 13453 and 14107, computed fonts, mobile overflow). I did not re-run the probe, so they are unverified. The screenshots exist for all 24 captures, but I did not open them.
- Internal inconsistency: kstoimenov scrollHeight is 14179 in the item and 14107 in the markdown (the markdown figure is labelled mobile, so this may be a desktop vs mobile difference).
- The Awwwards pages carry no palette for Haoqi, Leo or Alejandro. The pack marks these as measured, which is acceptable, but Alejandro's 'blue pill CTA' and the Leo and Haoqi colours are unverifiable here.
- 'Produx (Honorable Mention, 13 Jun 2026)' was not checked.

Verifier notes: I fetched all 12 Awwwards pages and checked 15+ load-bearing claims. These matched the cited source:
- All 12 award statuses and dates (SOTD or Nominee, plus the dates).
- The credited tech lists for Jesper, Meer, Gil, Gatt, Haoqi, Pensatori, Leo, Gionatan, Colombel, Alejandro and kstoimenov.
- Palettes: Jesper black and white, Meer #990000 and #090909, Gil #0D0D0F, Gatt #0F0F0F and #CFCFCF, Pensatori #4c4c4c and #f5f5f5, Gionatan black and white.
- Scores: Jesper creativity 8.04, Meer animations 8.0, Haoqi animations 8.8, Gatt dev 7.87, Leo creativity 8.04 and dev 7.47, Gionatan WPO 7.8 and animations 7.6.
- Pensatori's documented elements: loader, menu with video, Universe gallery, 404 page.
- Alejandro's 'Scroll-Driven Services Transition'.
- Studio K95 as Honorable Mention, 18 Feb 2018.
- Gatt as a composer, and the 'creative house' label for Pensatori.

The pack is mostly sound at the per-site level and honest about what it did not measure. The main fixes are the aggregate tech counts in 'Patterns across the set', which are wrong or mix heuristic and documented data, and the Lenis 'on 9 sites' figure, which has no support. Add this note for builders: G. Colombel's Awwwards page highlights a WebGPU-powered carousel, which the pack omits. It also lists a stray .playwright-cli file as left in the worktree, but that path no longer exists, so it was already cleaned up or is not in this checkout. Builders should treat the counts as approximate and use only the per-site entries.

## Known gaps

- Motion character (easing, durations, springiness, hover and page-transition feel) NOT measured for any site: no scroll or pointer scripting, no frame traces; only Awwwards-documented feature names and static hero frames.
- prefers-reduced-motion behaviour not observed on any site.
- Library detection is an HTML-string regex heuristic (three, lenis, barba can false-positive, e.g. John Gearhart); only Awwwards credits are documented.
- Studio K95 (Honorable Mention 2018) and Produx (Honorable Mention 2026-06-13) disqualified; SSTR slug unresolvable (404); replaced with Pensatori Irrazionali, Leo Parpeix, Gionatan Nese.
- Michael Gatt (composer) and Pensatori Irrazionali (creative house) only loosely fit personal or small-studio.
- Jesper Landberg fonts not identifiable (generic 'sans' stack); Awwwards pages gave no palette for several sites.
- Screenshots are single frames 6 s after load; heros with loaders or scroll-driven states may differ from what a user sees later.
- Stray file left in the worktree: C:\Users\Aaron\Documents\GitHub\project.ion\.claude\worktrees\overhaul\.playwright-cli\page-2026-10-02T20-48-48-397Z.yml (created by first playwright-cli open before output dir was redirected; my delete was denied by the permission classifier). Owner should remove it.

## Local evidence (not committed; third-party screenshots stay outside the repos)

- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\jesper-landberg-1440.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\jesper-landberg-390.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\meer-mohsin-1440.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\meer-mohsin-390.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\gil-huybrecht-1440.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\gil-huybrecht-390.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\michael-gatt-1440.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\michael-gatt-390.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\haoqi-design-1440.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\haoqi-design-390.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\pensatori-irrazionali-1440.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\pensatori-irrazionali-390.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\leo-parpeix-1440.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\leo-parpeix-390.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\gionatan-nese-1440.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\gionatan-nese-390.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\g-colombel-1440.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\g-colombel-390.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\alejandro-ha-1440.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\alejandro-ha-390.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\kstoimenov-1440.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\kstoimenov-390.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\john-gearhart-1440.png`
- `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\factpacks\web-refs\john-gearhart-390.png`
