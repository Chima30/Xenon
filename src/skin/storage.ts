/**
 * Small, defensive localStorage helpers. Every read is validated, every write is wrapped:
 * storage can be missing (private windows), full (quota) or hold hand-edited garbage.
 */
const NS = 'cinema-skin:v1:';

export function readJSON<T>(key: string, validate: (value: unknown) => T | null, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(NS + key);
    if (raw === null) return fallback;
    const result = validate(JSON.parse(raw));
    return result === null ? fallback : result;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/* ---------- Preferences ---------- */

export type ScrimMode = 'default' | 'high-contrast' | 'theater';
export const SCRIM_MODES: readonly ScrimMode[] = ['default', 'high-contrast', 'theater'];

export interface Prefs {
  scrim: ScrimMode;
}
const DEFAULT_PREFS: Prefs = { scrim: 'default' };

export function loadPrefs(): Prefs {
  return readJSON<Prefs>(
    'prefs',
    (v) => {
      if (!isRecord(v)) return null;
      const scrim = SCRIM_MODES.find((m) => m === v.scrim) ?? DEFAULT_PREFS.scrim;
      return { scrim };
    },
    DEFAULT_PREFS,
  );
}

export function savePrefs(prefs: Prefs): void {
  writeJSON('prefs', prefs);
}
