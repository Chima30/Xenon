import type { ThumbnailAt } from './dock/Timeline';
import { FloatingPanel } from './FloatingPanel';
import { formatTime, speakTime } from './format';

export interface Journey {
  /** Recently visited moments in visiting order; the first is where the viewer started exploring. */
  stops: { time: number; label: string }[];
  /** Which stop the viewer is on now. */
  index: number;
  /** Go to a stop without adding a new one. */
  onGo: (index: number) => void;
}

/**
 * Journey Replay: the session's own trail of places the viewer jumped to, so they can step back and forth between
 * them. It is history, not bookmarks: nothing here is saved; saving is what My Atlas is for.
 */
export function JourneyPanel({
  open,
  onClose,
  returnFocusTo,
  journey,
  thumbnailAt,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  journey: Journey;
  thumbnailAt?: ThumbnailAt;
}) {
  return (
    <FloatingPanel open={open} onClose={onClose} title="Journey" returnFocusTo={returnFocusTo}>
      <p className="cs-card-desc">Places you have jumped to in this session. Choose one to go back there; your trail is kept.</p>
      <ol className="cs-journey" data-interactive>
        {journey.stops.map((s, i) => {
          const src = thumbnailAt ? thumbnailAt(s.time, 330) : null;
          return (
            <li key={`${s.time}-${i}`}>
              <button
                type="button"
                className="cs-journey-stop"
                aria-current={i === journey.index ? 'step' : undefined}
                aria-label={`${i === 0 ? 'Start: ' : ''}${s.label}, ${speakTime(s.time)}${i === journey.index ? ', you are here' : ''}`}
                onClick={() => {
                  journey.onGo(i);
                  onClose();
                }}
              >
                <span className="cs-journey-still" aria-hidden="true">
                  {src ? <img src={src} alt="" loading="lazy" /> : null}
                </span>
                <span className="cs-journey-text" aria-hidden="true">
                  <span className="cs-journey-label">{i === 0 ? 'Where you were' : s.label}</span>
                  <span className="cs-journey-time">{formatTime(s.time)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </FloatingPanel>
  );
}
