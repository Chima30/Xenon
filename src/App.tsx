import { useEffect, useState } from 'react';
import { HomePage } from './pages/HomePage';
import { TestBench } from './pages/TestBench';
import { WorkbenchPage } from './pages/WorkbenchPage';

interface Route {
  name: 'home' | 'watch' | 'skin';
  filmId?: string;
  time?: number;
  end?: number;
}

/** Hash routes: #/ , #/watch/<id>?t=<seconds> , #/skin. No router dependency, no server config needed. */
function parse(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'skin') return { name: 'skin' };
  if (parts[0] === 'watch') {
    const q = new URLSearchParams(query);
    const t = Number(q.get('t'));
    const e = Number(q.get('e'));
    const time = Number.isFinite(t) && t > 0 ? t : undefined;
    return { name: 'watch', filmId: parts[1], time, end: Number.isFinite(e) && e > (time ?? 0) ? e : undefined };
  }
  return { name: 'home' };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  const [routeKey, setRouteKey] = useState(0);

  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash));
      setRouteKey((k) => k + 1);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#/" aria-label="Untitled cinema interface, home">
          <span className="brand-mark" aria-hidden="true" />
          <span>UNTITLED / CINEMA INTERFACE</span>
        </a>
        <nav aria-label="Primary">
          <a href="#/" aria-current={route.name === 'home' ? 'page' : undefined}>
            Home
          </a>
          <a href="#/watch/sintel" aria-current={route.name === 'watch' ? 'page' : undefined}>
            Player
          </a>
          <a href="#/skin" aria-current={route.name === 'skin' ? 'page' : undefined}>
            Skin only
          </a>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {route.name === 'home' ? <HomePage /> : null}
        {route.name === 'watch' ? (
          <>
            <h1 className="sr">Player</h1>
            <TestBench key={routeKey} filmId={route.filmId} startTime={route.time} endTime={route.end} />
            <p className="muted player-note">
              Tip: press <kbd>?</kbd> inside the player for every shortcut. Films are open-licensed; see{' '}
              <a href="#/">credits on the home page</a>.
            </p>
          </>
        ) : null}
        {route.name === 'skin' ? <WorkbenchPage /> : null}
      </main>
    </>
  );
}
