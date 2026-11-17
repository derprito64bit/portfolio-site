// The roll and playback, as one lazy chunk for the Viewfinder: project/inapp.ts loads it with the prefetch (or at Open),
// so the home page's critical script stays lean. A cold /work/<slug>/ page imports them directly.
export { initRoll } from './roll';
export { initPlayback } from './playback';
