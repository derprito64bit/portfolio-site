// The one content loader. It validates content/*.json (schema v2) at import time, so an invalid file fails the
// build with every error listed. Pages import from here, never from content/ directly.
import projectsJson from '../../../content/projects.json';
import honoursJson from '../../../content/honours.json';
import worldsJson from '../../../content/worlds.json';
import profileJson from '../../../content/profile.json';
import tokensJson from '../../../content/tokens.json';
import { validateContent, frameCode, hasToken } from './validate.js';
import type { Content, Honour, Profile, Project, ProjectView, World } from './types.ts';

export type * from './types.ts';

const lookIds: string[] = tokensJson.filmLooks.ids;
const { errors } = validateContent({
  projects: projectsJson,
  honours: honoursJson,
  worlds: worldsJson,
  profile: profileJson,
  lookIds,
});
if (errors.length) {
  throw new Error(`Content v2 is invalid (${errors.length}):\n  ${errors.join('\n  ')}`);
}

const projects: ProjectView[] = (projectsJson.projects as unknown as Project[]).map((p, i) => {
  const frame = frameCode(i);
  return {
    ...p,
    frame,
    linkName: `${frame}, ${p.title}`,
    href: `/work/${p.slug}/`,
    noindex: hasToken(JSON.stringify(p)),
  };
});

const honours = honoursJson as unknown as { awards: Honour[]; medals: Honour[] };
const worlds = (worldsJson.worlds as unknown as World[]);
const profile = profileJson as unknown as Profile;

export const content: Content = Object.freeze({
  projects,
  featured: projects.filter((p) => p.featured),
  honours: { awards: honours.awards, medals: honours.medals },
  worlds,
  profile,
  hasPlaceholders: [projectsJson, honoursJson, worldsJson, profileJson].some((f) => hasToken(JSON.stringify(f))),
});

export function projectBySlug(slug: string): ProjectView {
  const p = projects.find((x) => x.slug === slug);
  if (!p) throw new Error(`No project with slug "${slug}" in content/projects.json`);
  return p;
}

/** Split a string into text and token parts so pages can render tokens as placeholder slots (W-D022). */
export function splitTokens(s: string): { text: string; token: boolean }[] {
  const out: { text: string; token: boolean }[] = [];
  const re = /\[PLACEHOLDER: [^[\]\r\n]{1,80}\]/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), token: false });
    out.push({ text: m[0], token: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), token: false });
  return out;
}

export { hasToken, frameCode };
