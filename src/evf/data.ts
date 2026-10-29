// Viewfinder concept: the only place content enters the concept. Everything comes from content/*.json and
// content/owner-facts.md; anything unknown stays a visibly typed placeholder.
import projectsJson from '../../content/projects.json';
import honoursJson from '../../content/honours.json';
import profileJson from '../../content/profile.json';

/** The owner's name, from content/profile.json (owner-facts.md: CONFIRMED 2026-10-29). */
export const OWNER_NAME: string = profileJson.name;
/** Known (TO CONFIRM): the GitHub account. */
export const HANDLE = 'derprito64bit';
export const GITHUB_URL = 'https://github.com/derprito64bit';

export interface Project {
  slug: string;
  index: number;
  label: string; // "Project 01" (UI label, not a fact)
  title: string;
  role: string;
  year: string;
  blurb: string;
  body: string[];
  tools: string[];
  url: string;
  media: { type: string; alt: string; caption: string }[];
  tint: string;
}

export interface Honour {
  slug: string;
  index: number;
  kind: 'award' | 'medal';
  label: string;
  title: string;
  event: string;
  placement: string;
  year: string;
  source: string;
}

export const projects: Project[] = projectsJson.projects.map((p, i) => ({
  slug: p.slug,
  index: i,
  label: `Project ${String(i + 1).padStart(2, '0')}`,
  title: p.title,
  role: p.role,
  year: p.year,
  blurb: p.blurb,
  body: p.body,
  tools: p.tools,
  url: p.url,
  media: p.media.map((m) => ({ type: m.type, alt: m.alt, caption: m.caption })),
  tint: p.tint,
}));

export const honours: Honour[] = [
  ...honoursJson.awards.map((a) => ({ ...a, kind: 'award' as const })),
  ...honoursJson.medals.map((m) => ({ ...m, kind: 'medal' as const })),
].map((h, i) => ({
  slug: h.slug,
  index: i,
  kind: h.kind,
  label: h.kind === 'award' ? 'Glass award' : 'Medal',
  title: h.title,
  event: h.event,
  placement: h.placement,
  year: h.year,
  source: h.source,
}));

export const isPlaceholder = (s: string) => /^\[PLACEHOLDER/i.test(s);
/** Splits "[PLACEHOLDER: what]" into its inner text for compact tags. */
export const phInner = (s: string) => s.replace(/^\[PLACEHOLDER:\s*/i, '').replace(/\]$/, '');
