import { usePlayer } from '@videojs/react/video';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ThumbnailAt } from '../dock/Timeline';
import { clamp, formatTime, speakTime } from '../format';
import { ReturnIcon } from '../icons';
import { sceneIndexAt, sceneKind, type SkinScene } from '../scenes';
import './optic.css';

/** A film the outer ring can show. Everything except id and title is optional. */
export interface OpticFilm {
  id: string;
  title: string;
  /** Short facts line, e.g. "Fantasy short · 2010 · 14:48". */
  meta?: string;
  /** Synopsis written by a person. */
  description?: string;
  /** A real still from the film. */
  image?: string | null;
  /** 0..1 watched fraction. */
  progress?: number;
}

/** Where the Optic should point when something else (the pause canvas, the atlas, the dock) opens it. */
export type OpticTarget =
  | { ring: 'films' | 'scenes'; index?: number }
  | { moment: { time: number; title: string; note?: string; image?: string | null } };

interface Props {
  films: OpticFilm[];
  activeFilmId?: string;
  /** Switches the film. Only ever called from an explicit Play action. */
  onPlayFilm?: (id: string) => void;
  scenes: SkinScene[];
  thumbnailAt?: ThumbnailAt;
  /** An intentional jump; the host keeps the Time Tether. */
  onJump: (time: number, label: string) => void;
  tether?: { time: number; onReturn: () => void } | null;
  /** Saved moments of this film, pinned on the scene ring. */
  moments?: number[];
  /** A request from elsewhere. A new id re-applies it and moves focus to the matching ring. */
  target?: { id: number; value: OpticTarget } | null;
}

const VIEW = 320;
const C = VIEW / 2;
const R_FILM = 136; // centre line of the film ring
const R_SCENE = 92; // centre line of the scene ring
const SCENE_BAND = 15;

const NAV = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter']);

/** Point at a clock angle (degrees, 0 = top, clockwise). */
const polar = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + Math.cos(a) * r, C + Math.sin(a) * r] as const;
};
function arc(fromDeg: number, toDeg: number, r: number): string {
  const end = Math.max(fromDeg + 0.2, toDeg - 1.2); // a hairline gap marks every real scene boundary
  const [x1, y1] = polar(fromDeg, r);
  const [x2, y2] = polar(end, r);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${end - fromDeg > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}
/** Nearest equivalent of `target` to `prev`, so a ring never spins the long way round. */
const unwrap = (prev: number, target: number) => target + Math.round((prev - target) / 360) * 360;

/**
 * XENON Optic: one lens for every way of moving through the collection.
 *   Outer ring  - the films. Turning it previews another film in the centre; nothing switches until Play.
 *   Inner ring  - the scenes of the film that is playing, laid out on the clock by real time.
 *   Centre      - the lens: a still of whatever the rings point at, read out below with its one action.
 * Both rings are ARIA sliders (arrows, Home/End, Enter), respond to drag, click and the scroll wheel, and a plain
 * list view offers the same choices. The fixed reticle at twelve o'clock is the position pointer.
 */
export function Optic({ films, activeFilmId, onPlayFilm, scenes, thumbnailAt, onJump, tether, moments = [], target }: Props) {
  const duration = usePlayer((s) => s.duration);
  const now = usePlayer((s) => Math.floor(s.currentTime));
  const playing = sceneIndexAt(scenes, now);
  const activeIdx = Math.max(0, films.findIndex((f) => f.id === activeFilmId));
  const hasFilms = films.length > 0;
  const hasScenes = scenes.length > 0 && duration > 0;

  const [ring, setRing] = useState<'films' | 'scenes'>(hasScenes ? 'scenes' : 'films');
  const [filmSel, setFilmSel] = useState(activeIdx);
  const [sceneSel, setSceneSel] = useState(Math.max(0, playing));
  const [moment, setMoment] = useState<Extract<OpticTarget, { moment: unknown }>['moment'] | null>(null);
  const [list, setList] = useState(false);
  const [badImage, setBadImage] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const readoutId = useId();

  // A new film is playing: point both rings at it.
  useEffect(() => {
    setFilmSel(activeIdx);
    setSceneSel(Math.max(0, sceneIndexAt(scenes, now)));
    setMoment(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilmId, scenes.length]);

  // Requests from elsewhere (pause canvas, atlas, dock, reel handle).
  const targetId = target?.id;
  useEffect(() => {
    if (!target) return;
    const v = target.value;
    if ('moment' in v) {
      setMoment(v.moment);
      setRing('scenes');
      setSceneSel(Math.max(0, sceneIndexAt(scenes, v.moment.time)));
    } else {
      setMoment(null);
      setRing(v.ring === 'scenes' && hasScenes ? 'scenes' : 'films');
      if (v.ring === 'films') setFilmSel(v.index ?? activeIdx);
      else setSceneSel(v.index ?? Math.max(0, playing));
    }
    const focusRing = 'moment' in v || (v.ring === 'scenes' && hasScenes) ? sceneRef : filmRef;
    requestAnimationFrame(() => {
      const el = focusRing.current ?? filmRef.current ?? wrapRef.current?.querySelector<HTMLElement>('.optic-list [aria-pressed="true"]');
      el?.focus({ preventScroll: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  const chooseFilm = (i: number) => {
    setRing('films');
    setMoment(null);
    setFilmSel(clamp(i, 0, films.length - 1));
  };
  const chooseScene = (i: number) => {
    setRing('scenes');
    setMoment(null);
    setSceneSel(clamp(i, 0, scenes.length - 1));
  };

  /* ---------- geometry ---------- */
  const fstep = films.length >= 7 ? 360 / films.length : 52;
  const deg = (t: number) => (duration > 0 ? clamp(t / duration, 0, 1) * 360 : 0);
  const sel = scenes[sceneSel];
  const sceneMid = sel ? (deg(sel.start) + deg(sel.end)) / 2 : 0;

  // Rings turn by the shortest path; the values are kept unwrapped so CSS can animate them.
  const filmRot = useRef(0);
  const sceneRot = useRef(0);
  filmRot.current = unwrap(filmRot.current, -filmSel * fstep);
  sceneRot.current = unwrap(sceneRot.current, -sceneMid);

  /* ---------- the selection read out below the lens ---------- */
  const film = films[filmSel];
  const showFilm = ring === 'films' && !moment && Boolean(film);
  const kind = sceneKind(scenes);
  const distance = (t: number) => {
    const d = t - now;
    return Math.abs(d) < 2 ? 'you are here' : d > 0 ? `${formatTime(d)} ahead of you` : `${formatTime(-d)} behind you`;
  };
  let still: string | null = null;
  let readout: { kicker: string; title: string; facts: string; note?: string; action: string | null; act: () => void; disabled: boolean };
  if (moment) {
    still = moment.image ?? (thumbnailAt ? thumbnailAt(moment.time, 330) : null);
    readout = {
      kicker: 'Saved moment',
      title: moment.title,
      facts: `${formatTime(moment.time)} · ${distance(moment.time)}`,
      note: moment.note,
      action: `Jump to ${formatTime(moment.time)}`,
      act: () => onJump(moment.time, moment.title),
      disabled: Math.abs(moment.time - now) < 1,
    };
  } else if (showFilm && film) {
    const isActive = filmSel === activeIdx;
    still = film.image ?? null;
    readout = {
      kicker: `Film ${filmSel + 1} of ${films.length}${isActive ? ' · now showing' : ''}`,
      title: film.title,
      facts: film.meta ?? '',
      note: film.description,
      action: isActive || !onPlayFilm ? null : `Play ${film.title}`,
      act: () => onPlayFilm?.(film.id),
      disabled: false,
    };
  } else if (sel) {
    still = thumbnailAt ? thumbnailAt(sel.start + 1, 330) : null;
    readout = {
      kicker: `${kind} ${sceneSel + 1} of ${scenes.length}${sceneSel === playing ? ' · playing now' : ''}`,
      title: sel.title,
      facts: `${formatTime(sel.start)}–${formatTime(sel.end)} · ${distance(sel.start)}`,
      note: sel.description,
      action: `Jump to ${formatTime(sel.start)}`,
      act: () => onJump(sel.start, sel.title),
      disabled: Math.abs(sel.start - now) < 1,
    };
  } else {
    readout = { kicker: 'Optic', title: 'Waiting for the video', facts: 'Scenes appear once the duration is known.', action: null, act: () => {}, disabled: true };
  }
  const image = still && still !== badImage ? still : null;

  /* ---------- keyboard: native, so the player's own hotkeys never see ring keys ---------- */
  const latest = useRef({ filmSel, sceneSel, act: readout.act, disabled: readout.disabled, action: readout.action });
  latest.current = { filmSel, sceneSel, act: readout.act, disabled: readout.disabled, action: readout.action };
  useEffect(() => {
    const bind = (el: HTMLElement | null, which: 'films' | 'scenes') => {
      if (!el) return () => {};
      const onKey = (e: KeyboardEvent) => {
        if (!NAV.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
        e.stopPropagation();
        e.preventDefault();
        const cur = which === 'films' ? latest.current.filmSel : latest.current.sceneSel;
        const last = which === 'films' ? films.length - 1 : scenes.length - 1;
        const go = which === 'films' ? chooseFilm : chooseScene;
        switch (e.key) {
          case 'ArrowLeft':
          case 'ArrowUp':
            go(cur - 1);
            break;
          case 'ArrowRight':
          case 'ArrowDown':
            go(cur + 1);
            break;
          case 'PageUp':
            go(cur - 3);
            break;
          case 'PageDown':
            go(cur + 3);
            break;
          case 'Home':
            go(0);
            break;
          case 'End':
            go(last);
            break;
          case 'Enter':
            if (latest.current.action && !latest.current.disabled) latest.current.act();
            break;
        }
      };
      el.addEventListener('keydown', onKey);
      return () => el.removeEventListener('keydown', onKey);
    };
    const a = bind(filmRef.current, 'films');
    const b = bind(sceneRef.current, 'scenes');
    return () => {
      a();
      b();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // The scene ring only exists once the duration is known, so re-bind when either ring appears.
  }, [films.length, scenes.length, list, hasFilms, hasScenes]);

  /* ---------- pointer: drag to turn, click to pick, scroll to step ---------- */
  const drag = useRef<{ ring: 'films' | 'scenes'; last: number; acc: number; moved: boolean; coarse: boolean } | null>(null);
  const geom = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return null;
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const scale = VIEW / r.width;
    return { radius: Math.hypot(dx, dy) * scale, angle: ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360 };
  };
  const ringAt = (radius: number): 'films' | 'scenes' | null =>
    hasFilms && radius >= R_FILM - 26 && radius <= C ? 'films' : hasScenes && radius >= R_SCENE - 22 && radius < R_FILM - 26 ? 'scenes' : null;
  const stepFor = (which: 'films' | 'scenes') => (which === 'films' ? fstep * 0.7 : Math.max(14, (360 / Math.max(1, scenes.length)) * 0.7));

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      const g = geom(e.clientX, e.clientY);
      const which = g ? ringAt(g.radius) : null;
      if (!which) return;
      e.preventDefault();
      acc += e.deltaY + e.deltaX;
      if (Math.abs(acc) >= 50) {
        if (which === 'films') chooseFilm(latest.current.filmSel + Math.sign(acc));
        else chooseScene(latest.current.sceneSel + Math.sign(acc));
        acc = 0;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const g = geom(e.clientX, e.clientY);
    const which = g ? ringAt(g.radius) : null;
    if (!g || !which) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    (which === 'films' ? filmRef : sceneRef).current?.focus({ preventScroll: true });
    drag.current = { ring: which, last: g.angle, acc: 0, moved: false, coarse: e.pointerType !== 'mouse' };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const g = geom(e.clientX, e.clientY);
    if (!g) return;
    let delta = g.angle - d.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    d.last = g.angle;
    d.acc += delta;
    const step = stepFor(d.ring);
    if (Math.abs(d.acc) >= step) {
      d.moved = true;
      // Turning the ring clockwise brings the previous item under the reticle.
      const dir = d.acc > 0 ? -1 : 1;
      d.acc = 0;
      if (d.ring === 'films') chooseFilm(latest.current.filmSel + dir);
      else chooseScene(latest.current.sceneSel + dir);
      if (d.coarse && 'vibrate' in navigator) navigator.vibrate?.(5);
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    // A click: pick what is under the pointer.
    if (d.ring === 'films') {
      const bubble = (e.target as Element).closest<HTMLElement>('[data-film-index]');
      if (bubble) chooseFilm(Number(bubble.dataset.filmIndex));
      return;
    }
    const g = geom(e.clientX, e.clientY);
    if (!g || !(duration > 0)) return;
    const t = (((g.angle - sceneRot.current) % 360) + 360) % 360;
    chooseScene(Math.max(0, sceneIndexAt(scenes, (t / 360) * duration)));
  };

  const filmText = (i: number) => {
    const f = films[i];
    return f ? `${f.title}${f.meta ? `, ${f.meta}` : ''}${i === activeIdx ? ', now showing' : ''}` : '';
  };
  const sceneText = (i: number) => {
    const s = scenes[i];
    return s ? `${s.title}, ${speakTime(s.start)} to ${speakTime(s.end)}${i === playing ? ', playing now' : ''}` : '';
  };

  return (
    <div ref={wrapRef} className="optic-wrap" data-ring={ring} data-list={list || undefined}>
      {!list ? (
        <div
          ref={rootRef}
          className="optic"
          style={{ ['--frot' as string]: `${filmRot.current}deg`, ['--srot' as string]: `${sceneRot.current}deg` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (drag.current = null)}
        >
          <svg className="optic-svg" viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true" focusable="false">
            <defs>
              <radialGradient id={`${readoutId}-glass`} cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor="white" stopOpacity="0.1" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle className="optic-bezel" cx={C} cy={C} r={C - 2} />
            <circle className="optic-film-track" cx={C} cy={C} r={R_FILM} />
            <circle className="optic-groove" cx={C} cy={C} r={R_FILM - 26} />
            <circle className="optic-scene-track" cx={C} cy={C} r={R_SCENE} />
            {hasScenes ? (
              <g className="optic-scenes" style={{ transform: `rotate(${sceneRot.current}deg)` }}>
                {scenes.map((s, i) => (
                  <path
                    key={s.start}
                    className="optic-arc"
                    data-sel={(ring === 'scenes' && i === sceneSel) || undefined}
                    data-playing={i === playing || undefined}
                    d={arc(deg(s.start), deg(s.end), R_SCENE)}
                  />
                ))}
                {moments.map((t, i) => {
                  const [x1, y1] = polar(deg(t), R_SCENE - SCENE_BAND / 2 - 2);
                  const [x2, y2] = polar(deg(t), R_SCENE - SCENE_BAND / 2 - 9);
                  return <line key={`m${i}`} className="optic-moment" x1={x1} y1={y1} x2={x2} y2={y2} />;
                })}
                {tether ? (
                  <rect
                    className="optic-tether"
                    x={polar(deg(tether.time), R_SCENE + SCENE_BAND / 2 + 7)[0] - 4}
                    y={polar(deg(tether.time), R_SCENE + SCENE_BAND / 2 + 7)[1] - 4}
                    width={8}
                    height={8}
                    transform={`rotate(45 ${polar(deg(tether.time), R_SCENE + SCENE_BAND / 2 + 7).join(' ')})`}
                  />
                ) : null}
                <circle className="optic-playhead" cx={polar(deg(now), R_SCENE)[0]} cy={polar(deg(now), R_SCENE)[1]} r={5} />
              </g>
            ) : null}
            <circle className="optic-glass" cx={C} cy={C} r={C - 4} fill={`url(#${readoutId}-glass)`} />
            {/* The reticle: a fixed pointer at twelve o'clock, through both rings. */}
            <g className="optic-reticle">
              <line x1={C} y1={6} x2={C} y2={C - R_SCENE + SCENE_BAND / 2 + 2} />
              <path d={`M ${C - 7} 4 L ${C + 7} 4 L ${C} 15 Z`} />
            </g>
          </svg>

          {hasFilms ? (
            <div className="optic-films" aria-hidden="true">
              {films.map((f, i) => (
                <span
                  key={f.id}
                  className="optic-bubble"
                  data-film-index={i}
                  data-sel={(ring === 'films' && i === filmSel && !moment) || undefined}
                  data-active={i === activeIdx || undefined}
                  data-far={Math.abs(i - filmSel) > 2 || undefined}
                  style={{ ['--a' as string]: `${i * fstep}deg` }}
                >
                  {f.image ? <img src={f.image} alt="" draggable={false} loading="lazy" /> : <span>{f.title.slice(0, 1)}</span>}
                  {f.progress && f.progress > 0 ? (
                    <svg className="optic-bubble-progress" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="16.5" pathLength="100" strokeDasharray={`${Math.round(f.progress * 100)} 100`} />
                    </svg>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}

          <div className="optic-lens" aria-hidden="true">
            {image ? <img key={image} src={image} alt="" draggable={false} onError={() => setBadImage(image)} /> : <span className="optic-lens-empty">{readout.title}</span>}
            <span className="optic-lens-caption">{moment ? formatTime(moment.time) : showFilm ? `${filmSel + 1}/${films.length}` : sel ? formatTime(sel.start) : ''}</span>
          </div>

          {hasFilms ? (
            <div
              ref={filmRef}
              className="optic-ring-focus"
              data-ring="films"
              role="slider"
              tabIndex={0}
              aria-label="Films ring. Arrow keys turn it, Enter plays the film under the pointer."
              aria-valuemin={1}
              aria-valuemax={films.length}
              aria-valuenow={filmSel + 1}
              aria-valuetext={filmText(filmSel)}
              aria-describedby={readoutId}
              onFocus={() => {
                setRing('films');
                setMoment(null);
              }}
            />
          ) : null}
          {hasScenes ? (
            <div
              ref={sceneRef}
              className="optic-ring-focus"
              data-ring="scenes"
              role="slider"
              tabIndex={0}
              aria-label={`${kind}s ring. Arrow keys turn it, Enter jumps.`}
              aria-valuemin={1}
              aria-valuemax={scenes.length}
              aria-valuenow={sceneSel + 1}
              aria-valuetext={sceneText(sceneSel)}
              aria-describedby={readoutId}
              onFocus={() => setRing('scenes')}
            />
          ) : null}
        </div>
      ) : (
        <div className="optic-list">
          {hasFilms ? (
            <section aria-label="Films">
              <h3 className="optic-list-head">Films</h3>
              <ul>
                {films.map((f, i) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="cs-choice"
                      aria-pressed={ring === 'films' && i === filmSel && !moment}
                      aria-current={i === activeIdx ? 'true' : undefined}
                      onClick={() => chooseFilm(i)}
                    >
                      <span className="cs-choice-main">{f.title}</span>
                      <span className="cs-tag">{i === activeIdx ? 'now showing' : f.meta}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {hasScenes ? (
            <section aria-label={`${kind}s of the film playing`}>
              <h3 className="optic-list-head">{kind}s</h3>
              <ul>
                {scenes.map((s, i) => (
                  <li key={s.start}>
                    <button
                      type="button"
                      className="cs-choice"
                      aria-pressed={ring === 'scenes' && i === sceneSel && !moment}
                      aria-current={i === playing ? 'true' : undefined}
                      onClick={() => chooseScene(i)}
                    >
                      <span className="cs-choice-main">{s.title}</span>
                      <span className="cs-tag">
                        {formatTime(s.start)}
                        {i === playing ? ' · now' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <div id={readoutId} className="optic-readout" aria-live="polite">
        <p className="optic-kicker">{readout.kicker}</p>
        <p className="optic-title">{readout.title}</p>
        <p className="optic-facts">{readout.facts}</p>
        {readout.note ? <p className="optic-note">{readout.note}</p> : null}
      </div>
      <div className="optic-actions">
        {readout.action ? (
          <button type="button" className="optic-primary" onClick={readout.act} disabled={readout.disabled}>
            {readout.action}
          </button>
        ) : null}
        {tether ? (
          <button type="button" className="optic-secondary" onClick={tether.onReturn}>
            <ReturnIcon aria-hidden="true" /> Back to {formatTime(tether.time)}
          </button>
        ) : null}
        <button type="button" className="optic-secondary optic-view" aria-pressed={list} onClick={() => setList((l) => !l)}>
          {list ? 'Show the lens' : 'Show as list'}
        </button>
      </div>
      {scenes.length > 0 && !scenes.some((s) => s.authored) ? (
        <p className="optic-honest">No chapters are published for this film, so the inner ring shows equal, plainly labelled sections.</p>
      ) : null}
    </div>
  );
}
