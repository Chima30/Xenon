import { useMedia } from '@videojs/react';
import { Video, VideoPlayer, usePlayer } from '@videojs/react/video';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CATALOG, findFilm, nextVariant, SINTEL_MUX_PLAYBACK_ID, pickVariant, SERVER_LABELS, sectionsFor, servers as serversOf, type Film, type Variant } from '../data/catalog';
import {
  addMoment,
  momentsFor,
  resumeTime,
  saveProgress,
  useMoments,
  useProgress,
} from '../data/stores';
import { MomentAtlas } from '../features/MomentAtlas';
import { isStalled } from './stall';
import { CinemaSkin, clamp, formatTime, type DiagRow, type Journey, type NavFilm, type ResolvedAtmosphere, type SkinScene, type ThumbnailAt, type TimelineMarker } from '../skin';
import { ShareIcon } from '../skin/icons';

const MuxVideo = lazy(() => import('@videojs/react/media/mux-video').then((m) => ({ default: m.MuxVideo })));

function FilmMedia({ film, variant }: { film: Film; variant: Variant }) {
  if (variant.server === 'mux') {
    return (
      <Suspense fallback={null}>
        <MuxVideo source={{ playbackId: variant.src }} playsInline preload="metadata" crossOrigin="anonymous" />
      </Suspense>
    );
  }
  const src = variant.src;
  return (
    <Video
      src={src}
      poster={film.frameAt(film.duration ? film.duration * 0.3 : 30, 960) ?? undefined}
      playsInline
      preload="metadata"
      // Wikimedia serves its files with CORS, so the Lightmeter and the slate may read the picture. Other hosts are
      // left as they are: if they do not allow it, the meter says "No reading" instead of breaking playback.
      crossOrigin={variant.server === 'commons' ? 'anonymous' : undefined}
    />
  );
}

/** Saves the resume position every few seconds while this film is the one loaded. */
function PlaybackSaver({ film, activeSrc, server }: { film: Film; activeSrc: string; server: string }) {
  const time = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const src = usePlayer((s) => s.currentSrc);
  const last = useRef(-100);
  const loaded = isLoaded(src, activeSrc, server);
  useEffect(() => {
    last.current = -100;
  }, [film.id]);
  useEffect(() => {
    if (!loaded || !(duration > 0) || time <= 0) return;
    if (Math.abs(time - last.current) >= 5) {
      last.current = time;
      saveProgress(film.id, time, duration);
    }
  }, [time, duration, loaded, film.id]);
  return null;
}

const fileName = (url: string) => decodeURIComponent(url.split('/').pop() ?? url);

/**
 * True once the player's current source belongs to the active variant.
 */
const isLoaded = (currentSrc: string, activeSrc: string, server: string) =>
  server === 'mux'
    ? // MuxVideo attaches the stream through a blob URL (or the stream URL itself); a file URL means it is still the old source.
      currentSrc.startsWith('blob:') || currentSrc.includes('mux.com') || currentSrc.includes(activeSrc)
    : currentSrc.includes(activeSrc) || currentSrc.includes(fileName(activeSrc));

interface TrailEntry {
  time: number;
  label: string;
}
interface Anchor {
  time: number;
}
/**
 * The demo page wears the player's atmosphere: its background, glow, accent and a soft wash of the film's artwork
 * follow whatever the skin settled on (the film's palette, or the viewer's own Appearance choices).
 */
const PAGE_VARS = ['--page-base', '--page-glow', '--page-accent', '--page-ink', '--page-art', '--page-sg-1', '--page-sg-2', '--page-sg-3', '--page-sg-4', '--page-sg-angle', '--page-sg-amb'] as const;
function usePageAtmosphere() {
  useEffect(
    () => () => {
      const root = document.documentElement;
      PAGE_VARS.forEach((v) => root.style.removeProperty(v));
      delete root.dataset.film;
    },
    [],
  );
  return useCallback((a: ResolvedAtmosphere) => {
    const root = document.documentElement.style;
    root.setProperty('--page-base', a.base);
    root.setProperty('--page-glow', a.glow);
    root.setProperty('--page-accent', a.accent);
    root.setProperty('--page-ink', a.ink);
    root.setProperty('--page-art', a.image ? `url("${a.image.replace(/"/g, '%22')}")` : 'none');
    // The page wears the player's spectrum, so the gradient continues past the player's edge.
    a.spectrum.forEach((c, i) => root.setProperty(`--page-sg-${i + 1}`, c));
    root.setProperty('--page-sg-angle', `${a.angle}deg`);
    root.setProperty('--page-sg-amb', String(a.ambient));
  }, []);
}

/** Demo-only hooks used by the test bench. The skin itself knows nothing about footage simulation. */
export interface BenchProps {
  overlay?: ReactNode;
  forceHighContrast?: boolean;
}

interface Props {
  filmId?: string;
  startTime?: number;
  endTime?: number;
  bench?: BenchProps;
}

export function PlayerPage({ filmId, startTime, endTime, bench }: Props) {
  return (
    <VideoPlayer>
      <PlayerBody initialId={filmId} initialTime={startTime} initialEnd={endTime} bench={bench} />
    </VideoPlayer>
  );
}

function PlayerBody({ initialId, initialTime, initialEnd, bench }: { initialId?: string; initialTime?: number; initialEnd?: number; bench?: BenchProps }) {
  const store = usePlayer();
  const media = useMedia() as { currentTime?: number } | null;
  const [film, setFilm] = useState<Film>(() => findFilm(initialId) ?? CATALOG[0]!);
  const progress = useProgress();
  const allMoments = useMoments();
  const moments = useMemo(() => momentsFor(allMoments, film.id), [allMoments, film.id]);

  const [serverId, setServerId] = useState<string | undefined>(undefined);
  const [qualityId, setQualityId] = useState<string>('480p');
  const variant = pickVariant(film, serverId, qualityId);
  const activeSrc = variant.src;
  const resumePlaying = useRef(false);

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [trail, setTrail] = useState<TrailEntry[]>([]);
  const [trailIdx, setTrailIdx] = useState(0);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const noticeSeq = useRef(0);
  const say = useCallback((message: string) => setNotice({ id: ++noticeSeq.current, message }), []);
  const onAtmosphere = usePageAtmosphere();

  // A seek that must wait for the new film's metadata (deep link, resume).
  const pending = useRef<number | null>(initialTime ?? resumeTime(progress[film.id]));
  const duration = usePlayer((s) => s.duration);
  const canPlay = usePlayer((s) => s.canPlay);
  const src = usePlayer((s) => s.currentSrc);

  useEffect(() => {
    const t = pending.current;
    if (t === null || !canPlay || !(duration > 0)) return;
    if (!isLoaded(src, activeSrc, variant.server)) return; // still the previous file's state
    pending.current = null;
    void store.seek(clamp(t, 0, Math.max(0, duration - 1)));
    if (resumePlaying.current) {
      resumePlaying.current = false;
      void store.play();
    }
    say(`Resumed at ${formatTime(t)}`);
  }, [canPlay, duration, src, film, activeSrc, variant.server, store, say]);

  const now = () => media?.currentTime ?? 0;

  /** Explicit film switch (the wheel's Play, or opening a capsule from another film). Optionally lands on a time. */
  const selectFilm = (id: string, at?: number) => {
    const next = findFilm(id);
    if (!next || next.id === film.id) return;
    pending.current = at ?? resumeTime(progress[next.id]);
    setServerId(undefined);
    setQualityId('480p');
    setAnchor(null);
    setTrail([]);
    setTrailIdx(0);
    setFilm(next);
    window.history.replaceState(null, '', `#/watch/${next.id}`);
    say(`Loading ${next.title}`);
  };

  /** Swap the file (quality or server) and come back to the same second, playing if it was playing. */
  const switchFile = (change: () => void, label: string) => {
    pending.current = now();
    resumePlaying.current = media ? !(media as unknown as { paused: boolean }).paused : false;
    change();
    say(`Switching to ${label}`);
  };

  // Stall guard. Open hosts sometimes serve a copy that never delivers (a broken transcode, a stuck CDN object).
  // If the film should be playing but is stuck (see isStalled), move to
  // the next copy of the same film at the same second and say so. Each copy is given up on at most once per film.
  const paused = usePlayer((s) => s.paused);
  const tried = useRef<Set<string>>(new Set());
  useEffect(() => {
    tried.current = new Set();
  }, [film.id]);
  const guard = useRef({ film, variant, switchFile, say });
  guard.current = { film, variant, switchFile, say };
  useEffect(() => {
    if (paused) return;
    let last = document.querySelector<HTMLVideoElement>('.cs-root video')?.currentTime ?? now();
    let still = 0;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const el = document.querySelector<HTMLVideoElement>('.cs-root video');
      const t = el?.currentTime ?? now();
      if (Math.abs(t - last) > 0.05) {
        last = t;
        still = 0;
        return;
      }
      still += 1000;
      if (!el || !isStalled(still, el)) return;
      window.clearInterval(id);
      const g = guard.current;
      tried.current.add(g.variant.src);
      const next = nextVariant(g.film, g.variant, tried.current);
      if (!next) {
        g.say(`${g.film.title} is not loading. Check the connection, or try again later.`);
        return;
      }
      const label = next.server === g.variant.server ? (next.quality ?? next.server) : (SERVER_LABELS[next.server] ?? next.server);
      g.switchFile(() => {
        setServerId(next.server);
        if (next.quality) setQualityId(next.quality);
      }, `${label}: this copy was not loading`);
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, activeSrc]);

  /** An intentional jump (scene, saved moment). Remembers where you were so you can come back. */
  const jumpTo = (time: number, label: string) => {
    const from = now();
    setAnchor((a) => a ?? { time: from });
    setTrail((t) => {
      const base = t.length === 0 ? [{ time: from, label: 'Where you were' }] : t.slice(0, trailIdx + 1);
      const next = [...base, { time, label }].slice(-10);
      setTrailIdx(next.length - 1);
      return next;
    });
    void store.seek(time);
    say(`Jumped to ${label}, ${formatTime(time)}`);
  };

  const returnToAnchor = () => {
    if (!anchor) return;
    void store.seek(anchor.time);
    say(`Returned to ${formatTime(anchor.time)}`);
    setAnchor(null);
    setTrail([]);
    setTrailIdx(0);
  };

  /** Journey Replay: revisit a stop on the trail without adding a new one. */
  const goJourney = (index: number) => {
    const i = clamp(index, 0, trail.length - 1);
    const entry = trail[i];
    if (!entry) return;
    setTrailIdx(i);
    void store.seek(entry.time);
    say(`${entry.label}, ${formatTime(entry.time)}`);
  };

  const saveNow = () => {
    const t = now();
    addMoment(film.id, t, `Moment at ${formatTime(t)}`);
    say(`Saved moment at ${formatTime(t)}`);
  };
  const saveLast = () => {
    const t = now();
    const from = Math.max(0, t - 10);
    addMoment(film.id, from, `Last 10 s before ${formatTime(t)}`);
    say(`Saved ${formatTime(from)}, the 10 seconds before where you are now`);
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/watch/${film.id}?t=${Math.floor(now())}`;
    try {
      await navigator.clipboard.writeText(url);
      say(`Link copied for ${formatTime(now())}`);
    } catch {
      say('Could not copy automatically. Copy the address bar after the move.');
      window.history.replaceState(null, '', `#/watch/${film.id}?t=${Math.floor(now())}`);
    }
  };

  // Scenes: verified chapters when the film has them, otherwise labelled equal sections.
  const sceneDuration = duration > 0 ? duration : (film.duration ?? 0);
  const sections = useMemo(() => sectionsFor(film, sceneDuration), [film, sceneDuration]);

  /** Scenes for the skin: authored chapters when they exist, otherwise plainly labelled sections. */
  const scenes = useMemo<SkinScene[]>(
    () =>
      sections.map((s) => ({
        start: s.start,
        end: s.end,
        title: s.title,
        authored: s.isChapter,
        description: s.isChapter ? film.chapters[s.index]?.description : undefined,
      })),
    [sections, film],
  );
  /** Real stills from Wikimedia Commons' frame service for the same open-licensed file. */
  const thumbnailAt = useCallback<ThumbnailAt>(
    (t, w) => film.frameAt(Math.max(0, Math.floor(t)), w >= 960 ? 960 : w >= 500 ? 500 : 330),
    [film],
  );

  /** The wheel's Movies face: every film, with its real still, facts and how far the viewer got. */
  const films = useMemo<NavFilm[]>(
    () =>
      CATALOG.map((f) => {
        const p = progress[f.id];
        const r = resumeTime(p);
        return {
          id: f.id,
          title: f.title,
          meta: [f.genre, String(f.year), f.duration ? formatTime(f.duration) : null, r ? `resume at ${formatTime(r)}` : null].filter(Boolean).join(' · '),
          description: `${f.description} ${f.creator}, ${f.license.name}.`,
          image: f.frameAt(f.duration ? f.duration * 0.3 : 30, 330),
          progress: p && p.duration > 0 ? p.time / p.duration : 0,
        };
      }),
    [progress],
  );
  const journey: Journey | null = trail.length > 1 ? { stops: trail, index: trailIdx, onGo: goJourney } : null;

  const markers = useMemo<TimelineMarker[]>(() => {
    const list: TimelineMarker[] = moments.map((m) => ({ time: m.time, kind: 'moment' as const, label: m.label }));
    if (anchor) list.push({ time: anchor.time, kind: 'anchor', label: 'Return point' });
    return list;
  }, [moments, anchor]);

  const diagnosticsRows: DiagRow[] = [
    {
      label: 'Mux playback',
      status: variant.server === 'mux' ? 'Pass' : 'Unavailable',
      detail:
        variant.server === 'mux'
          ? `Playing from Mux (playback ID ${SINTEL_MUX_PLAYBACK_ID.slice(0, 8)}…) through the Video.js MuxVideo component`
          : film.variants.some((v) => v.server === 'mux')
            ? 'This film has a Mux source; switch to it in Settings, Server'
            : 'This film is not hosted on Mux',
    },
    { label: 'Audio visualizer', status: 'Unavailable', detail: 'Not implemented in this build' },
    {
      label: 'Chapters',
      status: film.chapters.length > 0 ? 'Pass' : 'Unavailable',
      detail:
        film.chapters.length > 0
          ? `${film.chapters.length} supplied chapters`
          : 'No chapter data for this film; the Scenes wheel shows timed sections',
    },
  ];


  const shareClip = async (start: number, end: number) => {
    const url = `${window.location.origin}${window.location.pathname}#/watch/${film.id}?t=${Math.floor(start)}&e=${Math.ceil(end)}`;
    try {
      await navigator.clipboard.writeText(url);
      say(`Clip link copied: ${formatTime(start)} to ${formatTime(end)}`);
    } catch {
      say('Could not copy automatically.');
    }
  };

  // Only real alternatives are offered: separate quality files on the current server, and other hosts of the same film.
  const onServer = film.variants.filter((v) => v.server === variant.server && v.quality);
  const qualityChoices =
    onServer.length > 1
      ? {
          options: onServer.map((v) => ({ id: v.quality ?? '', label: v.quality ?? '' })),
          activeId: variant.quality ?? '',
          onChange: (id: string) => switchFile(() => setQualityId(id), id),
        }
      : undefined;
  const serverList = serversOf(film);
  const serverChoices =
    serverList.length > 1
      ? {
          options: serverList.map((id) => ({ id, label: SERVER_LABELS[id] ?? id })),
          activeId: variant.server,
          onChange: (id: string) => switchFile(() => setServerId(id), SERVER_LABELS[id] ?? id),
        }
      : undefined;
  // A Mux stream is not a file, so the download link points at the film's open Commons file instead.
  const downloadVariant = variant.server === 'mux' ? pickVariant(film, 'commons', '480p') : variant;
  const download = film.downloadable
    ? {
        href: downloadVariant.src,
        filename: fileName(downloadVariant.src),
        note: `${film.license.name} allows downloading and reuse with credit to ${film.creator}. The file opens in a new tab; use your browser's save option.`,
      }
    : undefined;

  const topActions = (
    <>
      <button type="button" className="cs-icon-btn" onClick={() => void share()} data-tip="Copy link" data-tip-pos="below">
        <ShareIcon />
        <span className="cs-sr">Copy link to this moment</span>
      </button>
    </>
  );

  return (
    <CinemaSkin
      title={film.title}
      subtitle={`${film.genre} · ${film.year}`}
      notice={notice}
      mediaKey={film.id}
      palette={film.palette}
      onAtmosphere={onAtmosphere}
      scenes={scenes}
      thumbnailAt={thumbnailAt}
      returnAnchor={anchor ? { time: anchor.time, onReturn: returnToAnchor } : null}
      videoOverlay={bench?.overlay}
      forceHighContrast={bench?.forceHighContrast}
      artwork={film.frameAt(film.duration ? film.duration * 0.3 : 30, 960)}
      artworkLabel={`Still frame from ${film.title}, ${film.creator} (${film.license.name}), via ${film.source.label}`}
      markers={markers}
      onJump={jumpTo}
      initialClip={initialTime !== undefined && initialEnd !== undefined ? { start: initialTime, end: initialEnd, loop: false } : undefined}
      onShareClip={shareClip}
      qualities={qualityChoices}
      servers={serverChoices}
      download={download}
      onSaveMoment={saveNow}
      diagnosticsRows={diagnosticsRows}
      topActions={topActions}
      films={films}
      activeFilmId={film.id}
      onPlayFilm={(id) => selectFilm(id)}
      journey={journey}
      atlasSlot={
        <MomentAtlas
          film={film}
          films={CATALOG}
          moments={moments}
          onSaveNow={saveNow}
          onSaveLast={saveLast}
          onSeek={jumpTo}
          onOpenElsewhere={(m) => selectFilm(m.videoId, m.time)}
        />
      }
    >
      <FilmMedia film={film} variant={variant} />
      <PlaybackSaver film={film} activeSrc={activeSrc} server={variant.server} />
    </CinemaSkin>
  );
}
