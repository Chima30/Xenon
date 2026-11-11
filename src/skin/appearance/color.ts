export type RGB = [number, number, number];

/* ---------- WCAG contrast ---------- */

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const luminance = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- Conversions ---------- */

export function parseHex(text: string): RGB | null {
  const m = text.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m || !m[1]) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export const toHex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/* ---------- Safe colour derivation ---------- */

/** Surface that accent colours must read against (the skin's glass panel colour). */
export const SURFACE: RGB = [21, 27, 44];
export const DEFAULT_ACCENT: RGB = [216, 255, 87];
const INK_DARK: RGB = [10, 14, 23];
const INK_LIGHT: RGB = [255, 255, 255];

/** Text colour for content placed ON an accent-coloured button: whichever reads better. */
export function inkOn(accent: RGB): RGB {
  return contrastRatio(accent, INK_DARK) >= contrastRatio(accent, INK_LIGHT) ? INK_DARK : INK_LIGHT;
}

export interface SafeAccent {
  color: RGB;
  /** True when the requested colour was changed to reach the contrast minimum. */
  adjusted: boolean;
  /** True when no adjustment could reach the minimum and the default was used. */
  fellBack: boolean;
  ratio: number;
}

/**
 * Makes `wanted` usable as an accent: it must reach `min` contrast against the panel surface (for focus rings, text
 * links and selected states) AND leave readable ink on top of it. Lightens it step by step; falls back to the default.
 */
export function safeAccent(wanted: RGB, min = 4.5): SafeAccent {
  const ok = (c: RGB) => contrastRatio(c, SURFACE) >= min && contrastRatio(c, inkOn(c)) >= min;
  if (ok(wanted)) return { color: wanted, adjusted: false, fellBack: false, ratio: contrastRatio(wanted, SURFACE) };
  const [h, s, l] = rgbToHsl(wanted);
  for (let step = 1; step <= 20; step++) {
    const candidate = hslToRgb(h, s, Math.min(0.9, l + step * 0.03)).map(Math.round) as RGB;
    if (ok(candidate)) return { color: candidate, adjusted: true, fellBack: false, ratio: contrastRatio(candidate, SURFACE) };
  }
  return { color: DEFAULT_ACCENT, adjusted: false, fellBack: true, ratio: contrastRatio(DEFAULT_ACCENT, SURFACE) };
}

/* ---------- Poster palette ---------- */

export interface Palette {
  /** Dark, low-saturation colour for surfaces behind text. Always dark enough for light text. */
  tint: RGB;
  /** Raw dominant hue colour from the artwork. */
  dominant: RGB;
  /** Plain average colour of the artwork, used to size the readability scrim. */
  average: RGB;
  /** Contrast-safe accent derived from the artwork. */
  accent: SafeAccent;
  /** Average brightness 0 to 1, to tell bright artwork from dark artwork. */
  brightness: number;
  /** Why the accent is what it is, in plain words. */
  note: string;
}

/**
 * Reads colours from artwork pixels. The result is only ever used through safeAccent() and a darkened tint,
 * so a washed-out or neon poster can never make the interface unreadable.
 */
export function paletteFromPixels(data: Uint8ClampedArray): Palette {
  let sumR = 0, sumG = 0, sumB = 0, n = 0;
  let wR = 0, wG = 0, wB = 0, wSum = 0;
  let bright = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 255;
    if (a < 128) continue;
    const px: RGB = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
    sumR += px[0]; sumG += px[1]; sumB += px[2]; n++;
    const [, s, l] = rgbToHsl(px);
    bright += l;
    // Favour saturated, mid-lightness pixels: they carry the poster's character.
    const w = s * (1 - Math.abs(2 * l - 1));
    if (s > 0.2 && l > 0.15 && l < 0.85) {
      wR += px[0] * w; wG += px[1] * w; wB += px[2] * w; wSum += w;
    }
  }
  if (n === 0) return fallbackPalette('The artwork has no readable pixels.');
  const avg: RGB = [sumR / n, sumG / n, sumB / n];
  const brightness = bright / n;
  if (wSum < 0.5) {
    const [h] = rgbToHsl(avg);
    return {
      tint: hslToRgb(h, 0.15, 0.09).map(Math.round) as RGB,
      dominant: avg.map(Math.round) as RGB,
      average: avg.map(Math.round) as RGB,
      accent: { color: DEFAULT_ACCENT, adjusted: false, fellBack: true, ratio: contrastRatio(DEFAULT_ACCENT, SURFACE) },
      brightness,
      note: 'The artwork is nearly grey, so the default accent is used.',
    };
  }
  const dominant: RGB = [wR / wSum, wG / wSum, wB / wSum];
  const [h, s] = rgbToHsl(dominant);
  const wanted = hslToRgb(h, Math.min(0.95, Math.max(0.55, s)), 0.62).map(Math.round) as RGB;
  const accent = safeAccent(wanted);
  return {
    tint: hslToRgb(h, Math.min(s, 0.45), 0.1).map(Math.round) as RGB,
    dominant: dominant.map(Math.round) as RGB,
    average: avg.map(Math.round) as RGB,
    accent,
    brightness,
    note: accent.fellBack
      ? 'The poster colour could not reach 4.5:1 contrast, so the default accent is used.'
      : accent.adjusted
        ? 'The poster colour was lightened to reach 4.5:1 contrast.'
        : 'The poster colour already meets 4.5:1 contrast.',
  };
}

export function fallbackPalette(note: string): Palette {
  return {
    tint: [10, 14, 23],
    dominant: [10, 14, 23],
    average: [10, 14, 23],
    accent: { color: DEFAULT_ACCENT, adjusted: false, fellBack: true, ratio: contrastRatio(DEFAULT_ACCENT, SURFACE) },
    brightness: 0.1,
    note,
  };
}

/**
 * Loads an image with CORS and samples a 32x32 copy. Rejects when the host forbids pixel access;
 * callers then use fallbackPalette().
 */
export function extractPalette(src: string): Promise<Palette> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('no canvas');
        ctx.drawImage(img, 0, 0, 32, 32);
        resolve(paletteFromPixels(ctx.getImageData(0, 0, 32, 32).data));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

/**
 * Size the readability scrim. Worst case for text is a flat area of the background, modelled as
 * tint (root) + art at `opacity`, then a tint-coloured scrim of alpha `a` on top. Finds the smallest `a`
 * that gives `target` contrast against `text`, and returns the contrast actually achieved.
 */
export function solveScrim(tint: RGB, art: RGB, opacity: number, text: RGB, target: number): { alpha: number; ratio: number } {
  const lerp = (x: RGB, y: RGB, t: number): RGB => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  const compose = (a: number) => lerp(lerp(tint, art, opacity), tint, a);
  let lo = 0.15;
  let hi = 0.97;
  if (contrastRatio(compose(lo), text) >= target) return { alpha: lo, ratio: contrastRatio(compose(lo), text) };
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(compose(mid), text) >= target) hi = mid;
    else lo = mid;
  }
  return { alpha: hi, ratio: contrastRatio(compose(hi), text) };
}
