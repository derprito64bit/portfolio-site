// Content for the Flux concept. owner-facts.md is the only source of owner facts; everything else is a typed placeholder.
import projectsData from '../../../content/projects.json';
import honoursData from '../../../content/honours.json';

/** The owner's real name is not known yet (owner-facts.md: TO CONFIRM). One constant, shown with a placeholder tag. */
export const OWNER_NAME = 'Your Name';
export const NAME_IS_PLACEHOLDER = true;
export const HANDLE = 'derprito64bit';
export const GITHUB = 'https://github.com/derprito64bit';

export interface Project {
  slug: string;
  n: string;
  index: number;
  title: string;
  role: string;
  year: string;
  kind: string;
  blurb: string;
  body: string[];
  tools: string[];
  media: { type: string; alt: string; caption: string }[];
  tint: string;
}

export const projects: Project[] = projectsData.projects.map((p: any, i: number) => ({
  slug: p.slug,
  n: String(i + 1).padStart(2, '0'),
  index: i,
  title: p.title,
  role: p.role,
  year: p.year,
  kind: p.kind || '[PLACEHOLDER: kind of project]',
  blurb: p.blurb,
  body: p.body,
  tools: p.tools,
  media: p.media,
  tint: p.tint,
}));

export interface Honour {
  slug: string;
  type: 'Award' | 'Medal';
  n: string;
  title: string;
  event: string;
  placement: string;
  year: string;
}

export const honours: Honour[] = [
  ...honoursData.awards.map((a: any, i: number) => ({ slug: a.slug, type: 'Award' as const, n: String(i + 1).padStart(2, '0'), title: a.title, event: a.event, placement: a.placement, year: a.year })),
  ...honoursData.medals.map((m: any, i: number) => ({ slug: m.slug, type: 'Medal' as const, n: String(i + 1).padStart(2, '0'), title: m.title, event: m.event, placement: m.placement, year: m.year })),
];

/** Splits "[PLACEHOLDER: x]" into its tag and text so the page can type it visibly. */
export function ph(s: string): { placeholder: boolean; text: string } {
  const m = /^\[PLACEHOLDER:\s*(.*)\]$/.exec(s.trim());
  return m ? { placeholder: true, text: m[1] } : { placeholder: false, text: s };
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

/** A small stable hash of a slug, 0..1. */
export function seedOf(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}
