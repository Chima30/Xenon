import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FILMS } from '../src/data/catalog';
import { parseMoments } from '../src/data/stores';
import { AppearanceProvider, useAppearance, type SkinPalette } from '../src/skin/appearance/AppearanceContext';
import { contrastRatio, inkOn, parseHex, safeAccent, SURFACE } from '../src/skin/appearance/color';
import { tierForWidth } from '../src/skin/hooks';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function Vars() {
  const { cssVars } = useAppearance();
  return <pre data-testid="vars">{JSON.stringify(cssVars)}</pre>;
}
const readVars = (palette?: SkinPalette | null) => {
  const { getByTestId } = render(
    <AppearanceProvider palette={palette}>
      <Vars />
    </AppearanceProvider>,
  );
  return JSON.parse(getByTestId('vars').textContent ?? '{}') as Record<string, string>;
};

describe('Adaptive movie atmosphere', () => {
  it('every bundled film has its own, readable signature', () => {
    const accents = new Set(FILMS.map((f) => f.palette.accent));
    expect(accents.size).toBe(FILMS.length);
    for (const f of FILMS) {
      const accent = parseHex(f.palette.accent)!;
      const base = parseHex(f.palette.base)!;
      expect(contrastRatio(accent, base)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(accent, inkOn(accent))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('switching films re-colours the accent, base and glow', () => {
    const sintel = readVars(FILMS[0]!.palette);
    cleanup();
    const tears = readVars(FILMS[1]!.palette);
    expect(sintel['--cs-base']).toBe(FILMS[0]!.palette.base);
    expect(tears['--cs-base']).toBe(FILMS[1]!.palette.base);
    expect(sintel['--cs-citron']).not.toBe(tears['--cs-citron']);
    expect(sintel['--cs-glow']).not.toBe(tears['--cs-glow']);
  });

  it('writes no colour inline without a film palette, so host --media-* variables win', () => {
    const vars = readVars(null);
    expect(vars['--cs-citron']).toBeUndefined();
    expect(vars['--cs-base']).toBeUndefined();
  });

  it("a viewer's saved accent choice still overrides the film palette", () => {
    localStorage.setItem('cinema-skin:v1:appearance', JSON.stringify({ enabled: true, accent: 'lavender' }));
    const vars = readVars(FILMS[0]!.palette);
    expect(vars['--cs-citron']).toBe('#ada0f8');
  });

  it('never lets an accent fall below 4.5:1 on panels', () => {
    for (const hex of ['#000000', '#1a1a1a', '#333366', '#ff0000', '#ffffff']) {
      const a = safeAccent(parseHex(hex)!);
      expect(contrastRatio(a.color, SURFACE)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Saved moments storage', () => {
  it('accepts moments saved before notes existed and new ones with notes', () => {
    const old = { id: 'a', videoId: 'sintel', time: 10, label: 'x', createdAt: 1 };
    const withNote = { ...old, id: 'b', note: 'hello' };
    expect(parseMoments([old, withNote])).toHaveLength(2);
  });
  it('drops malformed entries instead of failing', () => {
    const bad = { id: 'c', videoId: 'sintel', time: 10, label: 'x', createdAt: 1, note: 5 };
    expect(parseMoments([bad, { id: 1 }])).toHaveLength(0);
  });
});

describe('Layout tiers', () => {
  it('follows the player width, not the window', () => {
    expect(tierForWidth(1200)).toBe('full');
    expect(tierForWidth(600)).toBe('compact');
    expect(tierForWidth(390)).toBe('tiny');
    expect(tierForWidth(300)).toBe('micro');
  });
});
