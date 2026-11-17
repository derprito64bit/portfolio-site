// Content schema v2 (W-D005). These mirror the declared classes in validate.js and the Manor's ContentV2 C# classes.
export type Kind = 'software' | 'game' | '3d-art' | 'robotics-cad' | '';
export type LookId = 'standard' | 'candle' | 'vivid' | 'mono' | 'cyanotype';

export interface Link {
  label: string;
  href: string;
}

export interface Media {
  type: 'image' | 'model' | 'video';
  /** The original under MEDIA_SRC: media/<slug>/<file> ('' while a placeholder). */
  src: string;
  /** Declared source pixels (0 when unknown); the file's real size wins (D-042). */
  w: number;
  h: number;
  alt: string;
  caption: string;
  poster: string;
  /** WebVTT path; required when audio is true. */
  captions: string;
  audio: boolean;
  decorative: boolean;
  /** D-044: hero, normal or detail. */
  scale: 'hero' | 'normal' | 'detail';
  /** Video only: plays muted inline while visible. */
  loop: boolean;
  /** A placeholder entry renders a test chart at w x h (D-045). */
  placeholder: boolean;
}

/** One derived image in src/lib/content/media.json (scripts/build/images.mjs). */
export interface DerivedImage {
  type: 'image' | 'poster';
  hash: string;
  w: number;
  h: number;
  files: import('../prints/ladder.ts').LadderFile[];
  lqip: string;
}
/** A video or a model: the file copied as it is, sized by its poster. */
export interface DerivedVideo {
  type: 'video' | 'model';
  hash: string;
  file: string;
  bytes: number;
  poster: string;
}
/** A video's WebVTT captions, copied as they are. */
export interface DerivedCaptions {
  type: 'captions';
  hash: string;
  file: string;
  bytes: number;
}

/** A film print as the page renders it (src/components/print): the media entry, its files and its size. */
export interface PrintView {
  /** 1-based position in the roll. */
  n: number;
  /** "01" */
  index: string;
  /** "print-01": the figure's id and the playback hash. */
  id: string;
  type: Media['type'];
  alt: string;
  caption: string;
  decorative: boolean;
  loop: boolean;
  audio: boolean;
  /** The site URL of a clip's .vtt (a confirmed clip with audio), or '' when there is none. */
  captions: string;
  placeholder: boolean;
  /** The size the print is laid out at: the file's, else the declared one, else 3:2. */
  w: number;
  h: number;
  /** The image ladder (the poster's for a video), or null for a typed placeholder box (no file). */
  files: import('../prints/ladder.ts').LadderFile[] | null;
  lqip: string;
  /** The video file (site path), or '' (a placeholder clip has none). */
  video: string;
  size: import('../prints/size.ts').PackedPrint;
  sizes: string;
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
  /** "Project 01": the UI label (not a fact). */
  label: string;
  /** 1-based position in content order. */
  number: number;
  /** The film prints, laid out at build (src/lib/prints/size.ts). */
  prints: PrintView[];
}

export interface Content {
  projects: ProjectView[];
  /** Featured projects in file order; the first 3 are the enlargements, the first is the hero print. */
  featured: ProjectView[];
  honours: { awards: Honour[]; medals: Honour[] };
  profile: Profile;
  /** True while any token remains anywhere in content (the footer proof line, W-D023). */
  hasPlaceholders: boolean;
}
