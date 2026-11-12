import { useRef, useState } from 'react';
import type { Film } from '../data/catalog';
import {
  parseMoments,
  removeMoment,
  replaceMoments,
  updateMomentLabel,
  updateMomentNote,
  useMoments,
  type Moment,
} from '../data/stores';
import { formatTime, speakTime } from '../skin/format';
import { useCinemaSkin } from '../skin';
import { BookmarkIcon, CompassIcon, PlayIcon, ReturnIcon, ShareIcon, TrashIcon } from '../skin/icons';
import './atlas.css';

interface Props {
  film: Film;
  moments: Moment[];
  onSaveNow: () => void;
  onSaveLast: () => void;
  onSeek: (time: number, label: string) => void;
  /** Opens the Time Portal on a saved moment, so it can be inspected without leaving the current place. */
  onPreview?: (id: string, opener: HTMLElement) => void;
}

export function MomentAtlas({ film, moments, onSaveNow, onSaveLast, onSeek, onPreview: previewOverride }: Props) {
  const { announce, openPortal } = useCinemaSkin();
  // By default a moment opens in the skin's Time Portal: inspect it without leaving your place.
  const onPreview =
    previewOverride ??
    ((id: string, opener: HTMLElement) =>
      openPortal({
        stops: moments.map((m) => ({ time: m.time, title: m.label, image: film.frameAt(m.time, 500), kind: 'Saved moment', note: m.note })),
        index: Math.max(0, moments.findIndex((m) => m.id === id)),
        opener,
      }));
  const all = useMoments();
  const fileRef = useRef<HTMLInputElement>(null);
  const duration = film.duration ?? 0;

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
        <div className="atlas-heading">
          <span className="rail-kicker">My Atlas</span>
          <h2 className="atlas-title">
            {film.title}
            <span className="atlas-count">
              {moments.length} {moments.length === 1 ? 'moment' : 'moments'}
            </span>
          </h2>
        </div>
        <div className="atlas-actions">
          <button type="button" className="cs-btn cs-btn-label atlas-primary" onClick={onSaveNow}>
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

      {/* A map of the film: where each saved moment sits in the runtime. Decorative; the list below is the content. */}
      {duration > 0 && moments.length > 0 ? (
        <div className="atlas-map" aria-hidden="true">
          {moments.map((m) => (
            <span key={m.id} className="atlas-pin" style={{ left: `${Math.min(100, (m.time / duration) * 100)}%` }} />
          ))}
        </div>
      ) : null}

      {moments.length === 0 ? (
        <div className="atlas-empty">
          <BookmarkIcon aria-hidden="true" />
          <p>
            Nothing saved for {film.title} yet. <strong>Save this moment</strong> bookmarks where you are;{' '}
            <strong>Save the last 10 s</strong> keeps what you just watched. Moments stay in this browser only.
          </p>
        </div>
      ) : (
        <ol className="atlas-list" aria-label={`Saved moments in ${film.title}, in time order`}>
          {moments.map((m, i) => (
            <MomentCard key={m.id} index={i} film={film} moment={m} onSeek={onSeek} onPreview={onPreview} />
          ))}
        </ol>
      )}
    </div>
  );
}

function MomentCard({
  index,
  film,
  moment,
  onSeek,
  onPreview,
}: {
  index: number;
  film: Film;
  moment: Moment;
  onSeek: Props['onSeek'];
  onPreview: Props['onPreview'];
}) {
  const { announce } = useCinemaSkin();
  const [label, setLabel] = useState(moment.label);
  const [note, setNote] = useState(moment.note ?? '');
  const [imgFailed, setImgFailed] = useState(false);
  const src = film.frameAt(moment.time, 330);
  const spoken = speakTime(moment.time);

  const commitLabel = () => {
    const next = label.trim() || `Moment at ${formatTime(moment.time)}`;
    setLabel(next);
    if (next !== moment.label) updateMomentLabel(moment.id, next);
  };
  const commitNote = () => {
    if (note.trim() !== (moment.note ?? '')) {
      updateMomentNote(moment.id, note);
      announce('Note saved');
    }
  };
  // Typing must never trigger player hotkeys.
  const shield = (e: React.KeyboardEvent) => e.stopPropagation();

  return (
    <li className="atlas-card">
      <div className="atlas-frame">
        {src && !imgFailed ? (
          <img src={src} alt="" loading="lazy" decoding="async" onError={() => setImgFailed(true)} />
        ) : (
          <span className="atlas-fallback" aria-hidden="true">
            {formatTime(moment.time)}
          </span>
        )}
        <span className="atlas-index" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="atlas-time" aria-hidden="true">
          {formatTime(moment.time)}
        </span>
        <div className="atlas-quick">
          <button
            type="button"
            className="atlas-play"
            onClick={() => onSeek(moment.time, moment.label)}
            aria-label={`Play from ${moment.label}, ${spoken}`}
          >
            <PlayIcon />
          </button>
          {onPreview ? (
            <button
              type="button"
              className="atlas-peek"
              onClick={(e) => onPreview(moment.id, e.currentTarget)}
              aria-label={`Preview ${moment.label} in the Time Portal`}
            >
              <CompassIcon />
            </button>
          ) : null}
        </div>
      </div>
      <div className="atlas-meta">
        <label className="cs-sr" htmlFor={`label-${moment.id}`}>
          Name of the moment at {spoken}
        </label>
        <input
          id={`label-${moment.id}`}
          className="atlas-input"
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => {
            shield(e);
            if (e.key === 'Enter') {
              commitLabel();
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
          aria-label={`Remove ${moment.label} at ${spoken}`}
        >
          <TrashIcon />
        </button>
        <label className="cs-sr" htmlFor={`note-${moment.id}`}>
          Note for the moment at {spoken}
        </label>
        <textarea
          id={`note-${moment.id}`}
          className="atlas-note"
          value={note}
          rows={2}
          maxLength={400}
          placeholder="Add a note…"
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          onKeyDown={shield}
        />
      </div>
    </li>
  );
}
