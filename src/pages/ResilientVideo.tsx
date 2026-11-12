import { usePlayer, Video } from '@videojs/react/video';
import { useEffect, useRef, useState } from 'react';
import { nextVariant, type Film, type Variant } from '../data/catalog';
import { isStalled } from './stall';

const firstFile = (film: Film): Variant =>
  film.variants.find((v) => v.server === 'commons' && v.quality === '480p') ?? film.variants.find((v) => v.server !== 'mux') ?? { server: 'commons', src: film.src };

/**
 * A plain Video for the demo pages, with one safety net: open hosts sometimes serve a copy that never delivers.
 * If the film should be playing but is stuck (see isStalled), it moves to the next file of the same film (Mux streams
 * are skipped: they need their own element) and carries on at the same second.
 */
export function ResilientVideo({ film }: { film: Film }) {
  const [variant, setVariant] = useState<Variant>(() => firstFile(film));
  const tried = useRef<Set<string>>(new Set());
  const resume = useRef<{ time: number; play: boolean } | null>(null);
  const paused = usePlayer((s) => s.paused);
  const canPlay = usePlayer((s) => s.canPlay);
  const store = usePlayer();

  const element = () => [...document.querySelectorAll('video')].find((v) => v.src === variant.src) ?? null;

  useEffect(() => {
    const r = resume.current;
    const el = element();
    if (!r || !canPlay || !el) return;
    resume.current = null;
    void store.seek(r.time);
    if (r.play) void store.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, variant.src]);

  useEffect(() => {
    if (paused) return;
    let last = element()?.currentTime ?? 0;
    let still = 0;
    const id = window.setInterval(() => {
      const el = element();
      if (document.hidden || !el) return;
      const t = el.currentTime;
      if (Math.abs(t - last) > 0.05) {
        last = t;
        still = 0;
        return;
      }
      still += 1000;
      if (!isStalled(still, el)) return;
      window.clearInterval(id);
      tried.current.add(variant.src);
      const files = { ...film, variants: film.variants.filter((v) => v.server !== 'mux') };
      const next = nextVariant(files, variant, tried.current);
      if (!next) return;
      resume.current = { time: t, play: true };
      setVariant(next);
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, variant.src]);

  return <Video src={variant.src} playsInline preload="metadata" crossOrigin={variant.server === 'commons' ? 'anonymous' : undefined} />;
}
