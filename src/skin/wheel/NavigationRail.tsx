import { usePlayer } from '@videojs/react/video';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ThumbnailAt } from '../dock/Timeline';
import { formatTime } from '../format';
import { CompassIcon, PlayIcon, ReturnIcon } from '../icons';
import { sceneIndexAt, sceneKind, type SkinScene } from '../scenes';
import { NavigationWheel, type PointSource, type WheelItem, type WheelPoint, type WheelVariant } from './NavigationWheel';

/** A film the Movies face can show. Everything except id and title is optional. */
export interface NavFilm {
  id: string;
  title: string;
  /** Short facts line, e.g. "Fantasy short · 2010 · 14:48". */
  meta?: string;
  /** Synopsis written by a person, with its credit. */
  description?: string;
  /** A real still from the film. */
  image?: string | null;
  /** 0..1 watched fraction. */
  progress?: number;
}

/** Where the wheel should point when something else (the pause canvas, the atlas, the dock) opens it. */
export type NavTarget =
  | { face: WheelVariant; index?: number }
  | { moment: { time: number; title: string; note?: string; image?: string | null } };

interface Props {
  films: NavFilm[];
  activeFilmId?: string;
  /** Switches the film. Only ever called from the explicit Play action in the detail card. */
  onPlayFilm?: (id: string) => void;
  scenes: SkinScene[];
  thumbnailAt?: ThumbnailAt;
  /** An intentional jump; the host keeps the Time Tether. */
  onJump: (time: number, label: string) => void;
  tether?: { time: number; onReturn: () => void } | null;
  /** A request from elsewhere. A new id re-applies it. */
  target?: { id: number; value: NavTarget } | null;
}

interface Detail {
  kicker: string;
  title: string;
  facts?: ReactNode;
  note?: string;
  action: { label: string; run: () => void } | null;
}

/** "3:20 ahead of you": its own subscriber, so the rail does not re-render every second. */
function Distance({ time }: { time: number }) {
  const now = usePlayer((s) => Math.floor(s.currentTime));
  const d = time - now;
  return <>{Math.abs(d) < 2 ? 'you are here' : d > 0 ? `${formatTime(d)} ahead of you` : `${formatTime(-d)} behind you`}</>;
}

/**
 * The navigation rail: the NAVIGATE instrument. A Movies / Scenes switch, the curved wheel, and a detail card
 * for whatever sits in the wheel's gate. The card carries the only action that changes anything (Play a film,
 * Jump to a scene), so turning the wheel is always safe.
 */
export function NavigationRail({ films, activeFilmId, onPlayFilm, scenes, thumbnailAt, onJump, tether, target }: Props) {
  const hasFilms = films.length > 0;
  const hasScenes = scenes.length > 0;
  const [face, setFace] = useState<WheelVariant>(hasFilms ? 'movies' : 'scenes');
  const [aim, setAim] = useState<{ face: WheelVariant; index: number }>({ face, index: 0 });
  const [moment, setMoment] = useState<Extract<NavTarget, { moment: unknown }>['moment'] | null>(null);
  const [point, setPoint] = useState<WheelPoint | null>(null);
  const seq = useRef(0);
  const actionRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const focusAction = useRef(false);
  // Selector returns a number, so the rail re-renders only when playback enters another scene.
  const playing = usePlayer((s) => sceneIndexAt(scenes, s.currentTime));
  const activeFilm = Math.max(0, films.findIndex((f) => f.id === activeFilmId));
  const kind = sceneKind(scenes);

  // Only one face available: show it.
  useEffect(() => {
    if (!hasFilms && face === 'movies') setFace('scenes');
  }, [hasFilms, face]);

  // A new film is playing: the scene face belongs to it now; any pinned moment is gone.
  useEffect(() => setMoment(null), [activeFilmId]);

  // Requests from elsewhere (reel handle, dock, pause canvas, atlas).
  const targetId = target?.id;
  useEffect(() => {
    if (!target) return;
    const v = target.value;
    if ('moment' in v) {
      setFace('scenes');
      setMoment(v.moment);
      setPoint({ id: ++seq.current, face: 'scenes', index: Math.max(0, sceneIndexAt(scenes, v.moment.time)) });
      focusAction.current = true;
      return;
    }
    const f: WheelVariant = v.face === 'scenes' && hasScenes ? 'scenes' : hasFilms ? 'movies' : 'scenes';
    setFace(f);
    setMoment(null);
    setPoint({ id: ++seq.current, face: f, index: v.index ?? (f === 'movies' ? activeFilm : Math.max(0, playing)), focus: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const onPoint = (f: WheelVariant, index: number, source: PointSource) => {
    setAim({ face: f, index });
    if (source === 'user') setMoment(null);
  };

  const filmItems: WheelItem[] = useMemo(
    () =>
      films.map((f) => ({
        id: f.id,
        label: f.title,
        meta: f.meta,
        image: f.image ?? null,
        fallbackText: f.title,
        progress: f.progress,
      })),
    [films],
  );
  const sceneItems: WheelItem[] = useMemo(
    () =>
      scenes.map((s, i) => ({
        id: String(i),
        label: `${s.title} · ${formatTime(s.start)}`,
        meta: `${formatTime(s.start)}–${formatTime(s.end)}`,
        image: thumbnailAt ? thumbnailAt(s.start + 1, 330) : null,
        fallbackText: formatTime(s.start),
      })),
    [scenes, thumbnailAt],
  );

  const filmStill = films[activeFilm]?.image ?? null;
  const current = playing >= 0 ? scenes[playing] : undefined;

  /* ---------- the card: what is in the gate, and its one action ---------- */
  let detail: Detail;
  if (moment) {
    detail = {
      kicker: 'Saved moment',
      title: moment.title,
      facts: (
        <>
          {formatTime(moment.time)} · <Distance time={moment.time} />
        </>
      ),
      note: moment.note,
      action: { label: `Jump to ${formatTime(moment.time)}`, run: () => onJump(moment.time, moment.title) },
    };
  } else if (face === 'movies' && aim.face === 'movies' && films[aim.index]) {
    const film = films[aim.index]!;
    const live = aim.index === activeFilm;
    detail = {
      kicker: live ? 'Now playing' : `Film ${aim.index + 1} of ${films.length}`,
      title: film.title,
      facts: film.meta,
      note: film.description,
      action: live || !onPlayFilm ? null : { label: `Play ${film.title}`, run: () => onPlayFilm(film.id) },
    };
  } else if (face === 'scenes' && aim.face === 'scenes' && scenes[aim.index]) {
    const s = scenes[aim.index]!;
    const here = aim.index === playing;
    detail = {
      kicker: here ? 'You are in' : `${kind} ${aim.index + 1} of ${scenes.length}`,
      title: s.title,
      facts: (
        <>
          {formatTime(s.start)}–{formatTime(s.end)} · <Distance time={s.start} />
        </>
      ),
      note: s.description ?? (here ? `Part ${aim.index + 1} of ${scenes.length}. Your place is kept until you jump.` : undefined),
      action: here ? null : { label: `Jump to ${formatTime(s.start)}`, run: () => onJump(s.start, s.title) },
    };
  } else if (face === 'movies' && films[activeFilm]) {
    const film = films[activeFilm]!;
    detail = { kicker: 'Now playing', title: film.title, facts: film.meta, note: film.description, action: null };
  } else {
    detail = {
      kicker: current ? 'You are in' : 'Scenes',
      title: current ? current.title : 'Waiting for the video',
      facts: current ? `${formatTime(current.start)}–${formatTime(current.end)}` : 'Scenes appear once the duration is known.',
      action: null,
    };
  }

  // A request that asked for the action (a saved moment): hand focus to the card's action once it is drawn.
  useEffect(() => {
    if (!focusAction.current) return;
    focusAction.current = false;
    requestAnimationFrame(() => actionRef.current?.focus({ preventScroll: true }));
  });
  /** Enter or Space on a frame: the next Enter is the card's action (Play or Jump), one Tab-free step away. */
  const toAction = () => requestAnimationFrame(() => actionRef.current?.focus({ preventScroll: true }));

  const switchFace = (f: WheelVariant) => {
    if (f === face) return;
    setMoment(null);
    setFace(f);
  };

  return (
    <div ref={railRef} className="rail">
      <div className="rail-head">
        {hasFilms && hasScenes ? (
          <div className="rail-tabs" role="group" aria-label="Wheel shows" data-face={face}>
            <button type="button" className="rail-tab" aria-pressed={face === 'movies'} onClick={() => switchFace('movies')}>
              <PlayIcon aria-hidden="true" width="14" height="14" />
              Movies <span className="rail-tab-count">{films.length}</span>
            </button>
            <button type="button" className="rail-tab" aria-pressed={face === 'scenes'} onClick={() => switchFace('scenes')}>
              <CompassIcon aria-hidden="true" width="14" height="14" />
              Scenes <span className="rail-tab-count">{scenes.length}</span>
            </button>
          </div>
        ) : null}
        <p className="rail-note">
          {face === 'movies'
            ? 'Turn with the arrow keys, the scroll wheel or a drag. Nothing changes until you choose Play.'
            : scenes.some((s) => s.authored)
              ? 'Chapters of this film. Turn to one and choose Jump; your place is kept until then.'
              : 'No chapters are published for this file, so its runtime is split into equal, plainly labelled sections.'}
        </p>
      </div>

      {face === 'movies' || hasScenes ? (
        <NavigationWheel
          variant={face}
          point={point}
          onPoint={onPoint}
          sets={{
            movies: {
              items: filmItems,
              activeId: activeFilmId ?? null,
              onSelect: (_id, _el, keyboard) => {
                if (keyboard) toAction();
              },
              label: 'Films',
              activeWord: 'Now showing',
              unit: 'Films',
              hubImage: filmStill,
            },
            scenes: {
              items: sceneItems,
              activeId: playing >= 0 ? String(playing) : null,
              onSelect: (_id, _el, keyboard) => {
                setMoment(null);
                if (keyboard) toAction();
              },
              label: `${kind}s of ${films[activeFilm]?.title ?? 'this video'}`,
              activeWord: 'Now',
              unit: `${kind}s`,
              hubImage: current && thumbnailAt ? thumbnailAt(current.start + 1, 330) : filmStill,
            },
          }}
        />
      ) : (
        <p className="rail-wait">Waiting for the video duration before scenes can be listed.</p>
      )}

      <div className="rail-detail" data-face={moment ? 'moment' : face}>
        <span className="rail-kicker">{detail.kicker}</span>
        <h2>{detail.title}</h2>
        {detail.facts ? <p className="rail-facts">{detail.facts}</p> : null}
        {detail.note ? <p className="rail-note-body">{detail.note}</p> : null}
        {detail.action || tether ? (
          <div className="rail-actions">
            {detail.action ? (
              <button
                ref={actionRef}
                type="button"
                className="cs-chip cs-chip-primary rail-primary"
                onClick={() => {
                  detail.action?.run();
                  // The action usually makes itself unnecessary (you are now there): keep focus on the wheel, not on <body>.
                  requestAnimationFrame(() => {
                    const lost = !document.activeElement || document.activeElement === document.body;
                    if (lost && !railRef.current?.closest('[inert]')) railRef.current?.querySelector<HTMLElement>('.wheel-item[tabindex="0"]')?.focus({ preventScroll: true });
                  });
                }}
              >
                <PlayIcon aria-hidden="true" width="14" height="14" />
                {detail.action.label}
              </button>
            ) : null}
            {tether ? (
              <button type="button" className="cs-chip rail-secondary" onClick={tether.onReturn}>
                <ReturnIcon aria-hidden="true" width="14" height="14" /> Back to {formatTime(tether.time)}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
