import { useMedia } from '@videojs/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clamp } from '../format';
import { isRecord, readJSON, writeJSON } from '../storage';
import { languageName, parseSubtitles, SubtitleParseError, type Cue } from './parse';

export interface SubTrack {
  id: string;
  label: string;
  lang?: string;
  origin: 'native' | 'upload' | 'paste';
  cues: Cue[];
  /** Original text for user-supplied tracks, kept so they can be restored after a reload. */
  raw?: string;
}

export type CapSize = 'sm' | 'md' | 'lg' | 'xl';
export type CapPosition = 'bottom' | 'raised' | 'top';
export type CapOutline = 'none' | 'shadow' | 'outline';
export type CapFont = 'brand' | 'system' | 'serif' | 'mono';

export interface CaptionStyle {
  size: CapSize;
  color: string;
  /** 0 to 100 */
  bgOpacity: number;
  position: CapPosition;
  outline: CapOutline;
  /** Subtitle typeface, independent of the interface font. */
  font: CapFont;
}

export const CAPTION_COLORS = [
  { value: '#ffffff', name: 'White' },
  { value: '#d8ff57', name: 'Citron' },
  { value: '#ffe14d', name: 'Yellow' },
  { value: '#8dd3cf', name: 'Teal' },
  { value: '#ada0f8', name: 'Lavender' },
] as const;

const DEFAULT_STYLE: CaptionStyle = { size: 'md', color: '#ffffff', bgOpacity: 75, position: 'bottom', outline: 'none', font: 'brand' };

const parseStyle = (v: unknown): CaptionStyle | null => {
  if (!isRecord(v)) return null;
  const pick = <T extends string>(x: unknown, allowed: readonly T[], d: T): T => allowed.find((a) => a === x) ?? d;
  return {
    size: pick(v.size, ['sm', 'md', 'lg', 'xl'] as const, DEFAULT_STYLE.size),
    color: CAPTION_COLORS.find((c) => c.value === v.color)?.value ?? DEFAULT_STYLE.color,
    bgOpacity: typeof v.bgOpacity === 'number' ? clamp(v.bgOpacity, 0, 100) : DEFAULT_STYLE.bgOpacity,
    position: pick(v.position, ['bottom', 'raised', 'top'] as const, DEFAULT_STYLE.position),
    outline: pick(v.outline, ['none', 'shadow', 'outline'] as const, DEFAULT_STYLE.outline),
    font: pick(v.font, ['brand', 'system', 'serif', 'mono'] as const, DEFAULT_STYLE.font),
  };
};

interface StoredTrack {
  id: string;
  label: string;
  lang?: string;
  origin: 'upload' | 'paste';
  raw: string;
}
interface StoredMedia {
  tracks: StoredTrack[];
  activeId: string | null;
  offset: number;
}

const parseStored = (v: unknown): StoredMedia | null => {
  if (!isRecord(v) || !Array.isArray(v.tracks)) return null;
  const tracks = v.tracks.filter(
    (t): t is StoredTrack =>
      isRecord(t) &&
      typeof t.id === 'string' &&
      typeof t.label === 'string' &&
      typeof t.raw === 'string' &&
      (t.origin === 'upload' || t.origin === 'paste'),
  );
  return {
    tracks,
    activeId: typeof v.activeId === 'string' ? v.activeId : null,
    offset: typeof v.offset === 'number' && Number.isFinite(v.offset) ? clamp(v.offset, -30, 30) : 0,
  };
};

interface SubtitleApi {
  tracks: SubTrack[];
  active: SubTrack | null;
  activeId: string | null;
  setActive: (id: string | null) => void;
  /** Returns an error message, or null on success. */
  addTrack: (label: string, lang: string, raw: string, origin: 'upload' | 'paste') => string | null;
  removeTrack: (id: string) => void;
  offset: number;
  setOffset: (seconds: number) => void;
  style: CaptionStyle;
  setStyle: (patch: Partial<CaptionStyle>) => void;
  /** Toggle captions on/off, restoring the last track used. */
  toggle: () => void;
}

const Ctx = createContext<SubtitleApi | null>(null);

export function useSubtitles(): SubtitleApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSubtitles must be used inside <CinemaSkin>');
  return ctx;
}

export function SubtitleProvider({ mediaKey, children }: { mediaKey: string; children: ReactNode }) {
  const media = useMedia() as HTMLMediaElement | null;
  const storageKey = `subs:${mediaKey}`;

  const [native, setNative] = useState<SubTrack[]>([]);
  const [user, setUser] = useState<SubTrack[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [offset, setOffsetState] = useState(0);
  const [style, setStyleState] = useState<CaptionStyle>(() => readJSON('subtitle-style', parseStyle, DEFAULT_STYLE));
  const [userTurnedOff, setUserTurnedOff] = useState(() => readJSON('captions-off', (v) => v === true, false));

  // The persist effect must not run on the render where state is still empty but a restore is queued,
  // or it would overwrite what was just read (and React StrictMode runs effects twice in dev).
  const skipPersist = useRef(false);

  // Restore this film's uploaded/pasted tracks.
  useEffect(() => {
    skipPersist.current = true;
    const stored = readJSON<StoredMedia>(storageKey, parseStored, { tracks: [], activeId: null, offset: 0 });
    const restored: SubTrack[] = [];
    for (const t of stored.tracks) {
      try {
        restored.push({ ...t, cues: parseSubtitles(t.raw) });
      } catch {
        /* skip a corrupt stored track */
      }
    }
    setUser(restored);
    setNative([]);
    setActiveId(restored.some((t) => t.id === stored.activeId) ? stored.activeId : null);
    setOffsetState(stored.offset);
  }, [storageKey]);

  // Persist user tracks, selection and offset.
  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    writeJSON(storageKey, {
      tracks: user.map(({ id, label, lang, origin, raw }) => ({
        id,
        label,
        lang,
        origin: origin === 'paste' ? ('paste' as const) : ('upload' as const),
        raw: raw ?? '',
      })),
      activeId: activeId?.startsWith('native:') ? null : activeId,
      offset,
    } satisfies StoredMedia);
  }, [storageKey, user, activeId, offset]);

  // Read cues from native <track> elements and in-stream (HLS) subtitle tracks. We draw captions ourselves, but a
  // track must be 'showing' for streaming engines to load its cues; the browser's own rendering is hidden in CSS.
  useEffect(() => {
    const tt = media?.textTracks;
    if (!media || !tt) return;
    const sync = () => {
      const found: SubTrack[] = [];
      for (let i = 0; i < tt.length; i++) {
        const t = tt[i];
        if (!t || (t.kind !== 'captions' && t.kind !== 'subtitles')) continue;
        if (t.mode !== 'showing') t.mode = 'showing';
        if (!t.cues || t.cues.length === 0) continue;
        found.push({
          id: `native:${i}:${t.language || t.label}`,
          label: t.label || languageName(t.language) || `Track ${i + 1}`,
          lang: t.language || undefined,
          origin: 'native',
          cues: Array.from(t.cues).map((c) => ({ start: c.startTime, end: c.endTime, text: ((c as VTTCue).text ?? '').replace(/<[^>]*>/g, '') })),
        });
      }
      setNative((prev) => (prev.length === found.length && prev.every((p, i) => p.id === found[i]?.id) ? prev : found));
    };
    sync();
    const timers = [window.setTimeout(sync, 800), window.setTimeout(sync, 2500)];
    tt.addEventListener('addtrack', sync);
    media.addEventListener('loadedmetadata', sync);
    // Streamed captions arrive in pieces as segments load; re-read when a track's cue count grows.
    const known = new Map<TextTrack, number>();
    const onCue = (e: Event) => {
      const t = e.target as TextTrack;
      const n = t.cues?.length ?? 0;
      if (known.get(t) !== n) {
        known.set(t, n);
        sync();
      }
    };
    const watched: TextTrack[] = [];
    const watchAll = () => {
      for (let i = 0; i < tt.length; i++) {
        const t = tt[i];
        if (t && !watched.includes(t)) {
          watched.push(t);
          t.addEventListener('cuechange', onCue);
        }
      }
    };
    watchAll();
    tt.addEventListener('addtrack', watchAll);
    return () => {
      timers.forEach(window.clearTimeout);
      tt.removeEventListener('addtrack', sync);
      tt.removeEventListener('addtrack', watchAll);
      media.removeEventListener('loadedmetadata', sync);
      watched.forEach((t) => t.removeEventListener('cuechange', onCue));
    };
  }, [media, mediaKey]);

  // Automatic selection: pick the track matching the browser language, unless the viewer turned captions off.
  useEffect(() => {
    if (activeId !== null || userTurnedOff || native.length === 0) return;
    const want = (navigator.language || 'en').split('-')[0];
    const match = native.find((t) => t.lang?.split('-')[0] === want) ?? native.find((t) => t.lang === undefined);
    if (match) setActiveId(match.id);
  }, [native, activeId, userTurnedOff]);

  const tracks = useMemo(() => [...native, ...user], [native, user]);
  const active = tracks.find((t) => t.id === activeId) ?? null;

  const setActive = useCallback((id: string | null) => {
    setActiveId(id);
    if (id) setLastId(id);
    setUserTurnedOff(id === null);
    writeJSON('captions-off', id === null);
  }, []);

  const addTrack = useCallback(
    (label: string, lang: string, raw: string, origin: 'upload' | 'paste') => {
      try {
        const cues = parseSubtitles(raw);
        const id = `${origin}:${Date.now().toString(36)}`;
        const code = lang.trim() || undefined;
        const track: SubTrack = { id, label: label.trim() || languageName(code) || 'Subtitles', lang: code, origin, cues, raw };
        setUser((u) => [...u, track]);
        setActive(id);
        return null;
      } catch (e) {
        return e instanceof SubtitleParseError ? e.message : 'Could not read those subtitles.';
      }
    },
    [setActive],
  );

  const removeTrack = useCallback(
    (id: string) => {
      setUser((u) => u.filter((t) => t.id !== id));
      if (activeId === id) setActiveId(null);
    },
    [activeId],
  );

  const setOffset = useCallback((s: number) => setOffsetState(Math.round(clamp(s, -30, 30) * 10) / 10), []);
  const setStyle = useCallback((patch: Partial<CaptionStyle>) => {
    setStyleState((prev) => {
      const next = { ...prev, ...patch };
      writeJSON('subtitle-style', next);
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    if (active) setActive(null);
    else {
      const target = tracks.find((t) => t.id === lastId) ?? tracks[0];
      if (target) setActive(target.id);
    }
  }, [active, lastId, tracks, setActive]);

  const value = useMemo<SubtitleApi>(
    () => ({ tracks, active, activeId, setActive, addTrack, removeTrack, offset, setOffset, style, setStyle, toggle }),
    [tracks, active, activeId, setActive, addTrack, removeTrack, offset, setOffset, style, setStyle, toggle],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
