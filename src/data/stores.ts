import { useSyncExternalStore } from 'react';
import { isRecord, readJSON, writeJSON } from '../skin/storage';

/** A tiny localStorage-backed store usable from any component via useSyncExternalStore. */
function createStore<T>(key: string, validate: (v: unknown) => T | null, fallback: T) {
  let value = readJSON(key, validate, fallback);
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  // Stay in sync with other tabs.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === `cinema-skin:v1:${key}`) {
        value = readJSON(key, validate, fallback);
        emit();
      }
    });
  }

  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      writeJSON(key, next);
      emit();
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/* ---------- Saved moments ---------- */

export interface Moment {
  id: string;
  videoId: string;
  time: number;
  label: string;
  /** Free-form note. Optional, so moments saved by earlier versions stay valid. */
  note?: string;
  createdAt: number;
}

const isMoment = (m: unknown): m is Moment =>
  isRecord(m) &&
  typeof m.id === 'string' &&
  typeof m.videoId === 'string' &&
  typeof m.label === 'string' &&
  typeof m.time === 'number' &&
  Number.isFinite(m.time) &&
  m.time >= 0 &&
  typeof m.createdAt === 'number' &&
  Number.isFinite(m.createdAt) &&
  (m.note === undefined || typeof m.note === 'string');

export const parseMoments = (v: unknown): Moment[] | null => (Array.isArray(v) ? v.filter(isMoment) : null);

const momentStore = createStore<Moment[]>('moments', parseMoments, []);

export function useMoments(): Moment[] {
  return useSyncExternalStore(momentStore.subscribe, momentStore.get, momentStore.get);
}
export const momentsFor = (all: Moment[], videoId: string) =>
  all.filter((m) => m.videoId === videoId).sort((a, b) => a.time - b.time);

export function addMoment(videoId: string, time: number, label: string): Moment {
  const moment: Moment = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    videoId,
    time: Math.max(0, time),
    label,
    createdAt: Date.now(),
  };
  momentStore.set([...momentStore.get(), moment]);
  return moment;
}
export function updateMomentLabel(id: string, label: string) {
  momentStore.set(momentStore.get().map((m) => (m.id === id ? { ...m, label } : m)));
}
export function updateMomentNote(id: string, note: string) {
  const clean = note.trim().slice(0, 400);
  momentStore.set(
    momentStore.get().map((m) => {
      if (m.id !== id) return m;
      const { note: _old, ...rest } = m;
      void _old;
      return clean ? { ...rest, note: clean } : rest;
    }),
  );
}
export function removeMoment(id: string) {
  momentStore.set(momentStore.get().filter((m) => m.id !== id));
}
export function replaceMoments(next: Moment[]) {
  momentStore.set(next);
}

/* ---------- Resume positions ---------- */

export interface Progress {
  time: number;
  duration: number;
  updatedAt: number;
}
type ProgressMap = Record<string, Progress>;

const parseProgress = (v: unknown): ProgressMap | null => {
  if (!isRecord(v)) return null;
  const out: ProgressMap = {};
  for (const [id, p] of Object.entries(v)) {
    if (
      isRecord(p) &&
      typeof p.time === 'number' &&
      typeof p.duration === 'number' &&
      typeof p.updatedAt === 'number' &&
      Number.isFinite(p.time) &&
      Number.isFinite(p.duration)
    ) {
      out[id] = { time: p.time, duration: p.duration, updatedAt: p.updatedAt };
    }
  }
  return out;
};

const progressStore = createStore<ProgressMap>('progress', parseProgress, {});

export function useProgress(): ProgressMap {
  return useSyncExternalStore(progressStore.subscribe, progressStore.get, progressStore.get);
}
export function saveProgress(videoId: string, time: number, duration: number) {
  progressStore.set({ ...progressStore.get(), [videoId]: { time, duration, updatedAt: Date.now() } });
}
/** A position is worth resuming when the viewer got past the first 10 seconds and is not at the very end. */
export function resumeTime(p: Progress | undefined): number | null {
  if (!p || p.duration <= 0) return null;
  return p.time > 10 && p.time < p.duration * 0.95 ? p.time : null;
}

/* ---------- My List ---------- */

const parseList = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
const listStore = createStore<string[]>('mylist', parseList, []);

export function useMyList(): string[] {
  return useSyncExternalStore(listStore.subscribe, listStore.get, listStore.get);
}
export function toggleMyList(id: string) {
  const cur = listStore.get();
  listStore.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
}
