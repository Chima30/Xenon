import { useMemo, useState } from 'react';
import { CATALOG, FILMS, type Film } from '../data/catalog';
import { resumeTime, toggleMyList, useMyList, useProgress } from '../data/stores';
import { formatTime } from '../skin';
import { SHORTCUTS } from '../skin/KeymapDialog';

type Filter = 'all' | 'continue' | 'list';

export function HomePage() {
  const progress = useProgress();
  const myList = useMyList();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const hero = FILMS[0]!;
  const continuing = CATALOG.filter((f) => resumeTime(progress[f.id]) !== null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter((f) => {
      if (filter === 'continue' && resumeTime(progress[f.id]) === null) return false;
      if (filter === 'list' && !myList.includes(f.id)) return false;
      if (!q) return true;
      return `${f.title} ${f.genre} ${f.creator}`.toLowerCase().includes(q);
    });
  }, [query, filter, progress, myList]);

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <img
          className="hero-img"
          src={hero.frameAt(300, 1280) ?? ''}
          alt=""
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
        <div className="hero-scrim" />
        <div className="hero-copy">
          <p className="kicker">Featured open film</p>
          <h1 id="hero-title">{hero.title}</h1>
          <p className="hero-desc">{hero.description}</p>
          <p className="hero-meta">
            {hero.genre} · {hero.year} · {hero.duration ? formatTime(hero.duration) : ''} ·{' '}
            <a href={hero.license.url} target="_blank" rel="noreferrer">
              {hero.license.name}
            </a>
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={`#/watch/${hero.id}`}>
              Watch with the skin
            </a>
            <a className="btn" href="#/skin">
              One-video embed
            </a>
          </div>
        </div>
      </section>

      <section className="toolbar" aria-label="Browse">
        <div className="chips" role="group" aria-label="Filter films">
          {(
            [
              ['all', 'All films'],
              ['continue', 'Continue watching'],
              ['list', 'My List'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <label className="search">
          <span className="sr">Search films</span>
          <input
            type="search"
            placeholder="Search films"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </section>

      {continuing.length > 0 && filter === 'all' && !query ? (
        <section aria-labelledby="cont-h">
          <h2 id="cont-h">Continue watching</h2>
          <ul className="grid">
            {continuing.map((f) => (
              <FilmCard key={f.id} film={f} resume />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="films-h">
        <h2 id="films-h">Open films</h2>
        {visible.length === 0 ? (
          <p className="empty">
            {filter === 'list'
              ? 'Your list is empty. Use “Add to My List” on any film.'
              : filter === 'continue'
                ? 'Nothing in progress yet. Start a film and it will appear here.'
                : 'No film matches that search.'}
          </p>
        ) : (
          <ul className="grid">
            {visible.map((f) => (
              <FilmCard key={f.id} film={f} />
            ))}
          </ul>
        )}
      </section>

      <section className="tour" aria-labelledby="tour-h">
        <h2 id="tour-h">Feature tour</h2>
        <p className="lede">Watch a story. Explore its scenes. Return to your place. Remember what mattered.</p>
        <div className="tour-grid">
          <article>
            <h3>Watch</h3>
            <p>A Video.js v10 player with real play, seek, volume, speed, fullscreen and picture-in-picture where supported.</p>
          </article>
          <article>
            <h3>Explore</h3>
            <p>
              A wheel of films and a wheel of scenes. Browsing only highlights; Enter or a click loads. Jumping to a scene
              leaves a Return Anchor so you can come back in one action.
            </p>
          </article>
          <article>
            <h3>My Atlas</h3>
            <p>
              Save moments, label them, jump back, export them. Everything lives in this browser; there is no account.
            </p>
          </article>
        </div>
        <h3 className="tour-sub">Keyboard</h3>
        <ul className="keys">
          {SHORTCUTS.slice(0, 9).map((s) => (
            <li key={s.action}>
              {s.keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
              <span>{s.action}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="credits-h" id="credits">
        <h2 id="credits-h">Credits and licences</h2>
        <ul className="credits">
          {FILMS.map((f) => (
            <li key={f.id}>
              <strong>{f.title}</strong> ({f.year}) · {f.creator} · licensed{' '}
              <a href={f.license.url} target="_blank" rel="noreferrer">
                {f.license.name}
              </a>{' '}
              · file via{' '}
              <a href={f.source.url} target="_blank" rel="noreferrer">
                {f.source.label}
              </a>
              . Still frames are generated from the same files.
            </li>
          ))}
        </ul>
        <p className="muted">
          More open films:{' '}
          <a href="https://studio.blender.org/films/" target="_blank" rel="noreferrer">
            Blender Studio
          </a>
          . Check each film’s licence before reuse; they are not all identical.
        </p>
      </section>
    </>
  );
}

function FilmCard({ film, resume = false }: { film: Film; resume?: boolean }) {
  const progress = useProgress();
  const myList = useMyList();
  const p = progress[film.id];
  const inList = myList.includes(film.id);
  const t = resume ? resumeTime(p) : null;
  return (
    <li className="card">
      <a className="card-link" href={`#/watch/${film.id}`}>
        <span className="card-img">
          <img
            src={film.frameAt(film.duration ? film.duration * 0.3 : 30, 500) ?? ''}
            alt=""
            loading="lazy"
            onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
          />
          {p && p.duration > 0 ? (
            <span className="card-progress" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (p.time / p.duration) * 100)}%` }} />
            </span>
          ) : null}
        </span>
        <span className="card-title">{film.title}</span>
        <span className="card-meta">
          {film.genre}
          {film.duration ? ` · ${formatTime(film.duration)}` : ''}
          {t !== null ? ` · resume ${formatTime(t)}` : ''}
        </span>
      </a>
      <button type="button" className="link-btn" aria-pressed={inList} onClick={() => toggleMyList(film.id)}>
        {inList ? 'Remove from My List' : 'Add to My List'}
        <span className="sr"> {film.title}</span>
      </button>
    </li>
  );
}
