import { useMedia } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import { useEffect, useRef, useState } from 'react';
import { FloatingPanel } from './FloatingPanel';
import { formatTime, parseTimeInput } from './format';

export interface Clip {
  start: number | null;
  end: number | null;
  loop: boolean;
}
export const EMPTY_CLIP: Clip = { start: null, end: null, loop: false };

interface Props {
  open: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  clip: Clip;
  onChange: (clip: Clip) => void;
  /** Plays from the clip start and stops (or loops) at its end. */
  onPlay: () => void;
  onAnnounce: (message: string) => void;
  /** When provided, a share button appears. The host decides what a clip link looks like. */
  onShare?: (start: number, end: number) => void;
}

/**
 * Marks a time range, loops it, and shares its timestamps. It does NOT cut or export a video file.
 */
export function ClipPanel({ open, onClose, returnFocusTo, clip, onChange, onPlay, onAnnounce, onShare }: Props) {
  const media = useMedia() as { currentTime?: number } | null;
  const duration = usePlayer((s) => s.duration);
  const now = () => Math.min(media?.currentTime ?? 0, duration > 0 ? duration : Infinity);
  const complete = clip.start !== null && clip.end !== null && clip.end > clip.start;

  const setStart = (t: number) => {
    // Moving the start past the end clears the end so the range never goes negative.
    onChange({ ...clip, start: t, end: clip.end !== null && clip.end <= t ? null : clip.end });
    onAnnounce(`Clip start ${formatTime(t)}`);
  };
  const setEnd = (t: number) => {
    if (clip.start !== null && t <= clip.start) {
      onAnnounce('The end must be after the start');
      return;
    }
    onChange({ ...clip, end: t });
    onAnnounce(`Clip end ${formatTime(t)}`);
  };

  const copyTimes = async () => {
    if (!complete) return;
    const text = `${formatTime(clip.start ?? 0)}–${formatTime(clip.end ?? 0)}`;
    try {
      await navigator.clipboard.writeText(text);
      onAnnounce(`Copied ${text}`);
    } catch {
      onAnnounce(`Clip ${text}`);
    }
  };

  return (
    <FloatingPanel open={open} onClose={onClose} title="Clip" returnFocusTo={returnFocusTo}>
      <p className="cs-muted">Mark a range to loop it or share its timestamps. This does not create a video file.</p>
      <div className="cs-card cs-clip">
        <TimeField label="Start" value={clip.start} max={duration} onCommit={setStart} onNow={() => setStart(now())} />
        <TimeField label="End" value={clip.end} max={duration} onCommit={setEnd} onNow={() => setEnd(now())} />
        <div className="cs-chips">
          <button type="button" className="cs-chip" aria-pressed={clip.loop} onClick={() => onChange({ ...clip, loop: !clip.loop })} disabled={!complete}>
            Loop clip
          </button>
          <button type="button" className="cs-chip" onClick={onPlay} disabled={!complete}>
            Play clip
          </button>
          <button type="button" className="cs-chip" onClick={() => void copyTimes()} disabled={!complete}>
            Copy times
          </button>
          {onShare ? (
            <button type="button" className="cs-chip" onClick={() => onShare(clip.start ?? 0, clip.end ?? 0)} disabled={!complete}>
              Copy share link
            </button>
          ) : null}
          <button type="button" className="cs-chip" onClick={() => onChange(EMPTY_CLIP)} disabled={clip.start === null && clip.end === null}>
            Clear
          </button>
        </div>
        {complete ? (
          <p className="cs-muted" role="status">
            Clip: {formatTime(clip.start ?? 0)} to {formatTime(clip.end ?? 0)} ({formatTime((clip.end ?? 0) - (clip.start ?? 0))} long)
          </p>
        ) : (
          <p className="cs-muted">Set a start and an end to enable looping and sharing.</p>
        )}
      </div>
    </FloatingPanel>
  );
}

function TimeField({
  label,
  value,
  max,
  onCommit,
  onNow,
}: {
  label: string;
  value: number | null;
  max: number;
  onCommit: (t: number) => void;
  onNow: () => void;
}) {
  const [text, setText] = useState(value === null ? '' : formatTime(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(value === null ? '' : formatTime(value));
    setBad(false);
  }, [value]);

  const commit = () => {
    if (text.trim() === '') return;
    const t = parseTimeInput(text);
    if (t === null || (max > 0 && t > max)) {
      setBad(true);
      return;
    }
    setBad(false);
    onCommit(t);
  };

  // FloatingPanel stops key events from reaching the player hotkeys, which also hides them from React's
  // root-level onKeyDown. A native listener on the input fires first, so Enter still commits.
  const inputRef = useRef<HTMLInputElement>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') commitRef.current();
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="cs-timefield">
      <label>
        {label}
        <input
          ref={inputRef}
          value={text}
          inputMode="numeric"
          placeholder="m:ss"
          aria-invalid={bad || undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />
      </label>
      <button type="button" className="cs-chip" onClick={onNow}>
        Set to now
      </button>
      {bad ? (
        <span className="cs-form-msg" data-kind="error" role="alert">
          Use m:ss, within the video length.
        </span>
      ) : null}
    </div>
  );
}
