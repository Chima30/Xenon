import { Video, VideoPlayer } from '@videojs/react/video';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Optic, type OpticFilm } from '../src/skin/optic/Optic';
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
  // A real duration, so the scene ring can be laid out on the clock.
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

const films: OpticFilm[] = [
  { id: 'sintel', title: 'Sintel', meta: 'Fantasy short · 2010' },
  { id: 'tears', title: 'Tears of Steel', meta: 'Sci-fi short · 2012' },
  { id: 'bunny', title: 'Big Buck Bunny', meta: 'Comedy animation · 2008' },
];
const scenes: SkinScene[] = [0, 1, 2, 3].map((i) => ({ start: i * 150, end: (i + 1) * 150, title: `Section ${i + 1}` }));

function mount(extra: Partial<Parameters<typeof Optic>[0]> = {}) {
  const onPlayFilm = vi.fn();
  const onJump = vi.fn();
  const utils = render(
    <VideoPlayer>
      <Optic films={films} activeFilmId="sintel" onPlayFilm={onPlayFilm} scenes={scenes} onJump={onJump} {...extra} />
      <Video src="film.webm" />
    </VideoPlayer>,
  );
  // Let the player read the stubbed duration.
  act(() => {
    document.querySelector('video')?.dispatchEvent(new Event('loadedmetadata'));
    document.querySelector('video')?.dispatchEvent(new Event('durationchange'));
  });
  return { ...utils, onPlayFilm, onJump };
}
const filmsRing = () => screen.getByRole('slider', { name: /Films ring/ });
const scenesRing = () => screen.getByRole('slider', { name: /ring\. Arrow keys turn it, Enter jumps/ });

describe('XENON Optic', () => {
  it('is two ARIA sliders: films on the outer ring, scenes on the inner', () => {
    mount();
    expect(filmsRing().getAttribute('aria-valuetext')).toMatch(/^Sintel.*now showing/);
    expect(scenesRing().getAttribute('aria-valuemax')).toBe('4');
  });

  it('turning the films ring previews a film without switching; Enter or Play switches', () => {
    const { onPlayFilm } = mount();
    const ring = filmsRing();
    ring.focus();
    fireEvent.keyDown(ring, { key: 'ArrowRight' });
    expect(ring.getAttribute('aria-valuetext')).toMatch(/^Tears of Steel/);
    expect(screen.getByRole('button', { name: 'Play Tears of Steel' })).toBeTruthy();
    expect(onPlayFilm).not.toHaveBeenCalled();
    fireEvent.keyDown(ring, { key: 'Enter' });
    expect(onPlayFilm).toHaveBeenCalledWith('tears');
  });

  it('offers no Play action for the film already showing', () => {
    mount();
    filmsRing().focus();
    expect(screen.queryByRole('button', { name: /^Play / })).toBeNull();
  });

  it('keeps ring keys away from the player hotkeys', () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <VideoPlayer>
          <Optic films={films} activeFilmId="sintel" scenes={[]} onJump={vi.fn()} />
        </VideoPlayer>
      </div>,
    );
    const ring = filmsRing();
    fireEvent.keyDown(ring, { key: 'ArrowRight' });
    fireEvent.keyDown(ring, { key: 'End' });
    expect(outer).not.toHaveBeenCalled();
  });

  it('the scenes ring jumps only on Enter, with the scene title', () => {
    const { onJump } = mount();
    const ring = scenesRing();
    ring.focus();
    fireEvent.keyDown(ring, { key: 'ArrowRight' });
    fireEvent.keyDown(ring, { key: 'ArrowRight' });
    expect(ring.getAttribute('aria-valuetext')).toMatch(/^Section 3/);
    expect(onJump).not.toHaveBeenCalled();
    fireEvent.keyDown(ring, { key: 'Enter' });
    expect(onJump).toHaveBeenCalledWith(300, 'Section 3');
  });

  it('offers the Time Tether beside the action', () => {
    const onReturn = vi.fn();
    mount({ tether: { time: 42, onReturn } });
    fireEvent.click(screen.getByRole('button', { name: /Back to 0:42/ }));
    expect(onReturn).toHaveBeenCalled();
  });

  it('previews a saved moment in the lens when asked to', () => {
    const { onJump } = mount({ target: { id: 1, value: { moment: { time: 222, title: 'The reveal', note: 'Look at the sky' } } } });
    expect(screen.getByText('Saved moment')).toBeTruthy();
    expect(screen.getByText('Look at the sky')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Jump to 3:42' }));
    expect(onJump).toHaveBeenCalledWith(222, 'The reveal');
  });

  it('has a plain list alternative with the same choices', () => {
    const { onPlayFilm } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Show as list' }));
    expect(screen.getAllByRole('button', { name: /Section \d/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: /Big Buck Bunny/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Play Big Buck Bunny' }));
    expect(onPlayFilm).toHaveBeenCalledWith('bunny');
  });
});
