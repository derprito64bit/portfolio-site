# content/

The source of truth for what both doors show. The fork's `scripts/fork/sync-content.ps1` copies these files into
the Manor (`Assets/Portfolio/Resources/Portfolio/`). All files here are all rights reserved, see
[`../CONTENT-LICENSE.md`](../CONTENT-LICENSE.md).

| File | Holds |
|---|---|
| [`owner-facts.md`](owner-facts.md) | The only source of facts about the owner. Every entry stays `TO CONFIRM` until the owner confirms it. |
| [`projects.json`](projects.json) | Projects. All 8 are placeholders. `featured: true` picks the Manor's frames (it shows at most 8). |
| [`honours.json`](honours.json) | Honours (awards and medals), the one honours source since PLAN v2 (D-042). Each may name one project (`project`, a slug) or none. Empty on purpose. |
| [`awards.json`](awards.json), [`worlds.json`](worlds.json) | Retired by PLAN v2 (D-042, D-049); W-V0 deletes them. |

PLAN v2 (D-042) also adds content model v3: each project's `media` entries carry `type`, `src`, `w`, `h`, `alt`, `caption`, `poster`, `scale` (`hero`, `normal`, `detail`) and more. The build reads the real file sizes into `src/lib/content/media.json`, so prints are sized by the real image. Originals stay in the private portfolio-assets repo (D-056).

## Rules

- **Placeholder until confirmed.** An entry keeps `"placeholder": true` until its facts are confirmed in
  `owner-facts.md`. Pages must render placeholders visibly as placeholders.
- **Never invent.** No names, dates, numbers, schools, employers or outcomes unless `owner-facts.md` has them.
- **Honours come from the owner.** The owner has said they have DECA glass awards and medals to add. The
  details (event, year, placing, and the project each belongs to, if any) are not known yet, so `honours.json` stays empty until the owner supplies them.
- **JsonUtility-safe JSON** (Unity reads these files): a top-level object, no dictionaries, no top-level arrays.
- **Images:** PNG or JPG masters only. The web build derives AVIF and WebP, since Unity cannot import those.
  Never AI-generated images.
