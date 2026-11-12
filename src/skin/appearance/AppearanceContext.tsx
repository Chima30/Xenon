import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { clamp } from '../format';
import { isRecord, readJSON, writeJSON } from '../storage';
import {
  DEFAULT_ACCENT,
  extractPalette,
  fallbackPalette,
  inkOn,
  parseHex,
  safeAccent,
  solveScrim,
  toHex,
  hslToRgb,
  rgbToHsl,
  type Palette,
  type RGB,
  type SafeAccent,
} from './color';

export type BgSource = 'poster' | 'color' | 'custom';
/**
 * What fills the space around the video. Solid (the default) is one clean colour from the film's palette, with no
 * image or gradient layers; Spectral is the film's gradient system; Artwork is the film's licensed still, blurred and
 * tinted; Custom is the viewer's own image or colour.
 */
export type BackgroundMode = 'solid' | 'spectral' | 'artwork' | 'custom';
export const BACKGROUND_MODES: readonly BackgroundMode[] = ['solid', 'spectral', 'artwork', 'custom'];
export type PanelStyle = 'glass' | 'solid' | 'clear';
export type AccentChoice = 'default' | 'citron' | 'poster' | 'lavender' | 'teal' | 'rose' | 'custom';

/**
 * A film's signature colours, supplied by the host. The skin re-colours every surface, control and highlight from
 * these two values, so each film feels distinct even before (or without) any artwork being read.
 */
export interface SkinPalette {
  /** Accent for selection, progress and focus. Passed through the contrast guard before use. */
  accent: string;
  /** Dark base colour that panels, the dock and the rail are mixed from. */
  base: string;
  /** Ambient light colour behind the interface. Defaults to the accent. */
  glow?: string;
  /** Text colour for this film's surfaces (ivory, silver, cream...). Must stay light. */
  ink?: string;
  /** A second, quieter highlight used for metallic detailing and ambient light. */
  secondary?: string;
  /**
   * The film's spectral identity, four stops from deep to light (e.g. deep forest, moss, bronze gold, sunlight).
   * Every gradient in the skin is built from these; the accent above stays the contrast-checked control colour.
   */
  spectrum?: Spectrum;
}

/** Four colours from deep to light that every XENON gradient is built from. */
export type Spectrum = readonly [string, string, string, string];
/** XENON's own spectrum, used in the Fixed theme and for videos without a palette. */
export const XENON_SPECTRUM: Spectrum = ['#070a12', '#1a2336', '#4c6b8a', '#cad9e6'];

export type GradientPreset = 'subtle' | 'cinematic' | 'vivid' | 'custom';
export interface GradientSettings {
  preset: GradientPreset;
  /** How strongly surfaces take the spectrum, 0 to 100. */
  intensity: number;
  /** Direction of the linear layers, in degrees. */
  direction: number;
  /** Panel opacity, 40 to 100 (100 is opaque). */
  panelAlpha: number;
  /** Follow each film's spectrum, or keep one custom spectrum for every film. */
  paletteMode: 'film' | 'custom';
  custom: [string, string, string, string];
}
/** Curated starting points. Ambient colour and background blur are the existing Appearance settings. */
export const GRADIENT_PRESETS: Record<Exclude<GradientPreset, 'custom'>, { intensity: number; ambient: number; panelAlpha: number; blur: number }> = {
  subtle: { intensity: 35, ambient: 20, panelAlpha: 94, blur: 32 },
  cinematic: { intensity: 60, ambient: 35, panelAlpha: 90, blur: 28 },
  vivid: { intensity: 85, ambient: 60, panelAlpha: 80, blur: 22 },
};

/** The colours the skin actually settled on, so a host page can match its surroundings to the player. */
export interface ResolvedAtmosphere {
  base: string;
  accent: string;
  ink: string;
  glow: string;
  secondary: string;
  /** Artwork shown behind the player, when the viewer has it on. */
  image: string | null;
  /** The spectrum in use, deep to light, and the direction of its linear layers. */
  spectrum: Spectrum;
  angle: number;
  /** Ambient colour strength, 0 to 1. */
  ambient: number;
  /** The background mode in use, so a host page can match it (a solid page for Solid, its gradient for Spectral). */
  background: BackgroundMode;
}
export type PanelArea = 'header' | 'wheel' | 'controls';

export interface Appearance {
  /** Adaptive follows each film's signature palette; Fixed keeps one look for every film. */
  theme: 'adaptive' | 'fixed';
  /** The background mode. `enabled` and `source` below follow from it (see withBackground). */
  background: BackgroundMode;
  /** Panel background colour chosen by the viewer, or null to use the film's (or XENON's) base. */
  panelColor: string | null;
  /** Image/colour layer switch, derived from `background`: on for Artwork and Custom. */
  enabled: boolean;
  source: BgSource;
  /** Artwork visibility, 0 to 100. */
  opacity: number;
  /** Artwork blur in px, 0 to 60. */
  blur: number;
  color: string;
  customImage: string | null;
  accent: AccentChoice;
  customAccent: string;
  contrast: 'normal' | 'high';
  /** Ambient glow strength, 0 to 100. */
  ambient: number;
  panels: Record<PanelArea, PanelStyle>;
  gradient: GradientSettings;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'adaptive',
  background: 'solid',
  panelColor: null,
  enabled: false,
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
  gradient: { preset: 'cinematic', intensity: 60, direction: 160, panelAlpha: 90, paletteMode: 'film', custom: [...XENON_SPECTRUM] },
};

export const NAMED_ACCENTS: Record<'lavender' | 'teal' | 'rose', string> = {
  lavender: '#ada0f8',
  teal: '#8dd3cf',
  rose: '#f59ac0',
};

export interface Preset {
  id: string;
  name: string;
  /** Everything except the custom image, which is too large to duplicate per preset. */
  appearance: Omit<Appearance, 'customImage'>;
}

/* ---------- validation ---------- */

const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => allowed.find((a) => a === v) ?? d;
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const hex = (v: unknown, d: string) => (typeof v === 'string' && parseHex(v) ? (v.startsWith('#') ? v : `#${v}`) : d);

/**
 * Keeps the artwork switch and source in step with the background mode: Artwork shows the film's still, Custom
 * shows the viewer's image (or colour, until there is an image), Solid and Spectral show no image at all.
 */
export function withBackground(a: Appearance): Appearance {
  switch (a.background) {
    case 'artwork':
      return { ...a, enabled: true, source: 'poster' };
    case 'custom':
      // Keep the viewer's own pick (colour or image); coming from Artwork, use their image if they have one.
      return { ...a, enabled: true, source: a.source === 'poster' ? (a.customImage ? 'custom' : 'color') : a.source };
    default:
      return { ...a, enabled: false };
  }
}

/** How Appearance looked before background modes existed: artwork on, Cinematic gradients. */
const LEGACY_DEFAULTS = { opacity: 55, blur: 28, ambient: 35, intensity: 60, direction: 160, panelAlpha: 90 };

/**
 * The background a saved setting from before background modes stands for. Someone who never touched the
 * background controls gets the new Solid default; anyone who did keeps the look they chose.
 */
export function legacyBackground(v: Record<string, unknown>): BackgroundMode {
  const enabled = v.enabled === true;
  if (!enabled) return 'spectral'; // they switched the artwork off: plain surfaces with the film's gradients
  if (v.source === 'custom' || v.source === 'color') return 'custom';
  const g = isRecord(v.gradient) ? v.gradient : {};
  const chose =
    (typeof v.opacity === 'number' && v.opacity !== LEGACY_DEFAULTS.opacity) ||
    (typeof v.blur === 'number' && v.blur !== LEGACY_DEFAULTS.blur) ||
    (typeof v.ambient === 'number' && v.ambient !== LEGACY_DEFAULTS.ambient) ||
    (typeof g.preset === 'string' && g.preset !== 'cinematic') ||
    (typeof g.intensity === 'number' && g.intensity !== LEGACY_DEFAULTS.intensity) ||
    (typeof g.direction === 'number' && g.direction !== LEGACY_DEFAULTS.direction) ||
    (typeof g.panelAlpha === 'number' && g.panelAlpha !== LEGACY_DEFAULTS.panelAlpha) ||
    g.paletteMode === 'custom';
  return chose ? 'artwork' : 'solid';
}

export function parseAppearance(v: unknown): Appearance | null {
  if (!isRecord(v)) return null;
  const d = DEFAULT_APPEARANCE;
  const panels = isRecord(v.panels) ? v.panels : {};
  const styles = ['glass', 'solid', 'clear'] as const;
  const background = BACKGROUND_MODES.find((m) => m === v.background) ?? legacyBackground(v);
  return withBackground({
    theme: pick(v.theme, ['adaptive', 'fixed'] as const, d.theme),
    background,
    panelColor: typeof v.panelColor === 'string' && parseHex(v.panelColor) ? hex(v.panelColor, '#0a0e17') : null,
    enabled: v.enabled === true,
    source: pick(v.source, ['poster', 'color', 'custom'] as const, d.source),
    opacity: num(v.opacity, 0, 100, d.opacity),
    blur: num(v.blur, 0, 60, d.blur),
    color: hex(v.color, d.color),
    customImage: typeof v.customImage === 'string' && v.customImage.startsWith('data:image/') ? v.customImage : null,
    accent: pick(v.accent, ['default', 'citron', 'poster', 'lavender', 'teal', 'rose', 'custom'] as const, d.accent),
    customAccent: hex(v.customAccent, d.customAccent),
    contrast: pick(v.contrast, ['normal', 'high'] as const, d.contrast),
    ambient: num(v.ambient, 0, 100, d.ambient),
    panels: {
      header: pick(panels.header, styles, d.panels.header),
      wheel: pick(panels.wheel, styles, d.panels.wheel),
      controls: pick(panels.controls, styles, d.panels.controls),
    },
    gradient: parseGradient(v.gradient),
  });
}

function parseGradient(v: unknown): GradientSettings {
  const d = DEFAULT_APPEARANCE.gradient;
  if (!isRecord(v)) return { ...d, custom: [...d.custom] };
  const c = Array.isArray(v.custom) ? v.custom : [];
  return {
    preset: pick(v.preset, ['subtle', 'cinematic', 'vivid', 'custom'] as const, d.preset),
    intensity: num(v.intensity, 0, 100, d.intensity),
    direction: num(v.direction, 0, 360, d.direction),
    panelAlpha: num(v.panelAlpha, 40, 100, d.panelAlpha),
    paletteMode: pick(v.paletteMode, ['film', 'custom'] as const, d.paletteMode),
    custom: [0, 1, 2, 3].map((i) => hex(c[i], d.custom[i]!)) as [string, string, string, string],
  };
}

/** A spectrum for a palette that has none: deepened base, base towards its secondary, its glow, its ink. */
export function spectrumFor(p: SkinPalette | null): Spectrum {
  if (!p) return XENON_SPECTRUM;
  if (p.spectrum) return p.spectrum;
  const b = parseHex(p.base) ?? [10, 14, 23];
  const s = parseHex(p.secondary ?? p.accent) ?? b;
  const g = parseHex(p.glow ?? p.accent) ?? s;
  const ink = parseHex(p.ink ?? '#e7eef6') ?? [231, 238, 246];
  const mixc = (x: RGB, y: RGB, t: number) => x.map((v, i) => Math.round(v + ((y[i] ?? v) - v) * t)) as RGB;
  return [toHex(mixc(b, [0, 0, 0], 0.35)), toHex(mixc(b, s, 0.35)), toHex(mixc(g, b, 0.25)), toHex(mixc(ink, g, 0.15))];
}

function parsePresets(v: unknown): Preset[] | null {
  if (!Array.isArray(v)) return null;
  const out: Preset[] = [];
  for (const p of v) {
    if (!isRecord(p) || typeof p.id !== 'string' || typeof p.name !== 'string') continue;
    const a = parseAppearance(p.appearance);
    if (!a) continue;
    const { customImage: _drop, ...rest } = a;
    void _drop;
    out.push({ id: p.id, name: p.name.slice(0, 30), appearance: rest });
  }
  return out;
}

/* ---------- derived state ---------- */

export interface Derived {
  /** True when the artwork atmosphere is on. */
  active: boolean;
  /** True when the host supplied a signature palette for this film. */
  hasFilmPalette: boolean;
  imageUrl: string | null;
  palette: Palette | null;
  paletteStatus: 'idle' | 'loading' | 'ready' | 'unavailable';
  accent: SafeAccent;
  /** Contrast of body text against the worst-case flat background after the scrim. */
  textRatio: number;
  scrimAlpha: number;
  note: string;
}

interface AppearanceApi {
  appearance: Appearance;
  update: (patch: Partial<Appearance>) => void;
  updatePanel: (area: PanelArea, style: PanelStyle) => void;
  reset: () => void;
  presets: Preset[];
  savePreset: (name: string) => string | null;
  applyPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  setCustomImageFromFile: (file: File) => Promise<string | null>;
  derived: Derived;
  cssVars: CSSProperties;
  artworkLabel?: string;
  wheelCollapsed: boolean;
  setWheelCollapsed: (v: boolean) => void;
  /** False when the browser refused to save (private mode, quota). */
  persisted: boolean;
  /** The film palette in effect (null in Fixed theme or when the host supplied none). */
  filmPalette: SkinPalette | null;
  resolved: ResolvedAtmosphere;
}

const Ctx = createContext<AppearanceApi | null>(null);

export function useAppearance(): AppearanceApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAppearance must be used inside <CinemaSkin>');
  return c;
}

const MAX_PRESETS = 12;

/** Downscales a user image to 1280px wide JPEG so it fits comfortably in localStorage. */
async function fileToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('not an image'));
      i.src = url;
    });
    const scale = Math.min(1, 1280 / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AppearanceProvider({
  artwork,
  artworkLabel,
  palette: filmPalette,
  children,
}: {
  artwork?: string | null;
  artworkLabel?: string;
  palette?: SkinPalette | null;
  children: ReactNode;
}) {
  const [appearance, setAppearance] = useState<Appearance>(() => readJSON('appearance', parseAppearance, DEFAULT_APPEARANCE));
  const [presets, setPresets] = useState<Preset[]>(() => readJSON('appearance-presets', parsePresets, []));
  const [wheelCollapsed, setWheelCollapsedState] = useState(() => readJSON('wheel-collapsed', (v) => v === true, false));
  const [persisted, setPersisted] = useState(true);

  const [palettes, setPalettes] = useState<Record<string, Palette | 'unavailable'>>({});

  const imageUrl = !appearance.enabled
    ? null
    : appearance.source === 'poster'
      ? (artwork ?? null)
      : appearance.source === 'custom'
        ? appearance.customImage
        : null;

  // Extract colours once per image. Failure (CORS, 404, rate limit) is remembered and falls back safely.
  useEffect(() => {
    if (!imageUrl || palettes[imageUrl] !== undefined) return;
    let cancelled = false;
    extractPalette(imageUrl).then(
      (p) => !cancelled && setPalettes((m) => ({ ...m, [imageUrl]: p })),
      () => !cancelled && setPalettes((m) => ({ ...m, [imageUrl]: 'unavailable' })),
    );
    return () => {
      cancelled = true;
    };
  }, [imageUrl, palettes]);

  const save = useCallback((a: Appearance) => {
    setPersisted(writeJSON('appearance', a));
  }, []);

  const update = useCallback(
    (patch: Partial<Appearance>) => {
      setAppearance((prev) => {
        const next = withBackground({ ...prev, ...patch });
        save(next);
        return next;
      });
    },
    [save],
  );
  const updatePanel = useCallback(
    (area: PanelArea, style: PanelStyle) => {
      setAppearance((prev) => {
        const next = { ...prev, panels: { ...prev.panels, [area]: style } };
        save(next);
        return next;
      });
    },
    [save],
  );
  const reset = useCallback(() => {
    setAppearance(DEFAULT_APPEARANCE);
    save(DEFAULT_APPEARANCE);
  }, [save]);

  const savePreset = useCallback(
    (name: string) => {
      const clean = name.trim().slice(0, 30);
      if (!clean) return 'Give the preset a name.';
      if (presets.length >= MAX_PRESETS) return `You can keep up to ${MAX_PRESETS} presets. Delete one first.`;
      const { customImage: _drop, ...rest } = appearance;
      void _drop;
      const next = [...presets, { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: clean, appearance: rest }];
      setPresets(next);
      if (!writeJSON('appearance-presets', next)) return 'Saved for this session only: the browser would not store it.';
      return null;
    },
    [appearance, presets],
  );
  const applyPreset = useCallback(
    (id: string) => {
      const p = presets.find((x) => x.id === id);
      if (!p) return;
      setAppearance((prev) => {
        // Keep the current custom image; a preset that wants "custom" without one falls back to the poster.
        const next = withBackground({ ...p.appearance, customImage: prev.customImage });
        save(next);
        return next;
      });
    },
    [presets, save],
  );
  const deletePreset = useCallback(
    (id: string) => {
      const next = presets.filter((p) => p.id !== id);
      setPresets(next);
      writeJSON('appearance-presets', next);
    },
    [presets],
  );

  const setCustomImageFromFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return 'Choose an image file.';
      try {
        const dataUrl = await fileToDataUrl(file);
        update({ customImage: dataUrl, source: 'custom', background: 'custom' });
        return null;
      } catch {
        return 'That file could not be read as an image.';
      }
    },
    [update],
  );

  const setWheelCollapsed = useCallback((v: boolean) => {
    setWheelCollapsedState(v);
    writeJSON('wheel-collapsed', v);
  }, []);

  const activeFilm: SkinPalette | null = appearance.theme === 'adaptive' ? (filmPalette ?? null) : null;

  /* ---- derive colours ---- */
  const derived = useMemo<Derived>(() => {
    const a = appearance;
    const ink: RGB = a.contrast === 'high' ? [255, 255, 255] : [244, 246, 242];
    const target = a.contrast === 'high' ? 7 : 4.5;

    const entry = imageUrl ? palettes[imageUrl] : undefined;
    const palette: Palette | null =
      a.source === 'color'
        ? paletteFromColor(a.color)
        : imageUrl
          ? entry && entry !== 'unavailable'
            ? entry
            : entry === 'unavailable'
              ? fallbackPalette('Pixel colours could not be read from this image (the host blocks it), so a safe default palette is used.')
              : null
          : a.source === 'custom'
            ? fallbackPalette('No custom image chosen yet.')
            : fallbackPalette('This film has no artwork available.');
    const status: Derived['paletteStatus'] =
      !a.enabled ? 'idle' : a.source === 'color' ? 'ready' : imageUrl ? (entry === undefined ? 'loading' : entry === 'unavailable' ? 'unavailable' : 'ready') : 'unavailable';

    const base = palette ?? fallbackPalette('');
    const filmAccent = activeFilm ? parseHex(activeFilm.accent) : null;
    // Accent: every choice passes through safeAccent, so nothing can fall below 4.5:1.
    let accent: SafeAccent;
    if (a.accent === 'poster') accent = palette && !palette.accent.fellBack ? palette.accent : safeAccent(filmAccent ?? DEFAULT_ACCENT);
    else if (a.accent === 'default') accent = safeAccent(filmAccent ?? DEFAULT_ACCENT);
    else if (a.accent === 'citron') accent = safeAccent(DEFAULT_ACCENT);
    else if (a.accent === 'custom') accent = safeAccent(parseHex(a.customAccent) ?? DEFAULT_ACCENT);
    else accent = safeAccent(parseHex(NAMED_ACCENTS[a.accent]) ?? DEFAULT_ACCENT);

    const filmBase = a.panelColor ? parseHex(a.panelColor) : a.source !== 'color' && activeFilm ? parseHex(activeFilm.base) : null;
    const solved = solveScrim(filmBase ?? base.tint, base.average, a.opacity / 100, ink, target);
    return {
      active: a.enabled,
      hasFilmPalette: Boolean(activeFilm),
      imageUrl,
      palette,
      paletteStatus: status,
      accent,
      textRatio: solved.ratio,
      scrimAlpha: solved.alpha,
      note: base.note,
    };
  }, [appearance, imageUrl, palettes, activeFilm]);

  /* ---- CSS custom properties ----
     Only what is actually known is written inline. With no film palette and the default accent nothing is set
     here, so a host page can theme the player with --media-accent-color and --xenon-surface-color. */
  const cssVars = useMemo<CSSProperties>(() => {
    const a = appearance;
    const vars: Record<string, string | number> = {};
    const film = activeFilm;
    const extracted = derived.palette;

    // Base colour: solid-colour source > film signature > colours read from the artwork.
    const filmBase = film ? parseHex(film.base) : null;
    const baseColor: RGB | null = a.panelColor
      ? parseHex(a.panelColor)
      : a.enabled && a.source === 'color' && extracted
        ? extracted.tint
        : (filmBase ?? (a.enabled && extracted && derived.paletteStatus === 'ready' ? extracted.tint : null));
    if (baseColor) vars['--cs-base'] = toHex(baseColor);

    // Accent: written only when it is a deliberate choice (a film signature or a viewer setting).
    if (a.accent !== 'default' || film) {
      vars['--cs-citron'] = toHex(derived.accent.color);
      vars['--cs-ink-on-citron'] = toHex(inkOn(derived.accent.color));
    }

    const filmGlow = film ? parseHex(film.glow ?? film.accent) : null;
    if (filmGlow) vars['--cs-glow'] = toHex(filmGlow);
    else if (a.enabled && extracted && derived.paletteStatus === 'ready') {
      const [h] = rgbToHsl(extracted.dominant);
      vars['--cs-glow'] = toHex(hslToRgb(h, 0.75, 0.5));
    }

    // Film ink and secondary feed tokens.css, so high-contrast mode can still force pure white text.
    const filmInk = film?.ink ? parseHex(film.ink) : null;
    if (filmInk) vars['--cs-film-ink'] = toHex(filmInk);
    const filmSecondary = film?.secondary ? parseHex(film.secondary) : null;
    if (filmSecondary) vars['--cs-secondary'] = toHex(filmSecondary);

    // Spectral gradients: four stops and three dials. They apply with or without the artwork layer.
    const sp = spectrumIn(a, film);
    sp.forEach((c, i) => {
      vars[`--sg-${i + 1}`] = c;
    });
    vars['--sg-k'] = a.gradient.intensity / 100;
    vars['--sg-amb'] = a.ambient / 100;
    vars['--sg-angle'] = `${a.gradient.direction}deg`;
    // Written only when moved, so a host's --xenon-panel-opacity keeps working by default.
    if (a.gradient.panelAlpha !== DEFAULT_APPEARANCE.gradient.panelAlpha) vars['--cs-panel-alpha'] = a.gradient.panelAlpha / 100;

    if (a.contrast === 'high') {
      vars['--cs-ice'] = '#ffffff';
      vars['--cs-ice-dim'] = '#e6eaf2';
    }
    if (!derived.active) return vars as CSSProperties;

    const alpha = (s: PanelStyle) => (s === 'solid' ? 1 : s === 'glass' ? (a.contrast === 'high' ? 0.9 : 0.62) : a.contrast === 'high' ? 0.6 : 0.16);
    const blur = (s: PanelStyle) => (s === 'glass' ? '18px' : '0px');
    const surf = (s: PanelStyle) => `color-mix(in srgb, var(--cs-base) ${Math.round(alpha(s) * 100)}%, transparent)`;
    Object.assign(vars, {
      '--cs-atm-opacity': a.opacity / 100,
      '--cs-atm-blur': `${a.blur}px`,
      '--cs-atm-scrim': derived.scrimAlpha,
      '--cs-atm-glow-a': (a.ambient / 100) * 0.55,
      '--cs-surf-header': surf(a.panels.header),
      '--cs-surf-wheel': surf(a.panels.wheel),
      '--cs-surf-controls': surf(a.panels.controls),
      '--cs-blur-header': blur(a.panels.header),
      '--cs-blur-wheel': blur(a.panels.wheel),
      '--cs-blur-controls': blur(a.panels.controls),
    });
    if (a.source === 'color') vars['--cs-atm-color'] = toHex(parseHex(a.color) ?? [31, 59, 87]);
    if (derived.imageUrl) vars['--cs-atm-image'] = `url("${derived.imageUrl.replace(/"/g, '%22')}")`;
    return vars as CSSProperties;
  }, [appearance, derived, activeFilm]);

  const resolved = useMemo<ResolvedAtmosphere>(() => {
    const v = cssVars as Record<string, string | undefined>;
    return {
      base: v['--cs-base'] ?? '#0a0e17',
      accent: v['--cs-citron'] ?? toHex(DEFAULT_ACCENT),
      ink: v['--cs-film-ink'] ?? '#f4f6f2',
      glow: v['--cs-glow'] ?? '#5a78c8',
      secondary: v['--cs-secondary'] ?? '#ada0f8',
      image: derived.active && appearance.source !== 'color' ? derived.imageUrl : null,
      background: appearance.background,
      spectrum: spectrumIn(appearance, activeFilm),
      angle: appearance.gradient.direction,
      ambient: appearance.ambient / 100,
    };
  }, [cssVars, derived, appearance, activeFilm]);

  const value = useMemo<AppearanceApi>(
    () => ({
      appearance,
      update,
      updatePanel,
      reset,
      presets,
      savePreset,
      applyPreset,
      deletePreset,
      setCustomImageFromFile,
      derived,
      cssVars,
      artworkLabel,
      wheelCollapsed,
      setWheelCollapsed,
      persisted,
      filmPalette: activeFilm,
      resolved,
    }),
    [appearance, update, updatePanel, reset, presets, savePreset, applyPreset, deletePreset, setCustomImageFromFile, derived, cssVars, artworkLabel, wheelCollapsed, setWheelCollapsed, persisted, activeFilm, resolved],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The spectrum a setting resolves to: the viewer's own, the film's, or XENON's. */
function spectrumIn(a: Appearance, film: SkinPalette | null): Spectrum {
  if (a.gradient.paletteMode === 'custom') return a.gradient.custom;
  return spectrumFor(film);
}

/** For the "solid colour" source: the chosen colour becomes the art; the tint is a darkened copy so panels stay dark. */
function paletteFromColor(hexColor: string): Palette {
  const c = parseHex(hexColor) ?? [31, 59, 87];
  const [h, s] = rgbToHsl(c);
  const tint = hslToRgb(h, Math.min(s, 0.45), 0.1).map(Math.round) as RGB;
  return {
    tint,
    dominant: c,
    average: c,
    accent: safeAccent(hslToRgb(h, Math.max(0.55, s), 0.62).map(Math.round) as RGB),
    brightness: rgbToHsl(c)[2],
    note: 'Using your chosen colour; panels use a darkened copy so text stays readable.',
  };
}
