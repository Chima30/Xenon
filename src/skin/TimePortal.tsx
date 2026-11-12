import { useEffect, useId, useRef, useState } from 'react';
import { formatTime, speakTime } from './format';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ReturnIcon } from './icons';
import './portal.css';

/** One place the portal can show. Everything is optional except the time: missing data is simply not shown. */
export interface PortalStop {
  /** Identifies a non-time stop, such as a film. */
  id?: string;
  time: number;
  end?: number;
  title: string;
  /** A real still from the film. Never a generated or live frame. */
  image?: string | null;
  /** Short kind word, e.g. "Section", "Chapter", "Saved moment", "Film". */
  kind?: string;
  /** Free text written by a person (a chapter description, a moment note, a film synopsis). */
  note?: string;
  /** Replaces the "ahead of you / behind you" line, for stops that are not positions in this video. */
  facts?: string;
  /** Replaces the timecode badge on the still. null hides it. */
  badge?: string | null;
}

interface Props {
  /** Every stop the viewer can step through inside the portal, in order. */
  stops: PortalStop[];
  /** Index of the stop being inspected. */
  index: number;
  onIndex: (index: number) => void;
  /** Where playback is now. Read once per render, never changed by the portal. */
  currentTime: number;
  /** The return anchor, when an earlier jump left one. */
  anchorTime?: number | null;
  /** The explicit action. Nothing happens to playback until the viewer chooses it. */
  onJump: (stop: PortalStop) => void;
  /** Label for the primary action; return null to hide it for a stop (for example the film already playing). */
  actionLabel?: (stop: PortalStop) => string | null;
  onReturn?: () => void;
  onClose: () => void;
  /** Element that opened the portal; focus goes back to it on close. */
  returnFocusTo?: HTMLElement | null;
}

/**
 * Time Portal: inspect a scene, a saved moment or another film without leaving your place. Playback keeps running
 * underneath; nothing changes until the viewer chooses the primary action, and a jump leaves a Return Anchor.
 */
export function TimePortal({ stops, index, onIndex, currentTime, anchorTime, onJump, actionLabel, onReturn, onClose, returnFocusTo }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();
  const stop = stops[index];
  const [badImage, setBadImage] = useState<string | null>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const opener = useRef(returnFocusTo);

  // Focus the primary action on open, give focus back on close. Keys typed inside never reach player hotkeys,
  // except Space and K on non-buttons so the viewer can still pause what is playing underneath.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    (primaryRef.current ?? keepRef.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation();
        return;
      }
      if ((e.key === ' ' || e.key === 'Enter') && e.target instanceof HTMLButtonElement) e.stopPropagation();
    };
    el.addEventListener('keydown', onKey);
    const back = opener.current;
    return () => {
      el.removeEventListener('keydown', onKey);
      if (back && back.isConnected && !back.closest('[inert]')) back.focus({ preventScroll: true });
    };
  }, []);

  if (!stop) return null;

  const delta = stop.time - currentTime;
  const distance =
    stop.facts ??
    (Math.abs(delta) < 2 ? 'You are here' : delta > 0 ? `${formatTime(delta)} ahead of you` : `${formatTime(-delta)} behind you`);
  const image = stop.image && stop.image !== badImage ? stop.image : null;
  const hasPrev = index > 0;
  const hasNext = index < stops.length - 1;
  const primary = actionLabel ? actionLabel(stop) : 'Jump here';
  const badge =
    stop.badge === undefined ? (
      <>
        {formatTime(stop.time)}
        {stop.end !== undefined ? <span> – {formatTime(stop.end)}</span> : null}
      </>
    ) : (
      stop.badge
    );

  return (
    <div ref={ref} className="tp" role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={descId} data-portal data-interactive>
      <div className="tp-card">
        <div className="tp-frame">
          {image ? (
            <img key={image} className="tp-img" src={image} alt="" onError={() => setBadImage(image)} />
          ) : (
            <span className="tp-fallback" aria-hidden="true">
              <span className="tp-fallback-time">{stop.facts ? stop.title : formatTime(stop.time)}</span>
              <span>No still available</span>
            </span>
          )}
          <span className="tp-sprockets" aria-hidden="true" />
          {badge ? (
            <span className="tp-time" aria-hidden="true">
              {badge}
            </span>
          ) : null}
          {stops.length > 1 ? (
            <>
              <button
                type="button"
                className="tp-step"
                data-dir="prev"
                disabled={!hasPrev}
                onClick={() => onIndex(index - 1)}
                aria-label={hasPrev ? `Previous: ${stops[index - 1]?.title}` : 'Nothing earlier'}
              >
                <ChevronLeftIcon />
              </button>
              <button
                type="button"
                className="tp-step"
                data-dir="next"
                disabled={!hasNext}
                onClick={() => onIndex(index + 1)}
                aria-label={hasNext ? `Next: ${stops[index + 1]?.title}` : 'Nothing later'}
              >
                <ChevronRightIcon />
              </button>
            </>
          ) : null}
        </div>

        <div className="tp-body">
          <div className="tp-head">
            <span className="tp-kicker">
              {stop.kind === 'Film' ? 'Film preview' : 'Time Portal'}
              {stop.kind && stop.kind !== 'Film' ? ` · ${stop.kind}` : ''}
              {stops.length > 1 ? ` ${index + 1} of ${stops.length}` : ''}
            </span>
            <button type="button" className="cs-icon-btn tp-close" onClick={onClose} aria-label="Close preview and keep watching">
              <CloseIcon />
            </button>
          </div>
          <h2 id={titleId} className="tp-title">
            {stop.title}
          </h2>
          <p id={descId} className="tp-facts" aria-live="polite">
            {stop.facts ? null : (
              <>
                <span className="cs-sr">
                  Starts at {speakTime(stop.time)}
                  {stop.end !== undefined ? `, ends at ${speakTime(stop.end)}` : ''}.{' '}
                </span>
                <span aria-hidden="true">
                  {formatTime(stop.time)}
                  {stop.end !== undefined ? `–${formatTime(stop.end)} · ${formatTime(stop.end - stop.time)} long` : ''}
                  {' · '}
                </span>
              </>
            )}
            {distance}
          </p>
          {stop.note ? <p className="tp-note">{stop.note}</p> : null}

          <div className="tp-actions">
            {primary ? (
              <button ref={primaryRef} type="button" className="tp-btn tp-btn-primary" onClick={() => onJump(stop)}>
                {primary}
              </button>
            ) : null}
            <button ref={keepRef} type="button" className="tp-btn" onClick={onClose}>
              Keep watching
            </button>
            {anchorTime !== null && anchorTime !== undefined && onReturn ? (
              <button type="button" className="tp-btn tp-btn-quiet" onClick={onReturn}>
                <ReturnIcon aria-hidden="true" /> Back to {formatTime(anchorTime)}
              </button>
            ) : null}
          </div>
          <p className="tp-hint">
            {stop.kind === 'Film'
              ? 'The current film keeps playing until you choose to switch.'
              : 'Your video keeps playing while you look. Jumping leaves a return point.'}
          </p>
        </div>
      </div>
    </div>
  );
}
