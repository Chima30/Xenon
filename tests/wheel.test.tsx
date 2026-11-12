import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavigationWheel, type WheelSet, type WheelVariant } from '../src/features/NavigationWheel';

afterEach(cleanup);

const films = ['Sintel', 'Tears of Steel', 'Big Buck Bunny'];
const scenes = ['Section 1', 'Section 2', 'Section 3', 'Section 4'];

function makeSets(onFilm = vi.fn(), onScene = vi.fn()): Record<WheelVariant, WheelSet> {
  return {
    movies: {
      items: films.map((label, i) => ({ id: `f${i}`, label })),
      activeId: 'f0',
      onSelect: onFilm,
      label: 'Films',
      activeWord: 'Playing',
      unit: 'Films',
    },
    scenes: {
      items: scenes.map((label, i) => ({ id: String(i), label })),
      activeId: '1',
      onSelect: onScene,
      label: 'Scenes of Sintel',
      activeWord: 'Now',
      unit: 'Sections',
    },
  };
}

const focused = () => document.activeElement as HTMLElement;

describe('NavigationWheel', () => {
  it('lists every film and marks the playing one', () => {
    render(<NavigationWheel variant="movies" sets={makeSets()} />);
    const list = screen.getByRole('list', { name: 'Films' });
    expect(list.querySelectorAll('button')).toHaveLength(3);
    const playing = screen.getByRole('button', { name: /Sintel, Playing/ });
    expect(playing.getAttribute('aria-current')).toBe('true');
  });

  it('keeps a single tab stop (roving tabindex) on the highlighted frame', () => {
    render(<NavigationWheel variant="movies" sets={makeSets()} />);
    const stops = screen.getAllByRole('button').filter((b) => b.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.textContent).toContain('Sintel');
  });

  it('browses with the arrow keys without selecting, and selects with a click/Enter', () => {
    const onFilm = vi.fn();
    render(<NavigationWheel variant="movies" sets={makeSets(onFilm)} />);
    const first = screen.getByRole('button', { name: /Sintel/ });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(focused().getAttribute('aria-label')).toContain('Tears of Steel');
    fireEvent.keyDown(focused(), { key: 'End' });
    expect(focused().getAttribute('aria-label')).toContain('Big Buck Bunny');
    fireEvent.keyDown(focused(), { key: 'Home' });
    expect(focused().getAttribute('aria-label')).toContain('Sintel');
    expect(onFilm).not.toHaveBeenCalled();

    fireEvent.keyDown(focused(), { key: 'ArrowDown' });
    fireEvent.click(focused());
    expect(onFilm).toHaveBeenCalledTimes(1);
    expect(onFilm.mock.calls[0]?.[0]).toBe('f1');
  });

  it('keeps arrow keys away from the player hotkeys', () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <NavigationWheel variant="movies" sets={makeSets()} />
      </div>,
    );
    const first = screen.getByRole('button', { name: /Sintel/ });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    fireEvent.keyDown(focused(), { key: ' ' });
    expect(outer).not.toHaveBeenCalled();
  });

  it('transforms from Movies to Scenes and points at the current scene', () => {
    vi.useFakeTimers();
    const sets = makeSets();
    const { rerender, container } = render(<NavigationWheel variant="movies" sets={sets} />);
    rerender(<NavigationWheel variant="scenes" sets={sets} />);
    // The old face folds into the hub first.
    expect(container.querySelector('.wheel')?.hasAttribute('data-folded')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    vi.useRealTimers();
    const list = screen.getByRole('list', { name: 'Scenes of Sintel' });
    expect(list.querySelectorAll('button')).toHaveLength(4);
    const now = screen.getByRole('button', { name: /Section 2, Now/ });
    expect(now.tabIndex).toBe(0);
    expect(container.querySelector('.wheel-readout strong')?.textContent).toBe('02');
  });

  it('switches faces instantly when reduced motion is requested', () => {
    const sets = makeSets();
    const { rerender, container } = render(
      <div className="cs-root" data-motion="reduce">
        <NavigationWheel variant="movies" sets={sets} />
      </div>,
    );
    rerender(
      <div className="cs-root" data-motion="reduce">
        <NavigationWheel variant="scenes" sets={sets} />
      </div>,
    );
    expect(container.querySelector('.wheel')?.hasAttribute('data-folded')).toBe(false);
    expect(screen.getByRole('list', { name: 'Scenes of Sintel' })).toBeTruthy();
  });

  it('passes the pressed frame to onSelect so focus can return to it', () => {
    const onScene = vi.fn();
    const sets = makeSets(vi.fn(), onScene);
    render(<NavigationWheel variant="scenes" sets={sets} />);
    const btn = screen.getByRole('button', { name: /Section 3/ });
    fireEvent.click(btn);
    expect(onScene).toHaveBeenCalledWith('2', btn);
  });

  it('shows a timecode card when a still is missing', () => {
    const sets = makeSets();
    sets.movies.items[0] = { id: 'f0', label: 'Sintel', image: null, fallbackText: '0:00' };
    const { container } = render(<NavigationWheel variant="movies" sets={sets} />);
    expect(container.querySelector('.wheel-thumb-fallback')?.textContent).toBe('0:00');
  });
});
