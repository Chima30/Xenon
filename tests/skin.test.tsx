import { Video, VideoPlayer } from '@videojs/react/video';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CinemaSkin } from '../src/skin';

beforeAll(() => {
  // jsdom has no layout engine or media playback; give the skin the minimum it touches.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // A desktop-width player, so the full dock renders.
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 675, width: 1200, height: 675, toJSON() {} } as DOMRect;
  };
  // jsdom has no Fullscreen API; Video.js only offers the button where fullscreen is possible.
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  HTMLElement.prototype.requestFullscreen = () => Promise.resolve();
  HTMLMediaElement.prototype.load = () => {};
  HTMLMediaElement.prototype.pause = () => {};
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  // jsdom's textTracks is not an event target; a real browser's is.
  const lists = new WeakMap<HTMLMediaElement, EventTarget>();
  Object.defineProperty(HTMLMediaElement.prototype, 'textTracks', {
    configurable: true,
    get(this: HTMLMediaElement) {
      let list = lists.get(this);
      if (!list) {
        list = Object.assign(new EventTarget(), {
          length: 0,
          getTrackById: () => null,
          [Symbol.iterator]: function* () {},
        });
        lists.set(this, list);
      }
      return list;
    },
  });
});
afterEach(cleanup);

function Player({ withSlots = true }: { withSlots?: boolean }) {
  return (
    <VideoPlayer>
      <CinemaSkin
        title="Sintel"
        palette={{ accent: '#ffb35c', base: '#170f12', glow: '#ff7a3c' }}
        railSlot={withSlots ? <button type="button">Wheel frame</button> : undefined}
        atlasSlot={withSlots ? <button type="button">Atlas card</button> : undefined}
      >
        <Video src="film.webm" />
      </CinemaSkin>
    </VideoPlayer>
  );
}

const root = () => document.querySelector('.cs-root') as HTMLElement;

describe('CinemaSkin', () => {
  it('renders the real Video.js playback controls with names', () => {
    render(<Player />);
    expect(screen.getAllByRole('button', { name: /play/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /mute/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /fullscreen/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    // The seek bar. (Video.js leaves the volume slider out where volume cannot be set, as in jsdom; checked in a browser.)
    expect(screen.getAllByRole('slider').length).toBeGreaterThanOrEqual(1);
  });

  it('switches Watch, Explore and My Atlas without remounting the video', () => {
    render(<Player />);
    const video = document.querySelector('video');
    const rail = document.querySelector('.cs-rail') as HTMLElement;
    const atlas = document.querySelector('.cs-atlas') as HTMLElement;
    expect(root().dataset.mode).toBe('watch');
    expect(rail.hasAttribute('inert')).toBe(true);
    expect(atlas.hasAttribute('inert')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    expect(root().dataset.mode).toBe('explore');
    expect(rail.hasAttribute('inert')).toBe(false);
    expect(atlas.hasAttribute('inert')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'My Atlas' }));
    expect(root().dataset.mode).toBe('remember');
    expect(rail.hasAttribute('inert')).toBe(true);
    expect(atlas.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('video')).toBe(video);
  });

  it('hides the mode switch when there is nothing to switch to', () => {
    render(<Player withSlots={false} />);
    expect(screen.queryByRole('group', { name: 'View mode' })).toBeNull();
  });

  it('keeps the status announcer for screen readers but visually hidden, never display:none', () => {
    render(<Player />);
    const announcer = document.querySelector('.cs-announcer') as HTMLElement;
    expect(announcer).toBeTruthy();
    expect(announcer.getAttribute('role')).toBe('status');
    expect(announcer.classList.contains('cs-sr')).toBe(true);
    expect(announcer.hidden).toBe(false);
    expect(announcer.getAttribute('aria-hidden')).toBeNull();
  });

  it('applies the film palette to the whole instrument', () => {
    render(<Player />);
    expect(root().style.getPropertyValue('--cs-base')).toBe('#170f12');
    expect(root().style.getPropertyValue('--cs-citron')).not.toBe('');
  });

  it('opens settings from the dock and closes it with Escape, returning focus', () => {
    render(<Player />);
    const opener = screen.getByRole('button', { name: 'Settings' });
    opener.focus();
    fireEvent.click(opener);
    const panel = screen.getByRole('dialog', { name: 'Settings' });
    expect(panel).toBeTruthy();
    act(() => {
      fireEvent.keyDown(panel, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
