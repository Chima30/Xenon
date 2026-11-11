import { useMedia } from '@videojs/react';
import { Video, VideoPlayer, usePlayer } from '@videojs/react/video';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CATALOG, findFilm, SINTEL_MUX_PLAYBACK_ID, pickVariant, SERVER_LABELS, servers as serversOf, type Film, type Section, type Variant } from '../data/catalog';
import {
  addMoment,
  momentsFor,
  resumeTime,
  saveProgress,
  useMoments,
  useProgress,
} from '../data/stores';
import { MomentAtlas } from '../features/MomentAtlas';
import { NavigationRail } from '../features/NavigationRail';
import { CinemaSkin, clamp, formatTime, type DiagRow, type TimelineMarker } from '../skin';
import { ChevronLeftIcon, ChevronRightIcon, ReturnIcon, ShareIcon } from '../skin/icons';

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

  const selectFilm = (id: string) => {
    const next = findFilm(id);
    if (!next || next.id === film.id) return;
    pending.current = resumeTime(progress[next.id]);
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

  const stepTrail = (dir: -1 | 1) => {
    const i = clamp(trailIdx + dir, 0, trail.length - 1);
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

  const markers = useMemo<TimelineMarker[]>(() => {
    const list: TimelineMarker[] = moments.map((m) => ({ time: m.time, kind: 'moment', label: m.label }));
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

  const onSection = (s: Section) => jumpTo(s.start, s.title);

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
      {trail.length > 1 ? (
        <div className="cs-seg" role="group" aria-label="Journey trail">
          <button
            type="button"
            className="cs-seg-btn"
            onClick={() => stepTrail(-1)}
            disabled={trailIdx <= 0}
            aria-label="Previous stop on your journey"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className="cs-seg-btn"
            onClick={() => stepTrail(1)}
            disabled={trailIdx >= trail.length - 1}
            aria-label="Next stop on your journey"
          >
            <ChevronRightIcon />
          </button>
        </div>
      ) : null}
      {anchor ? (
        <button type="button" className="cs-btn cs-btn-label" data-keep onClick={returnToAnchor}>
          <ReturnIcon />
          <span>Return to {formatTime(anchor.time)}</span>
        </button>
      ) : null}
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
      railSlot={
        <NavigationRail
          films={CATALOG}
          film={film}
          progress={progress}
          onSelectFilm={selectFilm}
          onSelectSection={onSection}
        />
      }
      atlasSlot={
        <MomentAtlas film={film} moments={moments} onSaveNow={saveNow} onSaveLast={saveLast} onSeek={jumpTo} />
      }
    >
      <FilmMedia film={film} variant={variant} />
      <PlaybackSaver film={film} activeSrc={activeSrc} server={variant.server} />
    </CinemaSkin>
  );
}
