/**
 * Demo catalog. Every entry is a real, playable open film from the Blender Foundation, released under
 * CC BY 3.0. Video files are Wikimedia Commons VP9 transcodes (CORS-enabled, range requests supported).
 * Durations come from the Commons file metadata, not from guesses. No chapter or caption tracks are
 * published for these files, so none are claimed: the Scenes wheel shows labelled timed sections instead.
 */
export interface Chapter {
  start: number;
  end?: number;
  title: string;
  description?: string;
}

export interface Variant {
  /** Which host serves this file. Two or more servers on a film enable the server picker.
   *  "mux" means `src` is a Mux public playback ID played through the official MuxVideo component. */
  server: string;
  /** Resolution label for separate quality files; omit for a single-quality source. */
  quality?: string;
  src: string;
}

export interface Film {
  id: string;
  title: string;
  creator: string;
  year: number;
  genre: string;
  description: string;
  /** Default file URL (used for credits and fallbacks). Playback goes through `variants`. */
  src: string;
  /** Seconds. Only set when verified from file metadata. */
  duration?: number;
  /** Returns a still frame URL at the given second, or null when the host cannot supply one. */
  frameAt: (seconds: number, width?: 330 | 500 | 960 | 1280) => string | null;
  license: { name: string; url: string };
  source: { label: string; url: string };
  /** Verified story chapters. Empty for every bundled film. */
  chapters: Chapter[];
  /** Every real, playable file for this film. `src` is the default one. */
  variants: Variant[];
  /** True only when the licence allows people to download the file. */
  downloadable: boolean;
  /**
   * Signature colours, chosen by hand from the film's own imagery. The skin re-colours itself from these,
   * and passes the accent through its contrast guard, so a film change is felt across the whole player.
   */
  palette: { accent: string; base: string; glow: string; ink: string; secondary: string };
}

export const SERVER_LABELS: Record<string, string> = {
  commons: 'Wikimedia Commons',
  archive: 'Internet Archive',
  mux: 'Mux',
};

const CC_BY_3 = { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' };

/** Wikimedia Commons renders still frames of videos on demand: .../{width}px-seek={s}-{file}.jpg */
function commonsFrame(hashPath: string, file: string) {
  return (seconds: number, width: 330 | 500 | 960 | 1280 = 500) =>
    `https://upload.wikimedia.org/wikipedia/commons/thumb/${hashPath}/${file}/${width}px-seek%3D${Math.max(
      0,
      Math.floor(seconds),
    )}-${file}.jpg`;
}

function commonsVideo(hashPath: string, file: string, rendition = '480p') {
  return `https://upload.wikimedia.org/wikipedia/commons/transcoded/${hashPath}/${file}/${file}.${rendition}.vp9.webm`;
}

/** The VP9 renditions Commons publishes for each film (240p, 480p, 1080p; checked via the Commons API). */
function commonsVariants(hashPath: string, file: string): Variant[] {
  return ['240p', '480p', '1080p'].map((q) => ({ server: 'commons', quality: q, src: commonsVideo(hashPath, file, q) }));
}

const BBB_FILE = 'Big_Buck_Bunny_4K.webm';
const SINTEL_FILE = 'Sintel_movie_4K.webm';
const TOS_FILE = 'Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm';

/**
 * Public Mux playback ID for Sintel (Blender Foundation, CC BY 3.0). Playback IDs are not secrets: anyone who
 * can watch the stream can read the ID. Override with VITE_SINTEL_MUX_PLAYBACK_ID to point at another asset.
 */
export const SINTEL_MUX_PLAYBACK_ID: string =
  (import.meta.env.VITE_SINTEL_MUX_PLAYBACK_ID as string | undefined)?.trim() ||
  'Yfu01a6CaOBqd01OovU02DLPF2kqH4GNseuJ4q7NEfmhCs';

export const FILMS: Film[] = [
  {
    id: 'sintel',
    title: 'Sintel',
    creator: 'Blender Foundation (Durian Open Movie Project)',
    year: 2010,
    genre: 'Fantasy short',
    description: 'A young woman searches a harsh world for the dragon she once befriended.',
    src: commonsVideo('f/f1', SINTEL_FILE),
    duration: 888.035,
    frameAt: commonsFrame('f/f1', SINTEL_FILE),
    license: CC_BY_3,
    source: { label: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Sintel_movie_4K.webm' },
    chapters: [],
    downloadable: true,
    // Ember Fantasy: deep plum and charcoal, warm ember light, ivory text.
    palette: { accent: '#ff9f5a', base: '#1a1119', glow: '#ff6a2c', ink: '#f6eee2', secondary: '#a5638f' },
    variants: [
      { server: 'mux', src: SINTEL_MUX_PLAYBACK_ID },
      ...commonsVariants('f/f1', SINTEL_FILE),
      { server: 'archive', src: 'https://archive.org/download/Sintel/sintel-2048-stereo_512kb.mp4' },
    ],
  },
  {
    id: 'tears-of-steel',
    title: 'Tears of Steel',
    creator: 'Blender Foundation (Mango Open Movie Project)',
    year: 2012,
    genre: 'Sci-fi short',
    description: 'Live action meets visual effects in a near-future story set in Amsterdam.',
    src: commonsVideo('1/10', TOS_FILE),
    duration: 734.055,
    frameAt: commonsFrame('1/10', TOS_FILE),
    license: CC_BY_3,
    source: {
      label: 'Wikimedia Commons',
      url: 'https://commons.wikimedia.org/wiki/File:Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm',
    },
    chapters: [],
    downloadable: true,
    // Cyber Steel: industrial navy, cyan signal light, cool steel, silver text.
    palette: { accent: '#5cd3ff', base: '#0a1322', glow: '#2b8cff', ink: '#e7eef6', secondary: '#8ea4ba' },
    variants: commonsVariants('1/10', TOS_FILE),
  },
  {
    id: 'big-buck-bunny',
    title: 'Big Buck Bunny',
    creator: 'Blender Foundation (Peach Open Movie Project)',
    year: 2008,
    genre: 'Comedy animation',
    description: 'A gentle giant of a rabbit gets fed up with three bullying rodents.',
    src: commonsVideo('c/c0', BBB_FILE),
    duration: 634.553,
    frameAt: commonsFrame('c/c0', BBB_FILE),
    license: CC_BY_3,
    source: { label: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm' },
    chapters: [],
    downloadable: true,
    // Woodland Cinema: deep forest green, warm cream, soft gold, a restrained lime accent.
    palette: { accent: '#c4df7c', base: '#0e1a12', glow: '#d8b25a', ink: '#f3ebd5', secondary: '#e2bd66' },
    variants: [
      ...commonsVariants('c/c0', BBB_FILE),
      { server: 'archive', src: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4' },
    ],
  },
];

export const CATALOG: Film[] = FILMS;

export function findFilm(id: string | null | undefined): Film | undefined {
  return CATALOG.find((f) => f.id === id);
}

export interface Section {
  index: number;
  start: number;
  end: number;
  title: string;
  /** True when the title is a real, supplied chapter; false for generated equal time slices. */
  isChapter: boolean;
}

/**
 * Sections for the Scenes wheel. Uses verified chapters when the film has any;
 * otherwise equal time slices that are labelled as sections, never as story scenes.
 */
export function sectionsFor(film: Film, duration: number, count = 10): Section[] {
  if (film.chapters.length > 0) {
    return film.chapters.map((c, i) => ({
      index: i,
      start: c.start,
      end: c.end ?? film.chapters[i + 1]?.start ?? duration,
      title: c.title,
      isChapter: true,
    }));
  }
  if (!(duration > 0)) return [];
  const step = duration / count;
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    start: Math.floor(i * step),
    end: Math.floor(Math.min(duration, (i + 1) * step)),
    title: `Section ${i + 1}`,
    isChapter: false,
  }));
}

export const servers = (film: Film): string[] => [...new Set(film.variants.map((v) => v.server))];

/** Picks the file for a server and quality, falling back sensibly when that combination does not exist. */
export function pickVariant(film: Film, server?: string, quality?: string): Variant {
  const onServer = film.variants.filter((v) => v.server === (server ?? film.variants[0]?.server));
  const list = onServer.length > 0 ? onServer : film.variants;
  return (
    list.find((v) => v.quality === quality) ??
    list.find((v) => v.quality === '480p') ??
    list[0] ?? { server: 'commons', src: film.src }
  );
}
