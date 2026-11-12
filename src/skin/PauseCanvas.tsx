import { usePlayer } from '@videojs/react/video';
import { useEffect, useId, useRef, useState } from 'react';
import type { ThumbnailAt } from './dock/Timeline';
import { formatTime } from './format';
import type { Tier } from './hooks';
import { BookmarkIcon, CloseIcon, ReturnIcon } from './icons';
import { sceneIndexAt, sceneKind, type SkinScene } from './scenes';
import { useFrameColours } from './slate/frameColours';
import { SlateStick } from './slate/SlateStick';
import './pause.css';

interface Props {
  title?: string;
  subtitle?: string;
  scenes: SkinScene[];
  thumbnailAt?: ThumbnailAt;
  onSaveMoment?: () => void;
  returnAnchor?: { time: number; onReturn: () => void } | null;
  /** Turns the navigation wheel to a neighbouring scene; never seeks by itself. */
  onPreviewScene: (index: number, opener: HTMLElement) => void;
  tier: Tier;
  /** Something else (the lens, the navigation drawer, a panel) already has the viewer's attention. */
  suppressed: boolean;
}

/**
 * The Film Slate: XENON's pause. Not a dimmed screen with a synopsis, but the clapperboard a film crew holds up to
 * mark a moment. The frame keeps the stage; the slate sits low on the left with real data chalked on it (the film,
 * the scene, the timecode, what is left), and its clapstick is painted with the colours of the very frame you
 * paused on. It closes with a small clap as it appears.
 *
 * It is not a dialog: it takes no focus, and Space/K or the pod resumes. Neighbouring scenes appear only when asked
 * for, and the slate can be put away at once.
 */
export function PauseCanvas({ title, subtitle, scenes, thumbnailAt, onSaveMoment, returnAnchor, onPreviewScene, tier, suppressed }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const paused = usePlayer((s) => s.paused);
  const ended = usePlayer((s) => s.ended);
  const canPlay = usePlayer((s) => s.canPlay);
  const error = usePlayer((s) => s.error);
  const seeking = usePlayer((s) => s.seeking);
  const now = usePlayer((s) => Math.floor(s.currentTime));
  const duration = usePlayer((s) => s.duration);
  const moreId = useId();

  const eligible = paused && !ended && canPlay && !error && !seeking && now >= 1 && tier !== 'micro' && !suppressed;
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [more, setMore] = useState(false);
  // A short delay, so a pause that is only part of a seek or a quick toggle never flashes the slate.
  useEffect(() => {
    if (!eligible) {
      setShown(false);
      return;
    }
    const t = window.setTimeout(() => setShown(true), 420);
    return () => window.clearTimeout(t);
  }, [eligible]);
  // Every new pause starts fresh: dismissed and expanded states belong to one pause.
  useEffect(() => {
    if (!paused) {
      setDismissed(false);
      setMore(false);
    }
  }, [paused]);

  const visible = shown && !dismissed;
  const colours = useFrameColours(visible, now, sectionRef, thumbnailAt);
  if (!visible) return null;

  const idx = sceneIndexAt(scenes, now);
  const scene = scenes[idx];
  const prev = idx > 0 ? scenes[idx - 1] : undefined;
  const next = idx >= 0 && idx < scenes.length - 1 ? scenes[idx + 1] : idx < 0 ? scenes[0] : undefined;
  const kind = sceneKind(scenes);
  const roomy = tier === 'full';
  const hasMore = roomy && Boolean(prev || next || scene?.description);
  const left = duration > 0 ? Math.max(0, duration - now) : null;

  return (
    <section ref={sectionRef} className="cs-pause" aria-label={`Paused${title ? `: ${title}` : ''}, ${formatTime(now)}`} data-tier={tier} data-more={more || undefined}>
      {more && hasMore ? (
        <div id={moreId} className="cs-pause-more" data-interactive role="group" aria-label={`${title ?? 'This film'}: neighbouring ${kind.toLowerCase()}s`}>
          {subtitle ? <p className="cs-pause-sub">{subtitle}</p> : null}
          {scene?.description ? (
            <p className="cs-pause-insight">
              <span className="cs-pause-label">Scene insight</span>
              {scene.description}
            </p>
          ) : null}
          <div className="cs-pause-cards">
            {prev ? <Neighbour label="Previous" scene={prev} thumbnailAt={thumbnailAt} onPreview={(el) => onPreviewScene(idx - 1, el)} /> : null}
            {next ? <Neighbour label="Next" scene={next} thumbnailAt={thumbnailAt} onPreview={(el) => onPreviewScene(scenes.indexOf(next), el)} /> : null}
          </div>
        </div>
      ) : null}

      <div className="cs-slate" data-interactive>
        <SlateStick colours={colours} />
        <div className="cs-slate-board">
          <div className="cs-slate-head">
            <span className="cs-pause-led" aria-hidden="true" />
            <span className="cs-slate-word">Paused</span>
            {title ? <span className="cs-slate-title">{title}</span> : null}
            <button type="button" className="cs-pause-btn cs-pause-close" onClick={() => setDismissed(true)} aria-label="Put the slate away" data-tip="Hide">
              <CloseIcon />
            </button>
          </div>
          <div className="cs-slate-row">
            <dl className="cs-slate-fields">
              {scene ? (
                <div>
                  <dt>{kind}</dt>
                  <dd>
                    {idx + 1}
                    <small>/{scenes.length}</small>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Time</dt>
                <dd>{formatTime(now)}</dd>
              </div>
              {left !== null && roomy ? (
                <div>
                  <dt>Left</dt>
                  <dd>{formatTime(left)}</dd>
                </div>
              ) : null}
            </dl>
            <div className="cs-pause-tools">
              {hasMore ? (
                <button type="button" className="cs-pause-btn" aria-expanded={more} aria-controls={moreId} onClick={() => setMore((m) => !m)}>
                  {more ? 'Less' : `${kind}s`}
                </button>
              ) : null}
              {roomy && onSaveMoment ? (
                <button type="button" className="cs-pause-btn" onClick={onSaveMoment} aria-label="Save this moment" data-tip="Save moment">
                  <BookmarkIcon />
                </button>
              ) : null}
              {returnAnchor ? (
                <button type="button" className="cs-pause-btn" onClick={returnAnchor.onReturn} aria-label={`Back to where you were, ${formatTime(returnAnchor.time)}`}>
                  <ReturnIcon /> <span>{formatTime(returnAnchor.time)}</span>
                </button>
              ) : null}
            </div>
          </div>
          {scene?.authored ? <p className="cs-slate-scene">{scene.title}</p> : null}
        </div>
      </div>
    </section>
  );
}

function Neighbour({
  label,
  scene,
  thumbnailAt,
  onPreview,
}: {
  label: string;
  scene: SkinScene;
  thumbnailAt?: ThumbnailAt;
  onPreview: (opener: HTMLElement) => void;
}) {
  const [failed, setFailed] = useState(false);
  const src = thumbnailAt ? thumbnailAt(scene.start + 1, 330) : null;
  return (
    <button
      type="button"
      className="cs-pause-card"
      data-nav-opener
      onClick={(e) => onPreview(e.currentTarget)}
      aria-label={`${label} scene: ${scene.title}, ${formatTime(scene.start)}. Opens on the navigation wheel.`}
    >
      <span className="cs-pause-still" aria-hidden="true">
        {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span>{formatTime(scene.start)}</span>}
      </span>
      <span className="cs-pause-card-text" aria-hidden="true">
        <span className="cs-pause-label">{label}</span>
        <span className="cs-pause-card-title">{scene.title}</span>
        <span className="cs-pause-card-time">{formatTime(scene.start)}</span>
      </span>
    </button>
  );
}
