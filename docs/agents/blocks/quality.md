# Quality bars

## Three levels of polish

Every feature passes all three, in order. Do not stop at level 1, and do not call level 2 finished.

1. **Function.** Does it work, at every gate viewport, with and without WebGL, with reduced motion?
2. **Quality.** Does it look correct in the rendered browser: spacing, type, alignment, contrast, no layout
   shift, no clipping, a clean console?
3. **Art direction.** Does it feel exceptional, and like this portfolio rather than any portfolio?

## Anti-slop questions

Ask these of the rendered page, not the code. Anything that answers "yes" to a negative question is redesigned
or cut.

- Does anything look templated, or like a component library's default?
- Does any section feel generated on its own, unconnected to the sections around it?
- Are there unnecessary cards, badges or pills?
- Are there generic gradients, blobs or glassmorphism?
- Are there decorative objects or effects that mean nothing?
- Is there empty self-promotional copy, or a claim the owner never made?
- Is there visual repetition: the same layout, reveal or hover used everywhere?
- Does the typography feel like a default?
- Do transitions feel arbitrary, or would they be the same on any other site?
- Is the WebGL merely decoration, or does it carry meaning between beats?
- Is the work ever visually subordinate to interface chrome?
- Does the site have a point of view?

## Story gate

The site tells one story, one person, in four beats. Every section, effect and line of copy serves a beat, or it
is cut.

1. **Identity (first 10 s):** who this is.
2. **Best work (first 60 s):** the strongest projects, shown well.
3. **Everything (3 min):** all projects, awards and medals.
4. **Craft (10 min, desktop):** the Manor, its camera and the Painting Worlds, reached from the 2D site.

## Delete before adding

Before adding anything, name what you would remove instead. In polish passes, remove first: unnecessary copy,
UI, sections, decorative effects, repeated animations, cards, badges and weak content. Nothing stays because an
agent already spent time on it.

## Banned phrases

These never appear in copy, docs or agent output. The gate scans for them (case-insensitive):

`seamless`, `elevate`, `immersive journey`, `unleash`, `cutting-edge`, `bento`, `glassmorphism`,
`revolutionize`, `next-level`, `world-class`

```text
\b(seamless(ly)?|elevat(e|es|ed|ing)|immersive journey|unleash(es|ed|ing)?|cutting[- ]edge|bento|glassmorphism|revolutioni[sz](e|es|ed|ing)|next[- ]level|world[- ]class)\b
```

This file and the gate scripts that hold the list are the only places it may appear.
