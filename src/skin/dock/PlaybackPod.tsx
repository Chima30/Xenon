import { PlayButton, SeekButton, useMedia } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type SVGProps } from 'react';
import './pod.css';

type Side = 'back' | 'forward';
const STEP = 10;

/* ---------- Glyphs drawn for the pod (24px grid, optically centred) ---------- */

function PlayGlyph(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...p}>
      <path d="M8.6 5.4c0-.9 1-1.5 1.8-1l9.2 5.9c.8.5.8 1.6 0 2.1l-9.2 5.9c-.8.5-1.8-.1-1.8-1Z" fill="currentColor" />
    </svg>
  );
}
function PauseGlyph(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...p}>
      <rect x="6.4" y="5" width="3.9" height="14" rx="1.3" fill="currentColor" />
      <rect x="13.7" y="5" width="3.9" height="14" rx="1.3" fill="currentColor" />
    </svg>
  );
}
function ReplayGlyph(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5.2 9.5a7.5 7.5 0 1 1 .3 6" />
      <path d="M4.6 4.8v4.9h4.9" />
    </svg>
  );
}
/** A circular arrow, open at the top. Mirrored for forward, so the pair is symmetrical. */
function SeekGlyph({ side }: { side: Side }) {
  return (
    <svg className="cs-pod-arc" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <g transform={side === 'forward' ? 'matrix(-1 0 0 1 32 0)' : undefined}>
        <path d="M16 5.5a10.5 10.5 0 1 1-9.4 5.8" />
        <path d="M18.6 2.6 15.7 5.5l2.9 2.9" />
      </g>
    </svg>
  );
}

/**
 * XENON Precision Playback Pod: one horizontal capsule in three parts. Rewind 10 s, a dominant Play/Pause ring,
 * Forward 10 s. Every part is a real Video.js button (PlayButton, SeekButton), so seeking, clamping to the start
 * and end, playback state, hotkeys and screen-reader labels stay Video.js's own.
 *
 * Feedback is CSS on top of those buttons and never in the way of them: the original handler always runs first.
 *   Play     a single sweep of light through the ring, and the icon turns into Pause.
 *   Pause    a clean icon change; the ring keeps a restrained outline in the film's colour.
 *   Seek     the arrow nudges in its direction and a "−10 s" / "+10 s" chip confirms it ("Start" or "End" when
 *            the seek was clamped there).
 * Under reduced motion the icon swaps and the chip simply appears; nothing moves.
 *
 * Rendered exactly once: over the picture in the Floating layout, inside the dock in Compact and Expanded.
 */
export function PlaybackPod({ placement }: { placement: 'stage' | 'dock' }) {
  const media = useMedia() as HTMLMediaElement | null;
  const ended = usePlayer((s) => s.ended);
  const paused = usePlayer((s) => s.paused);
  const buffering = usePlayer((s) => s.waiting && !s.paused);
  const state = ended ? 'ended' : paused ? 'paused' : 'playing';

  const [confirm, setConfirm] = useState<{ side: Side; text: string; n: number } | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** What the seek will land on, read before Video.js seeks: the full step, or the clamp at either end. */
  const preview = (side: Side) => {
    const t = media?.currentTime ?? 0;
    const d = media && Number.isFinite(media.duration) ? media.duration : Infinity;
    if (side === 'back') return t - STEP <= 0.05 ? 'Start' : `−${STEP} s`;
    return t + STEP >= d - 0.05 ? 'End' : `+${STEP} s`;
  };
  const show = (side: Side, text: string) => {
    setConfirm((c) => ({ side, text, n: (c?.n ?? 0) + 1 }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setConfirm(null), 900);
  };

  /** Video.js activates on click (pointer), Enter (keydown) and Space (keyup). Wrap all three, never replace them. */
  const withFeedback = (side: Side, props: Record<string, unknown>) => {
    const onClick = props.onClick as ((e: MouseEvent<HTMLButtonElement>) => void) | undefined;
    const onKeyDown = props.onKeyDown as ((e: KeyboardEvent<HTMLButtonElement>) => void) | undefined;
    const onKeyUp = props.onKeyUp as ((e: KeyboardEvent<HTMLButtonElement>) => void) | undefined;
    const enabled = (el: HTMLButtonElement) => el.getAttribute('aria-disabled') !== 'true' && !el.disabled;
    return {
      onClick: (e: MouseEvent<HTMLButtonElement>) => {
        const text = preview(side);
        onClick?.(e);
        if (enabled(e.currentTarget)) show(side, text);
      },
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        const text = preview(side);
        onKeyDown?.(e);
        if (e.key === 'Enter' && e.target === e.currentTarget && enabled(e.currentTarget)) show(side, text);
      },
      onKeyUp: (e: KeyboardEvent<HTMLButtonElement>) => {
        const text = preview(side);
        onKeyUp?.(e);
        if (e.key === ' ' && e.target === e.currentTarget && enabled(e.currentTarget)) show(side, text);
      },
    };
  };

  const seek = (side: Side) => (
    <SeekButton
      seconds={side === 'back' ? -STEP : STEP}
      label={side === 'back' ? `Rewind ${STEP} seconds` : `Forward ${STEP} seconds`}
      className="cs-pod-btn cs-pod-seek"
      render={(props) => (
        <button
          {...props}
          {...withFeedback(side, props as Record<string, unknown>)}
          data-side={side}
          data-tip={side === 'back' ? `Rewind ${STEP} s (J)` : `Forward ${STEP} s (L)`}
          data-nudge={confirm?.side === side ? confirm.n % 2 : undefined}
        >
          <span className="cs-pod-glyph" aria-hidden="true">
            <SeekGlyph side={side} />
            <span className="cs-pod-num">{STEP}</span>
          </span>
        </button>
      )}
    />
  );

  return (
    <div
      className="cs-pod"
      data-placement={placement}
      data-state={state}
      data-buffering={buffering || undefined}
      role="group"
      aria-label="Playback"
    >
      {seek('back')}
      <PlayButton
        className="cs-pod-btn cs-pod-play"
        render={(props, s) => (
          <button {...props} data-tip={s.ended || ended ? 'Replay (K)' : s.paused ? 'Play (K)' : 'Pause (K)'}>
            <span className="cs-pod-ring" aria-hidden="true" />
            <span className="cs-pod-sweep" aria-hidden="true" />
            <span className="cs-pod-icons" aria-hidden="true">
              <PlayGlyph data-icon="play" />
              <PauseGlyph data-icon="pause" />
              <ReplayGlyph data-icon="replay" />
            </span>
          </button>
        )}
      />
      {seek('forward')}
      {confirm ? (
        <span key={confirm.n} className="cs-pod-confirm" data-side={confirm.side} aria-hidden="true">
          {confirm.text}
        </span>
      ) : null}
    </div>
  );
}
