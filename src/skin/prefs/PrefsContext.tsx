import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { isRecord, readJSON, writeJSON } from '../storage';

export interface ViewPrefs {
  highContrast: boolean;
  largeControls: boolean;
  /** User override on top of the operating system setting. */
  reducedMotion: boolean;
  /** Text labels beside dock icons (Save moment, ...). */
  dockLabels: boolean;
  /** Tighter dock spacing. */
  dockCompact: boolean;
  /**
   * Control arrangement. Floating: transport over the video, a floating console below.
   * Compact: one slim bar. Expanded: a labelled console under the video that never covers the picture.
   */
  dockLayout: DockLayout;
  /** Show the Pause Canvas (title, scene and actions) when the film is paused. */
  pauseCanvas: boolean;
}

export type DockLayout = 'floating' | 'compact' | 'expanded';
export const DOCK_LAYOUTS: readonly DockLayout[] = ['floating', 'compact', 'expanded'];

export const DEFAULT_PREFS: ViewPrefs = {
  highContrast: false,
  largeControls: false,
  reducedMotion: false,
  dockLabels: true,
  dockCompact: false,
  dockLayout: 'floating',
  pauseCanvas: true,
};

export type ProfileId = 'standard' | 'high-contrast' | 'large' | 'reduced-motion';

export const PROFILES: { id: ProfileId; label: string; description: string; prefs: Partial<ViewPrefs> }[] = [
  { id: 'standard', label: 'Standard', description: 'The default XENON look.', prefs: {} },
  {
    id: 'high-contrast',
    label: 'High contrast',
    description: 'Solid control surfaces, strong borders and thick focus rings.',
    prefs: { highContrast: true },
  },
  {
    id: 'large',
    label: 'Large controls',
    description: 'Bigger buttons, text and spacing for touch and low vision.',
    prefs: { largeControls: true, dockLabels: true },
  },
  {
    id: 'reduced-motion',
    label: 'Reduced motion',
    description: 'No panel, wheel or background animation.',
    prefs: { reducedMotion: true },
  },
];

const parse = (v: unknown): ViewPrefs | null => {
  if (!isRecord(v)) return null;
  const b = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
  return {
    highContrast: b(v.highContrast, false),
    largeControls: b(v.largeControls, false),
    reducedMotion: b(v.reducedMotion, false),
    dockLabels: b(v.dockLabels, true),
    dockCompact: b(v.dockCompact, false),
    dockLayout: DOCK_LAYOUTS.find((l) => l === v.dockLayout) ?? 'floating',
    pauseCanvas: b(v.pauseCanvas, true),
  };
};

/** Which preset the current settings match, or "custom" once the viewer has tweaked them. */
export function activeProfile(p: ViewPrefs): ProfileId | 'custom' {
  for (const profile of PROFILES) {
    const expected = { ...DEFAULT_PREFS, ...profile.prefs };
    if (
      expected.highContrast === p.highContrast &&
      expected.largeControls === p.largeControls &&
      expected.reducedMotion === p.reducedMotion &&
      expected.dockLabels === p.dockLabels &&
      expected.dockCompact === p.dockCompact
    ) {
      return profile.id;
    }
  }
  return 'custom';
}

interface PrefsApi {
  prefs: ViewPrefs;
  /** Effective high contrast: the viewer's setting OR a host test override. */
  highContrast: boolean;
  set: (patch: Partial<ViewPrefs>) => void;
  applyProfile: (id: ProfileId) => void;
  reset: () => void;
  profile: ProfileId | 'custom';
}

const Ctx = createContext<PrefsApi | null>(null);

export function usePrefs(): PrefsApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePrefs must be used inside <CinemaSkin>');
  return c;
}

export function PrefsProvider({ forceHighContrast, children }: { forceHighContrast?: boolean; children: ReactNode }) {
  const [prefs, setPrefs] = useState<ViewPrefs>(() => readJSON('view-prefs', parse, DEFAULT_PREFS));

  const commit = useCallback((next: ViewPrefs) => {
    setPrefs(next);
    writeJSON('view-prefs', next);
  }, []);
  const set = useCallback((patch: Partial<ViewPrefs>) => commit({ ...prefs, ...patch }), [prefs, commit]);
  const applyProfile = useCallback(
    (id: ProfileId) => {
      const p = PROFILES.find((x) => x.id === id);
      // Profiles change accessibility settings only; the viewer's dock layout and Pause Canvas choice stay.
      if (p) commit({ ...DEFAULT_PREFS, dockLayout: prefs.dockLayout, pauseCanvas: prefs.pauseCanvas, ...p.prefs });
    },
    [commit, prefs.dockLayout, prefs.pauseCanvas],
  );
  const reset = useCallback(() => commit(DEFAULT_PREFS), [commit]);

  const value = useMemo<PrefsApi>(
    () => ({ prefs, highContrast: prefs.highContrast || Boolean(forceHighContrast), set, applyProfile, reset, profile: activeProfile(prefs) }),
    [prefs, forceHighContrast, set, applyProfile, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
