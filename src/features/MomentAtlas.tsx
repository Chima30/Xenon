import { useMemo, useRef, useState } from 'react';
import { sectionsFor, type Film } from '../data/catalog';
import {
  parseMoments,
  removeMoment,
  replaceMoments,
  updateMomentLabel,
  updateMomentNote,
  useMoments,
  type Moment,
} from '../data/stores';
import { useCinemaSkin } from '../skin';
import { formatTime, speakTime } from '../skin/format';
import { BookmarkIcon, CompassIcon, PlayIcon, ReturnIcon, ShareIcon, TrashIcon } from '../skin/icons';
import { sceneIndexAt } from '../skin/scenes';
import './atlas.css';

interface Props {
  /** The film that is playing. */
  film: Film;
  /** Every film, so capsules from other films keep their identity. */
  films: Film[];
  /** Saved moments of the playing film, in time order. */
  moments: Moment[];
  onSaveNow: () => void;
  onSaveLast: () => void;
  /** Jump within the playing film (leaves a Time Tether). */
  onSeek: (time: number, label: string) => void;
  /** Explicitly switch to another film at a saved moment. */
  onOpenElsewhere: (moment: Moment) => void;
}

type Scope = 'film' | 'all';

/**
 * My Atlas as Memory Capsules: each saved moment carries its film, its scene, its time, a still and the viewer's
 * own note, in the colours of its film. Storage, export and import are unchanged, so older atlases keep working.
 */
export function MomentAtlas({ film, films, moments, onSaveNow, onSaveLast, onSeek, onOpenElsewhere }: Props) {
  const { announce, openOptic } = useCinemaSkin();
  const all = useMoments();
  const fileRef = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState<Scope>('film');
  const filmById = useMemo(() => new Map(films.map((f) => [f.id, f])), [films]);

  const shown = useMemo(() => {
    if (scope === 'film') return moments;
    // All films: grouped by film (playing film first), each in time order.
    const order = [film.id, ...films.map((f) => f.id).filter((id) => id !== film.id)];
    return order.flatMap((id) => all.filter((m) => m.videoId === id).sort((a, b) => a.time - b.time));
  }, [scope, moments, all, film.id, films]);

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
      const list = parseMoments(typeof data === 'object' && data !== null && 'moments' in data ? (data as { moments: unknown }).moments : data);
      if (!list) throw new Error('not a moment list');
      const known = new Set(all.map((m) => m.id));
      const fresh = list.filter((m) => !known.has(m.id));
      replaceMoments([...all, ...fresh]);
      announce(`Imported ${fresh.length} new moments`);
    } catch {
      announce('That file is not a valid atlas export');
    }
  };

  const duration = film.duration ?? 0;
  const otherCount = all.length - moments.length;

  return (
    <div className="atlas">
      <div className="atlas-bar">
        <div className="atlas-heading">
          <span className="rail-kicker">My Atlas · Memory capsules</span>
          <h2 className="atlas-title">
            {scope === 'film' ? film.title : 'All films'}
            <span className="atlas-count">
              {shown.length} {shown.length === 1 ? 'capsule' : 'capsules'}
            </span>
          </h2>
        </div>
        <div className="atlas-actions">
          <div className="atlas-scope" role="group" aria-label="Show capsules from">
            <button type="button" className="cs-chip" aria-pressed={scope === 'film'} onClick={() => setScope('film')}>
              This film
            </button>
            <button type="button" className="cs-chip" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
              All films{otherCount > 0 ? ` (${all.length})` : ''}
            </button>
          </div>
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

      {/* A map of the playing film: where each of its capsules sits in the runtime. Decorative; the list is the content. */}
      {scope === 'film' && duration > 0 && moments.length > 0 ? (
        <div className="atlas-map" aria-hidden="true">
          {moments.map((m) => (
            <span key={m.id} className="atlas-pin" style={{ left: `${Math.min(100, (m.time / duration) * 100)}%` }} />
          ))}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="atlas-empty">
          <BookmarkIcon aria-hidden="true" />
          <p>
            No capsules {scope === 'film' ? `for ${film.title} ` : ''}yet. <strong>Save this moment</strong> seals where you are into a capsule;{' '}
            <strong>Save the last 10 s</strong> keeps what you just watched. Capsules stay in this browser only.
          </p>
        </div>
      ) : (
        <ol className="atlas-list" aria-label={scope === 'film' ? `Capsules in ${film.title}, in time order` : 'Capsules from every film'}>
          {shown.map((m) => {
            const f = filmById.get(m.videoId);
            if (!f) return null;
            return (
              <Capsule
                key={m.id}
                film={f}
                here={m.videoId === film.id}
                moment={m}
                onPlay={() => (m.videoId === film.id ? onSeek(m.time, m.label) : onOpenElsewhere(m))}
                onPreview={(el) =>
                  openOptic({ moment: { time: m.time, title: m.label, note: m.note, image: f.frameAt(m.time, 500) } }, el)
                }
              />
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Capsule({
  film,
  here,
  moment,
  onPlay,
  onPreview,
}: {
  film: Film;
  here: boolean;
  moment: Moment;
  onPlay: () => void;
  onPreview: (opener: HTMLElement) => void;
}) {
  const { announce } = useCinemaSkin();
  const [label, setLabel] = useState(moment.label);
  const [note, setNote] = useState(moment.note ?? '');
  const [imgFailed, setImgFailed] = useState(false);
  const src = film.frameAt(moment.time, 330);
  const spoken = speakTime(moment.time);
  const sections = useMemo(() => sectionsFor(film, film.duration ?? 0), [film]);
  const scene = sections[sceneIndexAt(sections.map((s) => ({ start: s.start, end: s.end, title: s.title })), moment.time)];

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
    <li className="capsule" style={{ ['--film-accent' as string]: film.palette.accent, ['--film-base' as string]: film.palette.base }}>
      <div className="capsule-lens" aria-hidden="true">
        {src && !imgFailed ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setImgFailed(true)} /> : <span>{formatTime(moment.time)}</span>}
      </div>
      <div className="capsule-body">
        <p className="capsule-film">
          <span className="capsule-dot" aria-hidden="true" />
          {film.title}
          {scene ? <span className="capsule-scene"> · {scene.title}</span> : null}
        </p>
        <p className="capsule-time">{formatTime(moment.time)}</p>
        <label className="cs-sr" htmlFor={`label-${moment.id}`}>
          Name of the moment in {film.title} at {spoken}
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
        <label className="cs-sr" htmlFor={`note-${moment.id}`}>
          Note for the moment in {film.title} at {spoken}
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
      <div className="capsule-actions">
        <button
          type="button"
          className="atlas-play"
          onClick={onPlay}
          aria-label={here ? `Play from ${moment.label}, ${spoken}` : `Switch to ${film.title} and play from ${moment.label}, ${spoken}`}
          data-tip={here ? 'Play from here' : `Open in ${film.title}`}
        >
          <PlayIcon />
        </button>
        {here ? (
          <button type="button" className="atlas-peek" onClick={(e) => onPreview(e.currentTarget)} aria-label={`Inspect ${moment.label} in the Optic`} data-tip="Inspect">
            <CompassIcon />
          </button>
        ) : null}
        <button
          type="button"
          className="cs-icon-btn atlas-remove"
          onClick={() => {
            removeMoment(moment.id);
            announce(`Removed ${moment.label}`);
          }}
          aria-label={`Remove ${moment.label} from ${film.title}, ${spoken}`}
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}
