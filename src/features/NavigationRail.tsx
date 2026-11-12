import { usePlayer } from '@videojs/react/video';
import { useMemo, useState } from 'react';
import { sectionsFor, type Film, type Section } from '../data/catalog';
import { resumeTime, type Progress } from '../data/stores';
import { useCinemaSkin } from '../skin';
import { formatTime } from '../skin/format';
import { CompassIcon, PlayIcon } from '../skin/icons';
import { NavigationWheel, type WheelItem, type WheelVariant } from './NavigationWheel';

interface Props {
  films: Film[];
  film: Film;
  progress: Record<string, Progress>;
  /** Switches the playing film. Only called from the explicit "Play" action of a film preview. */
  onSelectFilm: (id: string) => void;
}

/** Index of the section containing `time`, or -1. */
export function sectionIndexAt(sections: Section[], time: number): number {
  for (let i = sections.length - 1; i >= 0; i--) {
    const s = sections[i];
    if (s && time >= s.start) return i;
  }
  return -1;
}

export function NavigationRail({ films, film, progress, onSelectFilm }: Props) {
  const { openPortal, closeNavigation, announce } = useCinemaSkin();
  const [face, setFace] = useState<WheelVariant>('movies');
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
    label: `${s.title} · ${formatTime(s.start)}`,
    meta: `${formatTime(s.start)}–${formatTime(s.end)}`,
    image: film.frameAt(s.start + 1, 330),
    fallbackText: formatTime(s.start),
  }));

  const current = sections[activeSection];

  const filmFacts = (f: Film) => {
    const p = progress[f.id];
    const r = resumeTime(p);
    return [f.genre, String(f.year), f.duration ? formatTime(f.duration) : null, r ? `resume at ${formatTime(r)}` : null]
      .filter(Boolean)
      .join(' · ');
  };
  const previewFilm = (id: string, opener: HTMLElement) =>
    openPortal({
      stops: films.map((f) => ({
        id: f.id,
        time: 0,
        title: f.title,
        image: f.frameAt(f.duration ? f.duration * 0.3 : 30, 500),
        kind: 'Film',
        facts: f.id === film.id ? `${filmFacts(f)} · playing now` : filmFacts(f),
        note: `${f.description} ${f.creator}, ${f.license.name}.`,
        badge: f.duration ? formatTime(f.duration) : null,
      })),
      index: Math.max(0, films.findIndex((f) => f.id === id)),
      opener,
      actionLabel: (stop) => (stop.id === film.id ? null : `Play ${stop.title}`),
      onAction: (stop) => {
        if (!stop.id || stop.id === film.id) return;
        onSelectFilm(stop.id);
        closeNavigation();
        announce(`Switching to ${stop.title}`);
      },
    });
  const previewSection = (s: Section, opener: HTMLElement) =>
    openPortal({
      stops: sections.map((x) => ({
        time: x.start,
        end: x.end,
        title: x.title,
        image: film.frameAt(x.start + 1, 500),
        kind: x.isChapter ? 'Chapter' : 'Section',
        note: x.isChapter ? film.chapters[x.index]?.description : undefined,
      })),
      index: Math.max(0, sections.indexOf(s)),
      opener,
    });
  const filmStill = film.frameAt(film.duration ? film.duration * 0.3 : 30, 330);

  return (
    <div className="rail">
      <div className="rail-head">
        <div className="rail-tabs" role="group" aria-label="Wheel shows" data-face={face}>
          <button type="button" className="rail-tab" aria-pressed={face === 'movies'} onClick={() => setFace('movies')}>
            <PlayIcon aria-hidden="true" width="14" height="14" />
            Movies <span className="rail-tab-count">{films.length}</span>
          </button>
          <button type="button" className="rail-tab" aria-pressed={face === 'scenes'} onClick={() => setFace('scenes')}>
            <CompassIcon aria-hidden="true" width="14" height="14" />
            Scenes <span className="rail-tab-count">{sections.length || '–'}</span>
          </button>
        </div>
        <p className="rail-note">
          {face === 'movies'
            ? 'Turn with the arrow keys, the scroll wheel or a drag. Enter previews the film in the gate; nothing changes until you choose Play.'
            : film.chapters.length > 0
              ? 'Chapters of this film. Enter opens a preview; nothing changes until you choose Jump here.'
              : 'This file has no published chapters, so its runtime is split into equal timed sections. Enter opens a preview.'}
        </p>
      </div>

      {face === 'movies' || sections.length > 0 ? (
        <NavigationWheel
          variant={face}
          sets={{
            movies: {
              items: filmItems,
              activeId: film.id,
              onSelect: (id, opener) => previewFilm(id, opener),
              label: 'Films',
              activeWord: 'Now showing',
              unit: 'Films',
              hubImage: filmStill,
            },
            scenes: {
              items: sectionItems,
              activeId: activeSection >= 0 ? String(activeSection) : null,
              onSelect: (id, opener) => {
                const s = sections[Number(id)];
                if (s) previewSection(s, opener);
              },
              label: `Scenes of ${film.title}`,
              activeWord: 'Now',
              unit: film.chapters.length > 0 ? 'Chapters' : 'Sections',
              hubImage: current ? film.frameAt(current.start + 1, 330) : filmStill,
            },
          }}
        />
      ) : (
        <p className="rail-detail rail-note">Waiting for the video duration before scenes can be listed.</p>
      )}

      <div className="rail-detail">
        {face === 'movies' ? (
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
            <span className="rail-kicker">You are in</span>
            <h2>{current ? `${current.title} · ${formatTime(current.start)}–${formatTime(current.end)}` : film.title}</h2>
            <p>
              {current
                ? `Part ${current.index + 1} of ${sections.length}. Previews use stills from the film itself; your place is kept until you jump.`
                : 'Start playback to see where you are.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
