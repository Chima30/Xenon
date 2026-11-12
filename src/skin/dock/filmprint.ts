import { useEffect, useState } from 'react';
import { readJSON, writeJSON } from '../storage';
import type { ThumbnailAt } from './Timeline';

/** Number of colour samples across the runtime. */
export const FILMPRINT_SAMPLES = 24;

const isPrint = (v: unknown): (string | null)[] | null =>
  Array.isArray(v) && v.length === FILMPRINT_SAMPLES && v.every((c) => c === null || (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)))
    ? (v as (string | null)[])
    : null;

/** Average colour of a small still, or null when the host does not allow its pixels to be read. */
function sample(src: string, signal: AbortSignal): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const done = (v: string | null) => {
      signal.removeEventListener('abort', abort);
      resolve(v);
    };
    const abort = () => {
      img.src = '';
      done(null);
    };
    signal.addEventListener('abort', abort);
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 6;
        c.height = 4;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return done(null);
        ctx.drawImage(img, 0, 0, 6, 4);
        const d = ctx.getImageData(0, 0, 6, 4).data;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < d.length; i += 4) {
          r += d[i] ?? 0;
          g += d[i + 1] ?? 0;
          b += d[i + 2] ?? 0;
        }
        const n = d.length / 4;
        done('#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join(''));
      } catch {
        done(null); // tainted canvas: the host does not send CORS headers
      }
    };
    img.onerror = () => done(null);
    img.src = src;
  });
}

/**
 * Filmprint: the film's colour fingerprint, read once from real stills (thumbnail metadata or a permitted frame
 * service) and cached per video in localStorage. It is not continuous video analysis: 24 small images, sampled
 * after the player has settled, four at a time. When the stills cannot be read, it returns null and the timeline
 * stays an ordinary working timeline.
 */
export function useFilmprint(key: string | undefined, thumbnailAt: ThumbnailAt | undefined, duration: number): (string | null)[] | null {
  const storageKey = key ? `filmprint:${key}` : null;
  const [print, setPrint] = useState<(string | null)[] | null>(() => (storageKey ? readJSON(storageKey, isPrint, null) : null));

  useEffect(() => {
    if (!storageKey || !thumbnailAt || !(duration > 0)) {
      setPrint(null);
      return;
    }
    const cached = readJSON(storageKey, isPrint, null);
    if (cached) {
      setPrint(cached);
      return;
    }
    setPrint(null);
    const ctrl = new AbortController();
    const start = window.setTimeout(async () => {
      const times = Array.from({ length: FILMPRINT_SAMPLES }, (_, i) => Math.floor(((i + 0.5) / FILMPRINT_SAMPLES) * duration));
      const out: (string | null)[] = new Array(FILMPRINT_SAMPLES).fill(null);
      let next = 0;
      const worker = async () => {
        while (next < times.length && !ctrl.signal.aborted) {
          const i = next++;
          const src = thumbnailAt(times[i]!, 330);
          out[i] = src ? await sample(src, ctrl.signal) : null;
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      if (ctrl.signal.aborted) return;
      // Only keep a print that is mostly real; otherwise fall back to the plain timeline.
      if (out.filter(Boolean).length >= FILMPRINT_SAMPLES / 2) {
        writeJSON(storageKey, out);
        setPrint(out);
      }
    }, 1500);
    return () => {
      ctrl.abort();
      window.clearTimeout(start);
    };
  }, [storageKey, thumbnailAt, duration]);

  return print;
}

/** A gradient that blends from one sample to the next; gaps (unreadable stills) borrow their neighbour. */
export function filmprintGradient(print: (string | null)[]): string {
  const filled = print.map((c, i) => c ?? print.slice(0, i).reverse().find(Boolean) ?? print.slice(i).find(Boolean) ?? '#000000');
  const stops = filled.map((c, i) => `${c} ${(((i + 0.5) / filled.length) * 100).toFixed(2)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
