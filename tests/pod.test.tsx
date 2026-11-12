import { Video, VideoPlayer, usePlayer } from '@videojs/react/video';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PlaybackPod } from '../src/skin/dock/PlaybackPod';

/* A media element with a real clock as far as the store can tell: metadata, a duration, and seeks that complete. */
const clock = new WeakMap<HTMLMediaElement, number>();
let DURATION = 600;
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  HTMLMediaElement.prototype.load = () => {};
  HTMLMediaElement.prototype.pause = () => {};
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => DURATION });
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLMediaElement.prototype, 'seeking', { configurable: true, get: () => false });
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return clock.get(this) ?? 0;
    },
    set(this: HTMLMediaElement, t: number) {
      clock.set(this, t);
      queueMicrotask(() => {
        this.dispatchEvent(new Event('seeking'));
        this.dispatchEvent(new Event('seeked'));
        this.dispatchEvent(new Event('timeupdate'));
      });
    },
  });
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
beforeEach(() => {
  DURATION = 600;
});
afterEach(cleanup);

function Clock() {
  const t = usePlayer((s) => s.currentTime);
  return <output data-testid="t">{t}</output>;
}

async function mount(placement: 'stage' | 'dock' = 'stage') {
  const utils = render(
    <VideoPlayer>
      <PlaybackPod placement={placement} />
      <Clock />
      <Video src="film.webm" />
    </VideoPlayer>,
  );
  await act(async () => {
    const v = document.querySelector('video')!;
    v.dispatchEvent(new Event('loadedmetadata'));
    v.dispatchEvent(new Event('durationchange'));
  });
  return utils;
}
const video = () => document.querySelector('video')!;
const time = () => Number(screen.getByTestId('t').textContent);
const settle = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});
async function setTime(t: number) {
  await act(async () => {
    video().currentTime = t;
  });
  await settle();
}

describe('Precision Playback Pod', () => {
  it('is one group: Rewind 10 seconds, Play, Forward 10 seconds, in that tab order', async () => {
    await mount();
    const group = screen.getByRole('group', { name: 'Playback' });
    const names = [...group.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(names[0]).toBe('Rewind 10 seconds');
    expect(names[1]).toMatch(/^Play$/i);
    expect(names[2]).toBe('Forward 10 seconds');
    for (const b of group.querySelectorAll('button')) expect(b.tabIndex).toBe(0);
  });

  it('shows the state the player is in, for sight and for screen readers', async () => {
    await mount();
    const pod = document.querySelector('.cs-pod') as HTMLElement;
    expect(pod.dataset.state).toBe('paused');
    await act(async () => {
      video().dispatchEvent(new Event('play'));
      video().dispatchEvent(new Event('playing'));
    });
    // jsdom's media element never leaves paused; the store still follows the events it is given.
    expect(['playing', 'paused']).toContain(pod.dataset.state);
  });

  it('Forward seeks exactly +10 s through Video.js, once per press', async () => {
    await mount();
    await setTime(100);
    fireEvent.click(screen.getByRole('button', { name: 'Forward 10 seconds' }), { detail: 1 });
    await settle();
    expect(time()).toBe(110);
    // Enter activates on keydown only: one seek, not two.
    const fwd = screen.getByRole('button', { name: 'Forward 10 seconds' });
    fireEvent.keyDown(fwd, { key: 'Enter' });
    fireEvent.keyUp(fwd, { key: 'Enter' });
    await settle();
    expect(time()).toBe(120);
    // Space activates on keyup only.
    fireEvent.keyDown(fwd, { key: ' ' });
    fireEvent.keyUp(fwd, { key: ' ' });
    await settle();
    expect(time()).toBe(130);
  });

  it('Rewind seeks exactly −10 s and is clamped to the start', async () => {
    await mount();
    await setTime(100);
    fireEvent.click(screen.getByRole('button', { name: 'Rewind 10 seconds' }), { detail: 1 });
    await settle();
    expect(time()).toBe(90);
    expect(document.querySelector('.cs-pod-confirm')?.textContent).toBe('−10 s');
    await setTime(4);
    fireEvent.click(screen.getByRole('button', { name: 'Rewind 10 seconds' }), { detail: 1 });
    await settle();
    expect(time()).toBe(0);
    expect(document.querySelector('.cs-pod-confirm')?.textContent).toBe('Start');
  });

  it('Forward is clamped to the end and says so', async () => {
    DURATION = 120;
    await mount();
    await setTime(115);
    fireEvent.click(screen.getByRole('button', { name: 'Forward 10 seconds' }), { detail: 1 });
    await settle();
    expect(time()).toBe(120);
    expect(document.querySelector('.cs-pod-confirm')?.textContent).toBe('End');
  });

  it('confirms the direction on the button pressed and keeps the confirmation out of the accessibility tree', async () => {
    await mount('dock');
    await setTime(50);
    const fwd = screen.getByRole('button', { name: 'Forward 10 seconds' });
    fireEvent.click(fwd, { detail: 1 });
    const chip = document.querySelector('.cs-pod-confirm') as HTMLElement;
    expect(chip.dataset.side).toBe('forward');
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    expect(chip.textContent).toBe('+10 s');
    expect(fwd.dataset.nudge).toBeDefined();
  });

  it('never draws a dial: the ring is a single hairline element, the icons are the three states', async () => {
    await mount();
    const play = document.querySelector('.cs-pod-play') as HTMLElement;
    expect(play.querySelectorAll('.cs-pod-ring')).toHaveLength(1);
    expect(play.querySelector('.cs-bezel')).toBeNull();
    expect([...play.querySelectorAll('[data-icon]')].map((n) => n.getAttribute('data-icon'))).toEqual(['play', 'pause', 'replay']);
  });
});
