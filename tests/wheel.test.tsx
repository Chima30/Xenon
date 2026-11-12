import { Video, VideoPlayer } from '@videojs/react/video';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NavigationRail, type NavFilm } from '../src/skin/wheel/NavigationRail';
import { NavigationWheel, type WheelPoint, type WheelSet, type WheelVariant } from '../src/skin/wheel/NavigationWheel';
import type { SkinScene } from '../src/skin/scenes';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  HTMLMediaElement.prototype.load = () => {};
  HTMLMediaElement.prototype.pause = () => {};
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => 600 });
  const lists = new WeakMap<HTMLMediaElement, EventTarget>();
  Object.defineProperty(HTMLMediaElement.prototype, 'textTracks', {
    configurable: true,
    get(this: HTMLMediaElement) {
      let list = lists.get(this);
      if (!list) {
        list = Object.assign(new EventTarget(), { length: 0, getTrackById: () => null, [Symbol.iterator]: function* () {} });
        lists.set(this, list);
      }
      return list;
    },
  });
});
afterEach(cleanup);

const filmNames = ['Sintel', 'Tears of Steel', 'Big Buck Bunny'];
const sceneNames = ['Section 1', 'Section 2', 'Section 3', 'Section 4'];

function makeSets(onFilm = vi.fn(), onScene = vi.fn()): Record<WheelVariant, WheelSet> {
  return {
    movies: {
      items: filmNames.map((label, i) => ({ id: `f${i}`, label })),
      activeId: 'f0',
      onSelect: onFilm,
      label: 'Films',
      activeWord: 'Playing',
      unit: 'Films',
    },
    scenes: {
      items: sceneNames.map((label, i) => ({ id: String(i), label })),
      activeId: '1',
      onSelect: onScene,
      label: 'Scenes of Sintel',
      activeWord: 'Now',
      unit: 'Sections',
    },
  };
}

const focused = () => document.activeElement as HTMLElement;
const wheelPos = (c: HTMLElement) => Number((c.querySelector('.wheel') as HTMLElement).style.getPropertyValue('--wheel-h'));

describe('NavigationWheel', () => {
  it('lists every film on the curve and marks the playing one', () => {
    render(<NavigationWheel variant="movies" sets={makeSets()} />);
    const list = screen.getByRole('list', { name: 'Films' });
    expect(list.querySelectorAll('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Sintel, Playing/ }).getAttribute('aria-current')).toBe('true');
  });

  it('keeps a single tab stop (roving tabindex) on the frame in the gate', () => {
    render(<NavigationWheel variant="movies" sets={makeSets()} />);
    const stops = screen.getAllByRole('button').filter((b) => b.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.textContent).toContain('Sintel');
  });

  it('starts at the live frame and writes its position to CSS, not to React state', () => {
    const sets = makeSets();
    sets.movies.activeId = 'f2';
    const { container } = render(<NavigationWheel variant="movies" sets={sets} />);
    expect(wheelPos(container)).toBe(2);
    expect(container.querySelector('.wheel-readout strong')?.textContent).toBe('03');
  });

  it('turns with the arrow keys, PageUp/PageDown, Home and End without selecting anything', async () => {
    const onFilm = vi.fn();
    const onPoint = vi.fn();
    const { container } = render(<NavigationWheel variant="movies" sets={makeSets(onFilm)} onPoint={onPoint} />);
    screen.getByRole('button', { name: /Sintel/ }).focus();
    fireEvent.keyDown(focused(), { key: 'ArrowDown' });
    expect(focused().getAttribute('aria-label')).toContain('Tears of Steel');
    expect(onPoint).toHaveBeenLastCalledWith('movies', 1, 'user');
    // The wheel turns on a spring and settles exactly on the frame.
    await waitFor(() => expect(wheelPos(container)).toBe(1));
    fireEvent.keyDown(focused(), { key: 'End' });
    expect(focused().getAttribute('aria-label')).toContain('Big Buck Bunny');
    fireEvent.keyDown(focused(), { key: 'Home' });
    expect(focused().getAttribute('aria-label')).toContain('Sintel');
    fireEvent.keyDown(focused(), { key: 'PageDown' });
    expect(focused().getAttribute('aria-label')).toContain('Big Buck Bunny');
    expect(onFilm).not.toHaveBeenCalled();
  });

  it('a click or Enter reports the frame, and whether it came from the keyboard', () => {
    const onScene = vi.fn();
    render(<NavigationWheel variant="scenes" sets={makeSets(vi.fn(), onScene)} />);
    const btn = screen.getByRole('button', { name: /Section 3/ });
    fireEvent.click(btn, { detail: 1 });
    expect(onScene).toHaveBeenCalledWith('2', btn, false);
    fireEvent.click(btn, { detail: 0 });
    expect(onScene).toHaveBeenLastCalledWith('2', btn, true);
  });

  it('keeps arrow, Space and Enter keys away from the player hotkeys', () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <NavigationWheel variant="movies" sets={makeSets()} />
      </div>,
    );
    const first = screen.getByRole('button', { name: /Sintel/ });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    fireEvent.keyDown(focused(), { key: ' ' });
    fireEvent.keyDown(focused(), { key: 'Enter' });
    fireEvent.keyDown(focused(), { key: 'PageDown' });
    expect(outer).not.toHaveBeenCalled();
  });

  it('turns with the scroll wheel and snaps to the nearest frame when scrolling stops', async () => {
    const onPoint = vi.fn();
    const { container } = render(<NavigationWheel variant="movies" sets={makeSets()} onPoint={onPoint} />);
    const wheel = container.querySelector('.wheel') as HTMLElement;
    fireEvent.wheel(wheel, { deltaY: 60 });
    fireEvent.wheel(wheel, { deltaY: 70 }); // 1.3 frames of travel
    await waitFor(() => expect(onPoint).toHaveBeenLastCalledWith('movies', 1, 'user'));
    await waitFor(() => expect(wheelPos(container)).toBe(1));
  });

  it('folds from Movies into Scenes and points at the current scene', async () => {
    const sets = makeSets();
    const { rerender, container } = render(<NavigationWheel variant="movies" sets={sets} />);
    rerender(<NavigationWheel variant="scenes" sets={sets} />);
    // The old face folds into the hub first: its frames are still listed while --wheel-fan falls.
    expect(screen.getByRole('list', { name: 'Films' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('list', { name: 'Scenes of Sintel' })).toBeTruthy());
    expect(screen.getByRole('button', { name: /Section 2, Now/ }).tabIndex).toBe(0);
    expect(container.querySelector('.wheel-readout strong')?.textContent).toBe('02');
    await waitFor(() => expect((container.querySelector('.wheel') as HTMLElement).style.getPropertyValue('--wheel-fan')).toBe('1.0000'));
  });

  it('switches faces at once when reduced motion is requested', () => {
    const sets = makeSets();
    const { rerender } = render(
      <div className="cs-root" data-motion="reduce">
        <NavigationWheel variant="movies" sets={sets} />
      </div>,
    );
    rerender(
      <div className="cs-root" data-motion="reduce">
        <NavigationWheel variant="scenes" sets={sets} />
      </div>,
    );
    expect(screen.getByRole('list', { name: 'Scenes of Sintel' })).toBeTruthy();
  });

  it('places the wheel immediately under reduced motion', () => {
    const { container } = render(
      <div className="cs-root" data-motion="reduce">
        <NavigationWheel variant="movies" sets={makeSets()} />
      </div>,
    );
    screen.getByRole('button', { name: /Sintel/ }).focus();
    fireEvent.keyDown(focused(), { key: 'End' });
    expect(wheelPos(container)).toBe(2);
  });

  it('turns to a frame requested from outside and focuses it', async () => {
    const sets = makeSets();
    const point: WheelPoint = { id: 1, face: 'movies', index: 2, focus: true };
    const { container } = render(<NavigationWheel variant="movies" sets={sets} point={point} />);
    await waitFor(() => expect(focused().getAttribute('aria-label')).toContain('Big Buck Bunny'));
    await waitFor(() => expect(wheelPos(container)).toBe(2));
  });

  it('shows a timecode card when a still is missing', () => {
    const sets = makeSets();
    sets.movies.items[0] = { id: 'f0', label: 'Sintel', image: null, fallbackText: '0:00' };
    const { container } = render(<NavigationWheel variant="movies" sets={sets} />);
    expect(container.querySelector('.wheel-thumb-fallback')?.textContent).toBe('0:00');
  });
});

/* ------------------------------------------------------------------ */

const films: NavFilm[] = [
  { id: 'sintel', title: 'Sintel', meta: 'Fantasy short · 2010', description: 'A girl searches for her dragon.' },
  { id: 'tears', title: 'Tears of Steel', meta: 'Sci-fi short · 2012' },
  { id: 'bunny', title: 'Big Buck Bunny', meta: 'Comedy animation · 2008' },
];
const scenes: SkinScene[] = [0, 1, 2, 3].map((i) => ({ start: i * 150, end: (i + 1) * 150, title: `Section ${i + 1}` }));

function mountRail(extra: Partial<Parameters<typeof NavigationRail>[0]> = {}) {
  const onPlayFilm = vi.fn();
  const onJump = vi.fn();
  const utils = render(
    <VideoPlayer>
      <NavigationRail films={films} activeFilmId="sintel" onPlayFilm={onPlayFilm} scenes={scenes} onJump={onJump} {...extra} />
      <Video src="film.webm" />
    </VideoPlayer>,
  );
  act(() => {
    document.querySelector('video')?.dispatchEvent(new Event('loadedmetadata'));
    document.querySelector('video')?.dispatchEvent(new Event('durationchange'));
  });
  return { ...utils, onPlayFilm, onJump };
}

describe('NavigationRail', () => {
  it('has the Movies / Scenes switch and a Now playing card', () => {
    mountRail();
    expect(screen.getByRole('button', { name: /Movies/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Scenes/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Now playing')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sintel' })).toBeTruthy();
    // Nothing to play: Sintel is already showing.
    expect(screen.queryByRole('button', { name: /^Play / })).toBeNull();
  });

  it('turning to another film describes it; only the explicit Play switches', () => {
    const { onPlayFilm } = mountRail();
    screen.getByRole('button', { name: /Sintel, Fantasy/ }).focus();
    fireEvent.keyDown(focused(), { key: 'ArrowDown' });
    expect(screen.getByRole('heading', { name: 'Tears of Steel' })).toBeTruthy();
    expect(screen.getByText('Film 2 of 3')).toBeTruthy();
    expect(onPlayFilm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play Tears of Steel' }));
    expect(onPlayFilm).toHaveBeenCalledWith('tears');
  });

  it('Enter on a frame hands focus to the card action', async () => {
    mountRail();
    screen.getByRole('button', { name: /Sintel, Fantasy/ }).focus();
    fireEvent.keyDown(focused(), { key: 'End' });
    fireEvent.click(focused(), { detail: 0 });
    await waitFor(() => expect(focused().textContent).toBe('Play Big Buck Bunny'));
  });

  it('the Scenes face jumps only from the card, with the scene title', async () => {
    const { onJump } = mountRail();
    fireEvent.click(screen.getByRole('button', { name: /Scenes/ }));
    await waitFor(() => expect(screen.getByRole('list', { name: /Sections of Sintel/ })).toBeTruthy());
    screen.getByRole('button', { name: /Section 1 · 0:00/ }).focus();
    fireEvent.keyDown(focused(), { key: 'ArrowDown' });
    fireEvent.keyDown(focused(), { key: 'ArrowDown' });
    expect(screen.getByRole('heading', { name: 'Section 3' })).toBeTruthy();
    expect(onJump).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Jump to 5:00' }));
    expect(onJump).toHaveBeenCalledWith(300, 'Section 3');
  });

  it('offers the Time Tether beside the action', () => {
    const onReturn = vi.fn();
    mountRail({ tether: { time: 42, onReturn } });
    fireEvent.click(screen.getByRole('button', { name: /Back to 0:42/ }));
    expect(onReturn).toHaveBeenCalled();
  });

  it('describes a saved moment when asked to, and jumps only on request', async () => {
    const { onJump } = mountRail({ target: { id: 1, value: { moment: { time: 222, title: 'The reveal', note: 'Look at the sky' } } } });
    expect(screen.getByText('Saved moment')).toBeTruthy();
    expect(screen.getByText('Look at the sky')).toBeTruthy();
    expect(onJump).not.toHaveBeenCalled();
    await waitFor(() => expect(focused().textContent).toBe('Jump to 3:42'));
    fireEvent.click(screen.getByRole('button', { name: 'Jump to 3:42' }));
    expect(onJump).toHaveBeenCalledWith(222, 'The reveal');
  });

  it('opens on the Scenes face at a requested scene', async () => {
    mountRail({ target: { id: 1, value: { face: 'scenes', index: 2 } } });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Section 3' })).toBeTruthy());
    expect(screen.getByRole('button', { name: /Scenes/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('a single-video embed shows the Scenes face only, without the switch', () => {
    mountRail({ films: [] });
    expect(screen.queryByRole('group', { name: 'Wheel shows' })).toBeNull();
    expect(screen.getByRole('list', { name: /Sections of this video/ })).toBeTruthy();
  });
});
