import { usePlayer } from '@videojs/react/video';
import { useMemo, useState } from 'react';
import { sectionsFor, type Film, type Section } from '../data/catalog';
import { resumeTime, type Progress } from '../data/stores';
import { formatTime } from '../skin/format';
import { NavigationWheel, type WheelItem } from './NavigationWheel';

interface Props {
  films: Film[];
  film: Film;
  progress: Record<string, Progress>;
  onSelectFilm: (id: string) => void;
  onSelectSection: (section: Section) => void;
}

type Sub = 'movies' | 'scenes';

/** Index of the section containing `time`, or -1. */
function sectionIndexAt(sections: Section[], time: number): number {
  for (let i = sections.length - 1; i >= 0; i--) {
    const s = sections[i];
    if (s && time >= s.start) return i;
  }
  return -1;
}

export function NavigationRail({ films, film, progress, onSelectFilm, onSelectSection }: Props) {
  const [sub, setSub] = useState<Sub>('movies');
  const playerDuration = usePlayer((s) => s.duration);
  // Trust the player's real duration once loaded; before that use the verified catalog value.
  const duration = playerDuration > 0 ? playerDuration : (film.duration ?? 0);
  const sections = useMemo(() => sectionsFor(film, duration), [film, duration]);
  // Selector returns a number, so the rail only re-renders when the active section changes.
  const activeSection = usePlayer((s) => sectionIndexAt(sections, s.currentTime));

  const filmItems: WheelItem[] = films.map((f) => {
    const p = progress[f.id];
    const dur = f.duration ?? p?.duration ?? 0;
    return {
      id: f.id,
      label: f.title,
      meta: [f.genre, dur > 0 ? formatTime(dur) : null, resumeTime(p) ? `resume ${formatTime(p?.time ?? 0)}` : null]
        .filter(Boolean)
        .join(' · '),
      image: f.frameAt(f.duration ? f.duration * 0.3 : 30, 330),
      fallbackText: f.title,
      progress: p && p.duration > 0 ? p.time / p.duration : 0,
    };
  });

  const sectionItems: WheelItem[] = sections.map((s) => ({
    id: String(s.index),
    label: s.title,
    meta: `${formatTime(s.start)}–${formatTime(s.end)}`,
    image: film.frameAt(s.start + 1, 330),
    fallbackText: formatTime(s.start),
  }));

  const current = sections[activeSection];

  return (
    <div className="rail">
      <div className="rail-head">
        <div className="rail-tabs" role="group" aria-label="Wheel contents">
          <button type="button" className="rail-tab" aria-pressed={sub === 'movies'} onClick={() => setSub('movies')}>
            Movies
          </button>
          <button type="button" className="rail-tab" aria-pressed={sub === 'scenes'} onClick={() => setSub('scenes')}>
            Scenes
          </button>
        </div>
        <p className="rail-note">
          {sub === 'movies'
            ? 'Turn the wheel with arrow keys, scroll or drag. Enter or a click loads the film.'
            : film.chapters.length > 0
              ? 'Chapters for this film. Enter or a click jumps there; you can return to where you were.'
              : 'Timed sections: this file has no published chapters, so the runtime is split into equal parts.'}
        </p>
      </div>

      {sub === 'movies' ? (
        <NavigationWheel
          items={filmItems}
          activeId={film.id}
          onSelect={onSelectFilm}
          label="Films"
          activeWord="Playing"
        />
      ) : sections.length > 0 ? (
        <NavigationWheel
          items={sectionItems}
          activeId={activeSection >= 0 ? String(activeSection) : null}
          onSelect={(id) => {
            const s = sections[Number(id)];
            if (s) onSelectSection(s);
          }}
          label={`Sections of ${film.title}`}
          activeWord="Now"
        />
      ) : (
        <p className="rail-detail rail-note">Waiting for the video duration before sections can be listed.</p>
      )}

      <div className="rail-detail" aria-live="polite">
        {sub === 'movies' ? (
          <>
            <span className="rail-kicker">Now playing</span>
            <h2>{film.title}</h2>
            <p>
              {film.description} {film.creator}, {film.year}.{' '}
              <a href={film.license.url} target="_blank" rel="noreferrer">
                {film.license.name}
              </a>
            </p>
          </>
        ) : (
          <>
            <span className="rail-kicker">Scene insight</span>
            <h2>{current ? `${current.title} · ${formatTime(current.start)}` : film.title}</h2>
            <p>
              No authored notes exist for this film, so there is nothing to show beyond its position. Insight panels
              only display data a person has written.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
