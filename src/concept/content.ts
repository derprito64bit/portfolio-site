// Content for the Refraction concept. Owner facts come only from content/ (owner-facts.md is the source); every
// unknown is a visible typed placeholder.
import projectsData from '../../content/projects.json';
import honoursData from '../../content/honours.json';

/** The owner's real name is not known yet: ONE constant, shown with a visible placeholder tag. */
export const OWNER_NAME = 'Your Name';
export const HANDLE = 'derprito64bit';
/** TO CONFIRM (owner-facts.md, Links). */
export const GITHUB = 'https://github.com/derprito64bit';

/** The name set on two lines: the last word drops to the indented second line. */
export const nameLines: string[] = (() => {
  const w = OWNER_NAME.trim().split(/\s+/);
  if (w.length < 2) return [OWNER_NAME];
  return [w.slice(0, -1).join(' '), w[w.length - 1]];
})();

export interface Project {
  slug: string;
  num: string;
  index: number;
  title: string;
  role: string;
  year: string;
  blurb: string;
  body: string[];
  tools: string[];
  tint: string;
  media: { type: string; alt: string; caption: string }[];
  mode: number;
  seed: number;
}

function seedOf(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export const projects: Project[] = projectsData.projects.map((p, i) => ({
  slug: p.slug,
  num: String(i + 1).padStart(2, '0'),
  index: i,
  title: p.title,
  role: p.role,
  year: p.year,
  blurb: p.blurb,
  body: p.body,
  tools: p.tools,
  tint: p.tint,
  media: p.media.map((m) => ({ type: m.type, alt: m.alt, caption: m.caption })),
  // the four optical studies cycle; the seed varies each one
  mode: [0, 1, 2, 3, 1, 0, 3, 2][i % 8],
  seed: seedOf(p.slug),
}));

export const award = honoursData.awards[0];
export const medal = honoursData.medals[0];
