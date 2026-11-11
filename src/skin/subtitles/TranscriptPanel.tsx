import { usePlayer } from '@videojs/react/video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FloatingPanel } from '../FloatingPanel';
import { formatTime } from '../format';
import { cueIndexAt } from './parse';
import { useSubtitles } from './SubtitleContext';

interface Props {
  open: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  onSeek: (time: number) => void;
}

/** Searchable, timestamped transcript of the active subtitle track. Activating a line seeks to it. */
export function TranscriptPanel({ open, onClose, returnFocusTo, onSeek }: Props) {
  const { active, offset } = useSubtitles();
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const cues = active?.cues;
  // Selector returns a number: the panel re-renders only when the current line changes.
  const current = usePlayer((s) => (cues ? cueIndexAt(cues, s.currentTime - offset) : -1));

  const rows = useMemo(() => {
    if (!cues) return [];
    const q = query.trim().toLowerCase();
    return cues.map((c, i) => ({ c, i })).filter(({ c }) => !q || c.text.toLowerCase().includes(q));
  }, [cues, query]);

  // Keep the current line in view while following along (not while searching).
  useEffect(() => {
    if (!open || query) return;
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current, open, query]);

  return (
    <FloatingPanel open={open} onClose={onClose} title="Transcript" wide returnFocusTo={returnFocusTo}>
      {!active ? (
        <p className="cs-muted">Choose a subtitle track first. The transcript is built from the active track.</p>
      ) : (
        <>
          <label className="cs-search">
            <span className="cs-sr">Search transcript</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${active.label}`}
            />
          </label>
          <p className="cs-muted" role="status">
            {query ? `${rows.length} of ${cues?.length ?? 0} lines match` : `${cues?.length ?? 0} lines`}
          </p>
          <ul ref={listRef} className="cs-transcript">
            {rows.map(({ c, i }) => (
              <li key={i}>
                <button
                  type="button"
                  className="cs-line"
                  aria-current={i === current ? 'true' : undefined}
                  onClick={() => onSeek(Math.max(0, c.start + offset))}
                >
                  <span className="cs-line-time">{formatTime(c.start + offset)}</span>
                  <span>{c.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </FloatingPanel>
  );
}
