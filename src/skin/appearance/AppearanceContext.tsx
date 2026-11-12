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
}

/** The colours the skin actually settled on, so a host page can match its surroundings to the player. */
export interface ResolvedAtmosphere {
  base: string;
  accent: string;
  ink: string;
  glow: string;
  secondary: string;
  /** Artwork shown behind the player, when the viewer has it on. */
  image: string | null;
}
export type PanelArea = 'header' | 'wheel' | 'controls';

export interface Appearance {
  /** Adaptive follows each film's signature palette; Fixed keeps one look for every film. */
  theme: 'adaptive' | 'fixed';
  /** Panel background colour chosen by the viewer, or null to use the film's (or XENON's) base. */
  panelColor: string | null;
  /** Artwork layer switch. The film palette (accent and base colour) applies either way. */
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
}

export const DEFAULT_APPEARANCE: Appearance = {
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

function parseAppearance(v: unknown): Appearance | null {
  if (!isRecord(v)) return null;
  const d = DEFAULT_APPEARANCE;
  const panels = isRecord(v.panels) ? v.panels : {};
  const styles = ['glass', 'solid', 'clear'] as const;
  return {
    theme: pick(v.theme, ['adaptive', 'fixed'] as const, d.theme),
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
  };
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
        const next = { ...prev, ...patch };
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
        const next: Appearance = { ...p.appearance, customImage: prev.customImage };
        if (next.source === 'custom' && !next.customImage) next.source = 'poster';
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
        update({ customImage: dataUrl, source: 'custom' });
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
    };
  }, [cssVars, derived, appearance.source]);

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
