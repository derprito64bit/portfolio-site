# content/

The source of truth for what both doors show. The fork's `scripts/fork/sync-content.ps1` copies these files into
the Manor (`Assets/Portfolio/Resources/Portfolio/`). All files here are all rights reserved, see
[`../CONTENT-LICENSE.md`](../CONTENT-LICENSE.md).

| File | Holds |
|---|---|
| [`owner-facts.md`](owner-facts.md) | The only source of facts about the owner. Every entry stays `TO CONFIRM` until the owner confirms it. |
| [`projects.json`](projects.json) | Projects. All 8 are placeholders. `featured: true` picks the Manor's frames (it shows at most 8). |
| [`awards.json`](awards.json) | Awards and medals. Empty on purpose. |

## Rules

- **Placeholder until confirmed.** An entry keeps `"placeholder": true` until its facts are confirmed in
  `owner-facts.md`. Pages must render placeholders visibly as placeholders.
- **Never invent.** No names, dates, numbers, schools, employers or outcomes unless `owner-facts.md` has them.
- **Awards come from the owner.** The owner has said they have DECA glass awards and medals to add. The
  details (event, year, placing) are not known yet, so `awards.json` stays empty until the owner supplies them.
- **JsonUtility-safe JSON** (Unity reads these files): a top-level object, no dictionaries, no top-level arrays.
- **Images:** PNG or JPG masters only. The web build derives AVIF and WebP, since Unity cannot import those.
  Never AI-generated images.
