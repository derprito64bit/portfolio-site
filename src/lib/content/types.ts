// Content schema v2 (W-D005). These mirror the declared classes in validate.js and the Manor's ContentV2 C# classes.
export type Kind = 'software' | 'game' | '3d-art' | 'robotics-cad' | '';
export type LookId = 'standard' | 'candle' | 'vivid' | 'mono' | 'cyanotype';

export interface Link {
  label: string;
  href: string;
}

export interface Media {
  type: 'image' | 'model' | 'video';
  src: string;
  alt: string;
  caption: string;
  poster: string;
  /** WebVTT path; required when audio is true. */
  captions: string;
  audio: boolean;
  decorative: boolean;
}

export interface Project {
  slug: string;
  title: string;
  kind: Kind;
  role: string;
  year: string;
  blurb: string;
  body: string[];
  tools: string[];
  url: string;
  links: Link[];
  demo: string;
  cover: string;
  coverAlt: string;
  focus: { x: number; y: number };
  media: Media[];
  look: LookId;
  tint: string;
  featured: boolean;
  hero: boolean;
  placeholder: boolean;
  source: string;
}

export interface Honour {
  slug: string;
  title: string;
  event: string;
  placement: string;
  year: string;
  kind: '' | 'glass' | 'trophy' | 'plaque' | 'certificate' | 'medal';
  metal: '' | 'gold' | 'silver' | 'bronze';
  photo: string;
  photoAlt: string;
  project: string;
  hero: boolean;
  placeholder: boolean;
  source: string;
}

export interface World {
  slug: string;
  key: string;
  title: string;
  status: '' | 'live' | 'building' | 'planned';
  publishAfter: string;
  credit: { mode: '' | 'public-domain' | 'original'; artist: string; work: string; year: string; museum: string; museumUrl: string };
  still: string;
  stillAlt: string;
  teaser: boolean;
  placeholder: boolean;
  source: string;
}

export interface Profile {
  schema: 2;
  owner: string;
  name: string;
  line: string;
  about: string[];
  email: string;
  links: Link[];
  placeholder: boolean;
  source: string;
}

/** A project with build-derived fields (never authored). */
export interface ProjectView extends Project {
  /** Frame code in file order: 1A, 2A, ... (W-D022). */
  frame: string;
  /** Link name for prints: '{frame}, {title}'. */
  linkName: string;
  /** Route, always with a trailing slash. */
  href: string;
  /** Any token in the entry means the page ships noindex (W-D027). */
  noindex: boolean;
}

export interface Content {
  projects: ProjectView[];
  /** Featured projects in file order; the first 3 are the enlargements, the first is the hero print. */
  featured: ProjectView[];
  honours: { awards: Honour[]; medals: Honour[] };
  worlds: World[];
  profile: Profile;
  /** True while any token remains anywhere in content (the footer proof line, W-D023). */
  hasPlaceholders: boolean;
}
