import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, legacyBackground, parseAppearance, withBackground } from '../src/skin/appearance/AppearanceContext';

// A setting saved before background modes existed, exactly as the old defaults wrote it.
const legacy = {
  theme: 'adaptive',
  panelColor: null,
  enabled: true,
  source: 'poster',
  opacity: 55,
  blur: 28,
  color: '#1f3b57',
  customImage: null,
  accent: 'default',
  customAccent: '#ff7a59',
  contrast: 'normal',
  ambient: 35,
  panels: { header: 'glass', wheel: 'glass', controls: 'glass' },
  gradient: { preset: 'cinematic', intensity: 60, direction: 160, panelAlpha: 90, paletteMode: 'film', custom: ['#070a12', '#1a2336', '#4c6b8a', '#cad9e6'] },
};

describe('Background: the default for new viewers', () => {
  it('is the spectral gradient, with the artwork off', () => {
    expect(DEFAULT_APPEARANCE.background).toBe('spectral');
    expect(DEFAULT_APPEARANCE.enabled).toBe(false);
  });

  it('keeps a saved choice made with background modes as it is', () => {
    for (const background of ['solid', 'spectral', 'artwork', 'custom'] as const) {
      expect(parseAppearance({ ...legacy, background })?.background).toBe(background);
    }
    const art = parseAppearance({ ...legacy, background: 'artwork', enabled: false });
    expect(art).toMatchObject({ background: 'artwork', enabled: true, source: 'poster' });
    const solid = parseAppearance({ ...legacy, background: 'solid' });
    expect(solid?.enabled).toBe(false);
  });
});

describe('Background: viewers who saved settings before background modes', () => {
  it('get the spectral default if they never touched the background (only, say, the accent)', () => {
    expect(legacyBackground(legacy)).toBe('spectral');
    expect(parseAppearance({ ...legacy, accent: 'rose' })).toMatchObject({ background: 'spectral', enabled: false, accent: 'rose' });
  });

  it('keep the artwork if they tuned it or the gradients', () => {
    expect(legacyBackground({ ...legacy, opacity: 70 })).toBe('artwork');
    expect(legacyBackground({ ...legacy, blur: 12 })).toBe('artwork');
    expect(legacyBackground({ ...legacy, gradient: { ...legacy.gradient, preset: 'vivid', intensity: 85 } })).toBe('artwork');
    expect(parseAppearance({ ...legacy, opacity: 70 })).toMatchObject({ background: 'artwork', enabled: true, source: 'poster', opacity: 70 });
  });

  it('keep plain surfaces with gradients if they had switched the artwork off', () => {
    expect(parseAppearance({ ...legacy, enabled: false })).toMatchObject({ background: 'spectral', enabled: false });
  });

  it('keep their own colour or image as Custom', () => {
    expect(parseAppearance({ ...legacy, source: 'color', color: '#4a2b3f' })).toMatchObject({ background: 'custom', enabled: true, source: 'color', color: '#4a2b3f' });
    const img = 'data:image/jpeg;base64,AAAA';
    expect(parseAppearance({ ...legacy, source: 'custom', customImage: img })).toMatchObject({ background: 'custom', enabled: true, source: 'custom', customImage: img });
  });
});

describe('Background: switching modes', () => {
  it('turns the image layer on only for Artwork and Custom', () => {
    const base = { ...DEFAULT_APPEARANCE };
    expect(withBackground({ ...base, background: 'spectral' }).enabled).toBe(false);
    expect(withBackground({ ...base, background: 'artwork' })).toMatchObject({ enabled: true, source: 'poster' });
    expect(withBackground({ ...base, background: 'custom' })).toMatchObject({ enabled: true, source: 'color' });
    expect(withBackground({ ...base, background: 'custom', customImage: 'data:image/png;base64,AA' })).toMatchObject({ source: 'custom' });
    // Choosing "Image" before uploading one stays on Image (the film colour shows until there is one).
    expect(withBackground({ ...base, background: 'custom', source: 'custom' }).source).toBe('custom');
  });
});
