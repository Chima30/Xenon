import { useEffect, useState, type RefObject } from 'react';
import type { ThumbnailAt } from '../dock/Timeline';

const W = 48;
const H = 27;

/**
 * Up to five dominant colours of an image or video frame, darkest first, or null when its pixels cannot be read
 * (a cross-origin source without CORS headers taints the canvas). 4-bit buckets per channel; colours closer than
 * a small distance to one already chosen are skipped, so the result describes the frame rather than one large area.
 */
export function paletteOf(src: CanvasImageSource): string[] | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] ?? 0;
      const g = d[i + 1] ?? 0;
      const b = d[i + 2] ?? 0;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const cell = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      cell.n += 1;
      cell.r += r;
      cell.g += g;
      cell.b += b;
      buckets.set(key, cell);
    }
    const ranked = [...buckets.values()].sort((a, b) => b.n - a.n).map((c) => [c.r / c.n, c.g / c.n, c.b / c.n] as const);
    const picked: (readonly [number, number, number])[] = [];
    for (const c of ranked) {
      if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 46)) picked.push(c);
      if (picked.length === 5) break;
    }
    if (picked.length === 0) return null;
    const lum = (c: readonly [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return picked
      .sort((a, b) => lum(a) - lum(b))
      .map((c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
  } catch {
    return null;
  }
}

function loadStill(url: string, signal: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const stop = () => {
      img.src = '';
      resolve(null);
    };
    signal.addEventListener('abort', stop, { once: true });
    img.onload = () => {
      signal.removeEventListener('abort', stop);
      resolve(img);
    };
    img.onerror = () => {
      signal.removeEventListener('abort', stop);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * The colours of the frame the viewer paused on. The paused video frame itself is read when its pixels are
 * readable; otherwise a real still of the same second from the permitted frame service. Null until known, or when
 * neither can be read: the caller then keeps the film's own palette.
 */
export function useFrameColours(active: boolean, time: number, anchor: RefObject<HTMLElement | null>, thumbnailAt?: ThumbnailAt): string[] | null {
  const [colours, setColours] = useState<string[] | null>(null);
  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    // The real <video> of this player (Video.js's media object may be a wrapper around it).
    const video = anchor.current?.closest('.cs-stage')?.querySelector('video') ?? null;
    const fromVideo = video && video.readyState >= 2 && video.videoWidth > 0 ? paletteOf(video) : null;
    if (fromVideo) {
      setColours(fromVideo);
      return;
    }
    const url = thumbnailAt?.(time, 330);
    if (!url) {
      setColours(null);
      return;
    }
    void loadStill(url, ctrl.signal).then((img) => {
      if (!ctrl.signal.aborted) setColours(img ? paletteOf(img) : null);
    });
    return () => ctrl.abort();
  }, [active, time, anchor, thumbnailAt]);
  return active ? colours : null;
}
