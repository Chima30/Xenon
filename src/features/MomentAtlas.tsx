import { useRef, useState } from 'react';
import type { Film } from '../data/catalog';
import {
  parseMoments,
  removeMoment,
  replaceMoments,
  updateMomentLabel,
  useMoments,
  type Moment,
} from '../data/stores';
import { formatTime, speakTime } from '../skin/format';
import { useCinemaSkin } from '../skin';
import { BookmarkIcon, ReturnIcon, ShareIcon, TrashIcon } from '../skin/icons';
import './atlas.css';

interface Props {
  film: Film;
  moments: Moment[];
  onSaveNow: () => void;
  onSaveLast: () => void;
  onSeek: (time: number, label: string) => void;
}

export function MomentAtlas({ film, moments, onSaveNow, onSaveLast, onSeek }: Props) {
  const { announce } = useCinemaSkin();
  const all = useMoments();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ version: 1, moments: all }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-atlas.json';
    a.click();
    URL.revokeObjectURL(url);
    announce(`Exported ${all.length} saved moments`);
  };

  const importJSON = async (file: File) => {
    try {
      const data: unknown = JSON.parse(await file.text());
      const list = parseMoments(
        typeof data === 'object' && data !== null && 'moments' in data ? (data as { moments: unknown }).moments : data,
      );
      if (!list) throw new Error('not a moment list');
      const known = new Set(all.map((m) => m.id));
      const fresh = list.filter((m) => !known.has(m.id));
      replaceMoments([...all, ...fresh]);
      announce(`Imported ${fresh.length} new moments`);
    } catch {
      announce('That file is not a valid atlas export');
    }
  };

  return (
    <div className="atlas">
      <div className="atlas-bar">
        <div>
          <span className="rail-kicker">My Atlas</span>
          <h2 className="atlas-title">
            {film.title}: {moments.length} saved {moments.length === 1 ? 'moment' : 'moments'}
          </h2>
        </div>
        <div className="atlas-actions">
          <button type="button" className="cs-btn cs-btn-label" onClick={onSaveNow}>
            <BookmarkIcon />
            <span>Save this moment</span>
          </button>
          <button type="button" className="cs-btn cs-btn-label" onClick={onSaveLast}>
            <ReturnIcon />
            <span>Save the last 10 s</span>
          </button>
          <button type="button" className="cs-btn cs-btn-label" onClick={exportJSON} disabled={all.length === 0}>
            <ShareIcon />
            <span>Export</span>
          </button>
          <button type="button" className="cs-btn cs-btn-label" onClick={() => fileRef.current?.click()}>
            <span>Import</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="cs-sr"
            tabIndex={-1}
            aria-label="Import atlas JSON file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJSON(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {moments.length === 0 ? (
        <p className="atlas-empty">
          Nothing saved for this film yet. Use “Save this moment” to bookmark the current position, or “Save the last 10
          s” to keep what you just watched. Moments stay in this browser only.
        </p>
      ) : (
        <ul className="atlas-list">
          {moments.map((m) => (
            <MomentCard key={m.id} film={film} moment={m} onSeek={onSeek} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MomentCard({ film, moment, onSeek }: { film: Film; moment: Moment; onSeek: Props['onSeek'] }) {
  const { announce } = useCinemaSkin();
  const [label, setLabel] = useState(moment.label);
  const [imgFailed, setImgFailed] = useState(false);
  const src = film.frameAt(moment.time, 330);
  const commit = () => {
    const next = label.trim() || `Moment at ${formatTime(moment.time)}`;
    setLabel(next);
    if (next !== moment.label) updateMomentLabel(moment.id, next);
  };

  return (
    <li className="atlas-card">
      <button
        type="button"
        className="atlas-jump"
        onClick={() => onSeek(moment.time, moment.label)}
        aria-label={`Jump to ${moment.label} at ${speakTime(moment.time)}`}
      >
        {src && !imgFailed ? (
          <img src={src} alt="" loading="lazy" decoding="async" onError={() => setImgFailed(true)} />
        ) : (
          <span className="atlas-fallback" aria-hidden="true">
            {formatTime(moment.time)}
          </span>
        )}
        <span className="atlas-time">{formatTime(moment.time)}</span>
      </button>
      <div className="atlas-meta">
        <label className="cs-sr" htmlFor={`label-${moment.id}`}>
          Label for the moment at {speakTime(moment.time)}
        </label>
        <input
          id={`label-${moment.id}`}
          className="atlas-input"
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // Typing must never trigger player hotkeys.
            e.stopPropagation();
            if (e.key === 'Enter') {
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <button
          type="button"
          className="cs-icon-btn atlas-remove"
          onClick={() => {
            removeMoment(moment.id);
            announce(`Removed ${moment.label}`);
          }}
          aria-label={`Remove ${moment.label} at ${speakTime(moment.time)}`}
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}
