import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paletteOf } from '../src/skin/slate/frameColours';
import { SlateStick } from '../src/skin/slate/SlateStick';
import { nextFilm } from '../src/skin/slate/TailSlate';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Tail slate: the next film on the wheel', () => {
  const films = [
    { id: 'sintel', title: 'Sintel', progress: 0.2 },
    { id: 'tears', title: 'Tears of Steel', progress: 1 },
    { id: 'bunny', title: 'Big Buck Bunny', progress: 0 },
  ];
  it('skips a film already finished and wraps round the wheel', () => {
    expect(nextFilm(films, 'sintel')?.id).toBe('bunny');
    expect(nextFilm(films, 'bunny')?.id).toBe('sintel');
  });
  it('falls back to the next film when every other one is finished', () => {
    const done = films.map((f) => ({ ...f, progress: 1 }));
    expect(nextFilm(done, 'sintel')?.id).toBe('tears');
  });
  it('offers nothing for a single video', () => {
    expect(nextFilm([films[0]!], 'sintel')).toBeNull();
    expect(nextFilm([], undefined)).toBeNull();
  });
});

describe('Frame colours', () => {
  /** A fake 2D context whose pixels are two flat colours, 2/3 sky blue and 1/3 near-black. */
  function stubCanvas(pixels: number[][]) {
    const data = new Uint8ClampedArray(48 * 27 * 4);
    for (let i = 0; i < 48 * 27; i++) {
      const c = pixels[i % pixels.length]!;
      data.set([c[0]!, c[1]!, c[2]!, 255], i * 4);
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => {},
      getImageData: () => ({ data }),
    } as unknown as CanvasRenderingContext2D);
  }

  it('reads the dominant colours of a frame, darkest first, without near-duplicates', () => {
    stubCanvas([
      [92, 180, 230],
      [94, 182, 232],
      [12, 14, 20],
    ]);
    expect(paletteOf(document.createElement('canvas'))).toEqual(['#0c0e14', '#5db5e7']);
  });

  it('returns null when the frame cannot be read (a tainted canvas)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => {},
      getImageData: () => {
        throw new DOMException('The canvas has been tainted', 'SecurityError');
      },
    } as unknown as CanvasRenderingContext2D);
    expect(paletteOf(document.createElement('canvas'))).toBeNull();
  });
});

describe('Slate clapstick', () => {
  it('wears the film palette until the frame is read, then the frame colours', () => {
    const { container, rerender } = render(<SlateStick colours={null} />);
    const stick = container.querySelector('.cs-slate-stick') as HTMLElement;
    expect(stick.hasAttribute('data-frame')).toBe(false);
    expect(stick.getAttribute('aria-hidden')).toBe('true');
    rerender(<SlateStick colours={['#101010', '#405060', '#e0d0c0']} />);
    expect(stick.hasAttribute('data-frame')).toBe(true);
    expect(stick.style.getPropertyValue('--sc2')).toBe('#405060');
    expect(stick.getAttribute('title')).toBe('Colours of this frame: #101010 #405060 #e0d0c0');
  });
  it('is held upside down on the tail slate', () => {
    const { container } = render(<SlateStick colours={null} tail />);
    expect(container.querySelector('.cs-slate-stick')?.hasAttribute('data-tail')).toBe(true);
  });
});
