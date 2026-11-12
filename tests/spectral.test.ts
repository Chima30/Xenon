import { describe, expect, it } from 'vitest';
import { FILMS } from '../src/data/catalog';
import { GRADIENT_PRESETS, spectrumFor, XENON_SPECTRUM } from '../src/skin/appearance/AppearanceContext';

type RGB = [number, number, number];
const rgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const over = (top: RGB, alpha: number, under: RGB): RGB => top.map((v, i) => v * alpha + under[i]! * (1 - alpha)) as RGB;
const lum = (c: RGB) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe('Spectral gradients', () => {
  it('gives each film the curated four-stop spectrum, deep to light', () => {
    const by = Object.fromEntries(FILMS.map((f) => [f.id, f.palette.spectrum]));
    expect(by['big-buck-bunny']).toEqual(['#071c17', '#204a37', '#a47835', '#e2d78a']);
    expect(by.sintel).toEqual(['#120d1d', '#463057', '#bf5b3f', '#f4b06b']);
    expect(by['tears-of-steel']).toEqual(['#071420', '#19445c', '#36a4bc', '#c5e6ef']);
    for (const f of FILMS) {
      const l = f.palette.spectrum.map((c) => lum(rgb(c)));
      expect(l[0]!).toBeLessThan(l[1]!);
      expect(l[1]!).toBeLessThan(l[3]!);
    }
  });

  it('falls back to XENON’s spectrum, and derives one for a palette without its own', () => {
    expect(spectrumFor(null)).toEqual(XENON_SPECTRUM);
    const s = spectrumFor({ accent: '#ff7a59', base: '#101418', secondary: '#7a8fa6', ink: '#f2f4f7' });
    expect(s).toHaveLength(4);
    expect(lum(rgb(s[0]))).toBeLessThan(lum(rgb(s[3])));
  });

  it('keeps film text at 4.5:1 or better on the strongest preset, even with a white frame behind a panel', () => {
    const v = GRADIENT_PRESETS.vivid;
    for (const f of FILMS) {
      const [, mid, light] = f.palette.spectrum.map(rgb) as [RGB, RGB, RGB, RGB];
      // Panel: the film base at the preset's opacity over a fully white frame (the worst case behind glass)...
      let c = over(rgb(f.palette.base), v.panelAlpha / 100, [255, 255, 255]);
      // ...then the glaze as the CSS layers it: the mid stop at intensity × 52%, the light bloom at ambient × 24%.
      c = over(mid, (v.intensity / 100) * 0.52, c);
      c = over(light, (v.ambient / 100) * 0.24, c);
      expect(contrast(rgb(f.palette.ink), c)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
