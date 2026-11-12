import { usePlayer } from '@videojs/react/video';
import { useEffect, useRef, useState } from 'react';
import type { ThumbnailAt } from '../dock/Timeline';
import type { Tier } from '../hooks';
import { CloseIcon, PlayIcon, ReelIcon } from '../icons';
import type { NavFilm } from '../wheel/NavigationRail';
import { useFrameColours } from './frameColours';
import { SlateStick } from './SlateStick';

interface Props {
  title?: string;
  films: NavFilm[];
  activeFilmId?: string;
  /** Explicit switch to another film; the skin starts it once it can play. */
  onPlayFilm?: (id: string) => void;
  /** Opens the navigation wheel on its Movies face. */
  onOpenWheel?: (opener: HTMLElement) => void;
  thumbnailAt?: ThumbnailAt;
  onAnnounce: (message: string) => void;
  tier: Tier;
  suppressed: boolean;
}

/** The film after this one on the wheel that the viewer has not finished; else simply the next one. */
export function nextFilm(films: NavFilm[], activeId?: string): NavFilm | null {
  if (films.length < 2) return null;
  const at = Math.max(0, films.findIndex((f) => f.id === activeId));
  const order = films.slice(at + 1).concat(films.slice(0, at));
  return order.find((f) => (f.progress ?? 0) < 0.95) ?? order[0] ?? null;
}

/**
 * The tail slate: the end of the film, marked the way a crew marks the end of a take, with the slate held upside
 * down. It offers the next film on the wheel with an explicit Play (nothing starts by itself, no countdown) and
 * the wheel for any other choice; Replay stays where it already is, on the pod. It takes no focus; its arrival is
 * announced.
 */
export function TailSlate({ title, films, activeFilmId, onPlayFilm, onOpenWheel, thumbnailAt, onAnnounce, tier, suppressed }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const ended = usePlayer((s) => s.ended);
  const duration = usePlayer((s) => s.duration);
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const next = nextFilm(films, activeFilmId);
  // A single-video embed has nothing to offer here; the pod's Replay is enough.
  const eligible = ended && tier !== 'micro' && !suppressed && Boolean((next && onPlayFilm) || onOpenWheel);

  useEffect(() => {
    if (!eligible) {
      setShown(false);
      return;
    }
    const t = window.setTimeout(() => setShown(true), 300);
    return () => window.clearTimeout(t);
  }, [eligible]);
  useEffect(() => {
    if (!ended) setDismissed(false);
  }, [ended]);
  const visible = shown && !dismissed;
  useEffect(() => {
    if (visible) onAnnounce(`End of ${title ?? 'the film'}.${next ? ` Next on the wheel: ${next.title}.` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const colours = useFrameColours(visible, Math.max(0, Math.floor(duration) - 1), sectionRef, thumbnailAt);
  const [stillFailed, setStillFailed] = useState(false);
  useEffect(() => setStillFailed(false), [next?.id]);
  if (!visible) return null;

  return (
    <section ref={sectionRef} className="cs-pause cs-tail" aria-label={`End of ${title ?? 'the film'}`} data-tier={tier}>
      <div className="cs-slate" data-tail data-interactive>
        <div className="cs-slate-board">
          <div className="cs-slate-head">
            <span className="cs-pause-led" aria-hidden="true" />
            <span className="cs-slate-word">End of reel</span>
            {title ? <span className="cs-slate-title">{title}</span> : null}
            <button type="button" className="cs-pause-btn cs-pause-close" onClick={() => setDismissed(true)} aria-label="Put the slate away" data-tip="Hide">
              <CloseIcon />
            </button>
          </div>
          {next && onPlayFilm ? (
            <div className="cs-tail-next">
              <span className="cs-tail-still" aria-hidden="true">
                {next.image && !stillFailed ? <img src={next.image} alt="" onError={() => setStillFailed(true)} /> : <ReelIcon />}
              </span>
              <span className="cs-tail-text">
                <span className="cs-tail-kicker">Next on the wheel</span>
                <span className="cs-tail-title">{next.title}</span>
                {next.meta ? <span className="cs-tail-meta">{next.meta}</span> : null}
              </span>
            </div>
          ) : null}
          <div className="cs-tail-actions">
            {next && onPlayFilm ? (
              <button type="button" className="cs-chip cs-chip-primary cs-tail-play" onClick={() => onPlayFilm(next.id)}>
                <PlayIcon aria-hidden="true" width="14" height="14" /> Play {next.title}
              </button>
            ) : null}
            {onOpenWheel && films.length > 1 ? (
              <button type="button" className="cs-chip" data-nav-opener onClick={(e) => onOpenWheel(e.currentTarget)}>
                <ReelIcon aria-hidden="true" width="14" height="14" /> Choose on the wheel
              </button>
            ) : null}
          </div>
        </div>
        <SlateStick colours={colours} tail />
      </div>
    </section>
  );
}
