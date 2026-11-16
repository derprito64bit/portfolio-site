// The router (D-041, W-V1): the site's URLs and the history moves the Viewfinder makes.
//   /                 the intro;  /#work-NN  frame NN;  /#contact  the owner-info frame  (frames replaceState only)
//   /work/<slug>/     a project (pushed when a frame opens in the Viewfinder; a real page on a cold load)
//   .../#print-NN     a print in playback (pushed; Back closes it first)
// The query string rides along on every URL the app writes, so a ?vf-test session (D-055) stays one.

export type Route =
  | { kind: 'home'; frame: number | null; contact: boolean }
  | { kind: 'project'; slug: string; print: number | null };

const pad = (n: number) => String(n).padStart(2, '0');

export function parse(path: string = location.pathname, hash: string = location.hash): Route {
  const m = /^\/work\/([a-z0-9-]+)\/?$/.exec(path);
  if (m) {
    const p = /^#print-(\d+)$/.exec(hash);
    return { kind: 'project', slug: m[1], print: p ? Number(p[1]) : null };
  }
  const w = /^#work-(\d+)$/.exec(hash);
  return { kind: 'home', frame: w ? Number(w[1]) : null, contact: hash === '#contact' };
}

export const printHash = (n: number) => `#print-${pad(n)}`;
export const workHash = (n: number) => `#work-${pad(n)}`;
export const projectUrl = (slug: string, print?: number) => `/work/${slug}/${location.search}${print ? printHash(print) : ''}`;
export const homeUrl = (hash = '') => `/${location.search}${hash}`;

/** The hash moves playback makes on whatever page it is on. */
export interface HashHistory {
  push(hash: string): void;
  replace(hash: string): void;
  back(): void;
}
export const hashHistory: HashHistory = {
  push: (h) => history.pushState({ vf: 'print' }, '', `${location.pathname}${location.search}${h}`),
  replace: (h) => history.replaceState(history.state, '', `${location.pathname}${location.search}${h}`),
  back: () => history.back(),
};
