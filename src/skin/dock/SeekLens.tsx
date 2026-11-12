import { SeekIndicator } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';

/**
 * The seek feedback for keys (J, L, the arrow keys) and double taps on either side of the picture: an "edge lens",
 * a curved glow on the side the film moved towards, with the distance ("−10 s", "+20 s" for two quick presses) or
 * "Start" / "End" when the seek was clamped there.
 *
 * It is Video.js's own SeekIndicator, which listens to the same input actions that do the seeking, so it shows
 * exactly when a seek happened and never for the pod's buttons (they confirm on the pod itself). It is decorative:
 * the status announcer already tells screen readers about the seek.
 */
export function SeekLens() {
  const atStart = usePlayer((s) => s.currentTime <= 0.05);
  const atEnd = usePlayer((s) => s.duration > 0 && s.duration - s.currentTime <= 0.05);
  return (
    <SeekIndicator.Root
      className="cs-seeklens"
      render={(props, state) => {
        const back = state.direction === 'backward';
        const text =
          back && atStart
            ? 'Start'
            : state.direction === 'forward' && atEnd
              ? 'End'
              : state.seekTotal > 0
                ? `${back ? '−' : '+'}${state.seekTotal} s`
                : state.currentTime;
        return (
          <div {...props} aria-hidden="true">
            <span className="cs-seeklens-arcs">
              <i />
              <i />
              <i />
            </span>
            <span className="cs-seeklens-text">{text}</span>
          </div>
        );
      }}
    />
  );
}
