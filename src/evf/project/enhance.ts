// The open project's own code, as one lazy chunk for the Viewfinder: project/inapp.ts loads it with the prefetch (or at
// Open), so the home page's critical script stays lean: the page fetch and adoption, the roll and playback. A cold
// /work/<slug>/ page imports the roll and playback directly.
export { loadArticle, prefetch, adopt } from './article';
export { wireView } from './view';
export { initRoll } from './roll';
export { initPlayback } from './playback';
