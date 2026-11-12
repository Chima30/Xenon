import { usePlayer } from '@videojs/react/video';
import { useEffect, useState } from 'react';
import type { ThumbnailAt } from './dock/Timeline';
import { formatTime } from './format';
import type { Tier } from './hooks';
import { BookmarkIcon, ReturnIcon } from './icons';
import { sceneIndexAt, sceneKind, type SkinScene } from './scenes';
import './pause.css';

interface Props {
  title?: string;
  subtitle?: string;
  scenes: SkinScene[];
  thumbnailAt?: ThumbnailAt;
  onSaveMoment?: () => void;
  returnAnchor?: { time: number; onReturn: () => void } | null;
  /** Opens the Time Portal on a scene; never seeks by itself. */
  onPreviewScene: (index: number, opener: HTMLElement) => void;
  tier: Tier;
  /** Something else (a portal, the lens, the wheel drawer) already has the viewer's attention. */
  suppressed: boolean;
}

/**
 * Pause Canvas: when the film is paused, the frame stays the centre of attention and a quiet information layer
 * appears beside it: where you are, what came before and what comes next, and the actions that matter while paused.
 * It is not a dialog: it takes no focus, resumes with Space/K or a click on the picture, and sits under captions.
 */
export function PauseCanvas({ title, subtitle, scenes, thumbnailAt, onSaveMoment, returnAnchor, onPreviewScene, tier, suppressed }: Props) {
  const paused = usePlayer((s) => s.paused);
  const ended = usePlayer((s) => s.ended);
  const canPlay = usePlayer((s) => s.canPlay);
  const error = usePlayer((s) => s.error);
  const seeking = usePlayer((s) => s.seeking);
  const now = usePlayer((s) => Math.floor(s.currentTime));
  const duration = usePlayer((s) => s.duration);

  const eligible = paused && !ended && canPlay && !error && !seeking && now >= 1 && tier !== 'micro' && !suppressed;
  // A short delay, so a pause that is only part of a seek or a quick toggle never flashes the canvas.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!eligible) {
      setShown(false);
      return;
    }
    const t = window.setTimeout(() => setShown(true), 380);
    return () => window.clearTimeout(t);
  }, [eligible]);

  if (!shown) return null;

  const idx = sceneIndexAt(scenes, now);
  const scene = scenes[idx];
  const prev = idx > 0 ? scenes[idx - 1] : undefined;
  const next = idx >= 0 && idx < scenes.length - 1 ? scenes[idx + 1] : idx < 0 ? scenes[0] : undefined;
  const kind = sceneKind(scenes);
  const roomy = tier === 'full';

  // Smaller players: a single quiet line under the top bar. The picture keeps the room.
  if (!roomy) {
    return (
      <section className="cs-pause" data-compact aria-label={`Paused${title ? `: ${title}` : ''}`}>
        <p className="cs-pause-pill">
          <span className="cs-pause-led" aria-hidden="true" />
          <strong>Paused</strong>
          <span>{formatTime(now)}</span>
          {scene ? <span className="cs-pause-pill-scene">{scene.title}</span> : null}
        </p>
      </section>
    );
  }

  return (
    <section className="cs-pause" aria-label={`Paused${title ? `: ${title}` : ''}`} data-tier={tier}>
      <div className="cs-pause-panel" data-interactive>
        <p className="cs-pause-kicker">
          <span className="cs-pause-led" aria-hidden="true" />
          Paused
        </p>
        {title ? <h2 className="cs-pause-title">{title}</h2> : null}
        {subtitle ? <p className="cs-pause-sub">{subtitle}</p> : null}

        <p className="cs-pause-time">
          <strong>{formatTime(now)}</strong>
          {duration > 0 ? <span> / {formatTime(duration)}</span> : null}
        </p>

        {scene ? (
          <p className="cs-pause-scene">
            <span className="cs-pause-scene-kind">
              {kind} {idx + 1} of {scenes.length}
            </span>
            {scene.title}
            {scene.authored ? null : ` · ${formatTime(scene.start)}–${formatTime(scene.end)}`}
          </p>
        ) : null}

        {scene?.description ? (
          <div className="cs-pause-insight">
            <span className="cs-pause-scene-kind">Scene insight</span>
            <p>{scene.description}</p>
          </div>
        ) : null}

        <div className="cs-pause-actions">
          {onSaveMoment ? (
            <button type="button" className="cs-btn cs-btn-label" onClick={onSaveMoment}>
              <BookmarkIcon />
              <span>Save moment</span>
            </button>
          ) : null}
          {returnAnchor ? (
            <button type="button" className="cs-btn cs-btn-label" data-keep onClick={returnAnchor.onReturn}>
              <ReturnIcon />
              <span>Back to {formatTime(returnAnchor.time)}</span>
            </button>
          ) : null}
        </div>
        <p className="cs-pause-hint">
          <kbd>Space</kbd> or <kbd>K</kbd> resumes
        </p>
      </div>

      {prev || next ? (
        <div className="cs-pause-side" data-interactive role="group" aria-label={`Neighbouring ${kind.toLowerCase()}s`}>
          {prev ? <Neighbour label="Previous" scene={prev} thumbnailAt={thumbnailAt} onPreview={(el) => onPreviewScene(idx - 1, el)} /> : null}
          {next ? <Neighbour label="Next" scene={next} thumbnailAt={thumbnailAt} onPreview={(el) => onPreviewScene(scenes.indexOf(next), el)} /> : null}
        </div>
      ) : null}
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
      onClick={(e) => onPreview(e.currentTarget)}
      aria-label={`Preview the ${label.toLowerCase()} scene: ${scene.title}, ${formatTime(scene.start)}`}
    >
      <span className="cs-pause-still" aria-hidden="true">
        {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span>{formatTime(scene.start)}</span>}
      </span>
      <span className="cs-pause-card-text" aria-hidden="true">
        <span className="cs-pause-card-label">{label}</span>
        <span className="cs-pause-card-title">{scene.title}</span>
        <span className="cs-pause-card-time">{formatTime(scene.start)}</span>
      </span>
    </button>
  );
}
