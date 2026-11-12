import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILMS } from '../src/data/catalog';
import { AppearanceProvider, useAppearance } from '../src/skin/appearance/AppearanceContext';
import { PrefsProvider, usePrefs } from '../src/skin/prefs/PrefsContext';
import { sceneIndexAt, sceneKind, type SkinScene } from '../src/skin/scenes';
import { TimePortal, type PortalStop } from '../src/skin/TimePortal';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('Scene model', () => {
  const sections: SkinScene[] = [
    { start: 0, end: 60, title: 'Section 1' },
    { start: 60, end: 120, title: 'Section 2' },
  ];
  it('finds the scene containing a time', () => {
    expect(sceneIndexAt(sections, 0)).toBe(0);
    expect(sceneIndexAt(sections, 59.9)).toBe(0);
    expect(sceneIndexAt(sections, 60)).toBe(1);
    expect(sceneIndexAt([], 10)).toBe(-1);
  });
  it('labels generated sections honestly and authored chapters as chapters', () => {
    expect(sceneKind(sections)).toBe('Section');
    expect(sceneKind([{ start: 0, end: 10, title: 'Opening', authored: true }])).toBe('Chapter');
  });
});

describe('Film-reactive theme', () => {
  function Probe() {
    const { cssVars, appearance, update } = useAppearance();
    return (
      <>
        <pre data-testid="vars">{JSON.stringify(cssVars)}</pre>
        <button type="button" onClick={() => update({ theme: appearance.theme === 'adaptive' ? 'fixed' : 'adaptive' })}>
          toggle
        </button>
        <button type="button" onClick={() => update({ panelColor: '#202020' })}>
          panel
        </button>
      </>
    );
  }
  const vars = () => JSON.parse(screen.getByTestId('vars').textContent ?? '{}') as Record<string, string>;

  it('Adaptive applies the film base, accent, ink and secondary light', () => {
    render(
      <AppearanceProvider palette={FILMS[0]!.palette}>
        <Probe />
      </AppearanceProvider>,
    );
    expect(vars()['--cs-base']).toBe('#1a1119');
    expect(vars()['--cs-film-ink']).toBe('#f6eee2');
    expect(vars()['--cs-secondary']).toBe('#a5638f');
  });

  it('Fixed ignores the film palette, and the choice is saved', () => {
    render(
      <AppearanceProvider palette={FILMS[1]!.palette}>
        <Probe />
      </AppearanceProvider>,
    );
    fireEvent.click(screen.getByText('toggle'));
    expect(vars()['--cs-base']).not.toBe('#0a1322');
    expect(vars()['--cs-film-ink']).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('cinema-skin:v1:appearance') ?? '{}').theme).toBe('fixed');
  });

  it('A custom panel colour overrides the film base', () => {
    render(
      <AppearanceProvider palette={FILMS[2]!.palette}>
        <Probe />
      </AppearanceProvider>,
    );
    fireEvent.click(screen.getByText('panel'));
    expect(vars()['--cs-base']).toBe('#202020');
  });
});

describe('Dock preferences', () => {
  function Probe() {
    const { prefs, set, applyProfile } = usePrefs();
    return (
      <>
        <span data-testid="state">{`${prefs.dockLayout}|${prefs.pauseCanvas}|${prefs.highContrast}`}</span>
        <button type="button" onClick={() => set({ dockLayout: 'expanded', pauseCanvas: false })}>
          set
        </button>
        <button type="button" onClick={() => applyProfile('high-contrast')}>
          profile
        </button>
      </>
    );
  }
  it('defaults to Floating with the Pause Canvas on', () => {
    render(
      <PrefsProvider>
        <Probe />
      </PrefsProvider>,
    );
    expect(screen.getByTestId('state').textContent).toBe('floating|true|false');
  });
  it('keeps the dock layout and Pause Canvas choice when an accessibility profile is applied', () => {
    render(
      <PrefsProvider>
        <Probe />
      </PrefsProvider>,
    );
    fireEvent.click(screen.getByText('set'));
    fireEvent.click(screen.getByText('profile'));
    expect(screen.getByTestId('state').textContent).toBe('expanded|false|true');
  });
  it('ignores an unknown stored layout', () => {
    localStorage.setItem('cinema-skin:v1:view-prefs', JSON.stringify({ dockLayout: 'sideways' }));
    render(
      <PrefsProvider>
        <Probe />
      </PrefsProvider>,
    );
    expect(screen.getByTestId('state').textContent).toBe('floating|true|false');
  });
});

describe('Film preview in the Time Portal', () => {
  const films: PortalStop[] = FILMS.map((f) => ({ id: f.id, time: 0, title: f.title, kind: 'Film', facts: `${f.genre} · ${f.year}`, badge: null }));
  it('offers Play only for films that are not already playing, and never switches by itself', () => {
    const onJump = vi.fn();
    const { rerender } = render(
      <TimePortal stops={films} index={0} onIndex={vi.fn()} currentTime={0} onJump={onJump} onClose={vi.fn()} actionLabel={(s) => (s.id === 'sintel' ? null : `Play ${s.title}`)} />,
    );
    expect(screen.queryByRole('button', { name: /^Play / })).toBeNull();
    expect(document.activeElement?.textContent).toBe('Keep watching');
    rerender(
      <TimePortal stops={films} index={1} onIndex={vi.fn()} currentTime={0} onJump={onJump} onClose={vi.fn()} actionLabel={(s) => (s.id === 'sintel' ? null : `Play ${s.title}`)} />,
    );
    expect(onJump).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Play Tears of Steel' }));
    });
    expect(onJump).toHaveBeenCalledWith(films[1]);
  });
  it('shows facts instead of a position for stops that are not in this video', () => {
    render(<TimePortal stops={films} index={2} onIndex={vi.fn()} currentTime={300} onJump={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Comedy animation · 2008/)).toBeTruthy();
    expect(screen.queryByText(/ahead of you|behind you/)).toBeNull();
  });
});
