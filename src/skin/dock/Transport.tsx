import { PlayButton, SeekButton } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import { PauseIcon, PlayIcon, ReplayIcon, SeekBackIcon, SeekForwardIcon } from '../icons';

/**
 * The transport: one engineered unit, not three loose buttons. Rewind and forward are the wings of a plate; the
 * play/pause lens sits in its centre with an engraved bezel that turns a notch on every state change and spins
 * while the video buffers. Every part is a real Video.js button, so state and keyboard behaviour are native.
 *
 * It is rendered exactly once: over the video in the Floating layout, inside the dock in Compact and Expanded.
 */
export function Transport({ placement }: { placement: 'stage' | 'dock' }) {
  const ended = usePlayer((s) => s.ended);
  const paused = usePlayer((s) => s.paused);
  const buffering = usePlayer((s) => s.waiting && !s.paused);
  return (
    <div
      className="cs-transport"
      data-placement={placement}
      data-paused={paused || undefined}
      data-buffering={buffering || undefined}
      role="group"
      aria-label="Transport"
    >
      <SeekButton
        seconds={-10}
        className="cs-btn cs-wing"
        render={(props) => (
          <button {...props} data-side="back" data-tip="Back 10 s (J)">
            <SeekBackIcon />
            <span className="cs-seek-num" aria-hidden="true">
              10
            </span>
          </button>
        )}
      />
      <PlayButton
        className="cs-btn cs-btn-play"
        render={(props, state) => (
          <button {...props} data-tip={state.ended || ended ? 'Replay (K)' : state.paused ? 'Play (K)' : 'Pause (K)'}>
            <span className="cs-bezel" aria-hidden="true" />
            {state.ended || ended ? <ReplayIcon /> : state.paused ? <PlayIcon /> : <PauseIcon />}
          </button>
        )}
      />
      <SeekButton
        seconds={10}
        className="cs-btn cs-wing"
        render={(props) => (
          <button {...props} data-side="forward" data-tip="Forward 10 s (L)">
            <SeekForwardIcon />
            <span className="cs-seek-num" aria-hidden="true">
              10
            </span>
          </button>
        )}
      />
    </div>
  );
}
