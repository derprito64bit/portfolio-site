// Flux entry. The loader (HTML and inline CSS: the dot and its label) paints before any of this runs; the app and its
// libraries load only after that first frame, so nothing delays the first paint.
const start = () => import('./app');
requestAnimationFrame(() => setTimeout(start, 0));
