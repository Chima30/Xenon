import { TimeSlider } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import { useEffect, useRef, useState } from 'react';
import type { Clip } from '../ClipPanel';
import { clamp, formatTime } from '../format';
import { sceneIndexAt, type SkinScene } from '../scenes';
import { filmprintGradient, useFilmprint } from './filmprint';

export interface TimelineMarker {
  time: number;
  kind: 'moment' | 'anchor' | 'scene';
  label: string;
}

/** What the timeline shows while the pointer is over a position: a real still and a name, when the host has them. */
export interface ScenePreview {
  image?: string | null;
  label?: string;
}

export type ThumbnailAt = (seconds: number, width: number) => string | null;

interface Props {
  markers: TimelineMarker[];
  clip: Clip;
  scenes: SkinScene[];
  thumbnailAt?: ThumbnailAt;
  /** Overrides the preview built from scenes and thumbnails. */
  scenePreview?: (time: number) => ScenePreview | null;
  /** While the Time Lens is open, the hover preview steps aside. */
  lensOpen?: boolean;
  /** Time Tether: where the viewer was before exploring. Drawn as a quiet band back to the playhead. */
  tether?: number | null;
  /** Identifies the video so its Filmprint can be cached. */
  filmprintKey?: string;
}

/**
 * Precision filmstrip timeline. A real Video.js TimeSlider (keyboard, ARIA and seeking are native) dressed as a
 * measured strip: one graduation per minute of runtime, scene boundaries as cuts, saved moments as lavender bars
 * and the Return Anchor as a diamond. Hovering shows a real still near that second; it never seeks.
 */
export function Timeline({ markers, clip, scenes, thumbnailAt, scenePreview, lensOpen, tether = null, filmprintKey }: Props) {
  const duration = usePlayer((s) => s.duration);
  // Rounded so the tether band only re-renders a few hundred times across a whole film.
  const nowPct = usePlayer((s) => (s.duration > 0 ? Math.round((s.currentTime / s.duration) * 400) / 4 : 0));
  const print = useFilmprint(filmprintKey, thumbnailAt, duration);
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [badImage, setBadImage] = useState<string | null>(null);
  const time = hover !== null ? hover * duration : 0;

  let info: ScenePreview | null = null;
  if (hover !== null) {
    if (scenePreview) info = scenePreview(time);
    else {
      const s = scenes[sceneIndexAt(scenes, time)];
      // Rounded so the host is not asked for a new still on every pixel.
      info = { image: thumbnailAt ? thumbnailAt(Math.floor(time / 5) * 5, 330) : null, label: s?.title };
    }
  }
  const image = info?.image && info.image !== badImage ? info.image : null;

  const motion = useStripMotion(nowPct, duration, scenes, filmprintKey, ref);

  // One graduation per minute (per five minutes on long videos): real, measurable divisions of the runtime.
  const unit = duration > 3600 ? 300 : 60;
  const graduation = duration > unit ? `${(unit / duration) * 100}%` : null;

  const all: TimelineMarker[] = [
    ...scenes.filter((s) => s.start > 0).map((s) => ({ time: s.start, kind: 'scene' as const, label: s.title })),
    ...markers.filter((m) => m.kind !== 'scene' || !scenes.length),
  ];

  return (
    <div
      ref={ref}
      className="cs-tl"
      data-filmprint={print ? '' : undefined}
      data-develop={motion.developing ? '' : undefined}
      style={graduation ? { ['--tl-unit' as string]: graduation } : undefined}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (r && r.width > 0 && duration > 0) setHover(clamp((e.clientX - r.left) / r.width, 0, 1));
      }}
      onPointerLeave={() => setHover(null)}
      onPointerCancel={() => setHover(null)}
    >
      {hover !== null && duration > 0 && !lensOpen ? (
        <div className="cs-tl-preview" aria-hidden="true" data-image={image ? '' : undefined} style={{ ['--x' as string]: `${hover * 100}%` }}>
          {image ? <img src={image} alt="" draggable={false} onError={() => setBadImage(image)} /> : null}
          <span className="cs-tl-meta">
            {info?.label ? <span className="cs-tl-label">{info.label}</span> : null}
            <span className="cs-tl-time">{formatTime(time)}</span>
          </span>
        </div>
      ) : null}
      <TimeSlider.Root className="cs-timeslider">
        <TimeSlider.Track className="cs-track">
          {print ? <span className="cs-filmprint" aria-hidden="true" style={{ backgroundImage: filmprintGradient(print) }} /> : null}
          {graduation ? <span className="cs-graduation" aria-hidden="true" /> : null}
          {tether !== null && duration > 0 ? (
            <span
              className="cs-tether-band"
              aria-hidden="true"
              style={{
                left: `${Math.min(nowPct, clamp((tether / duration) * 100, 0, 100))}%`,
                width: `${Math.abs(nowPct - clamp((tether / duration) * 100, 0, 100))}%`,
              }}
            />
          ) : null}
          <TimeSlider.Buffer className="cs-buffer" />
          <TimeSlider.Fill className="cs-fill" />
          {motion.streak ? (
            <span
              key={motion.streak.n}
              className="cs-streak"
              aria-hidden="true"
              data-dir={motion.streak.to >= motion.streak.from ? 'forward' : 'back'}
              style={{ left: `${Math.min(motion.streak.from, motion.streak.to)}%`, width: `${Math.abs(motion.streak.to - motion.streak.from)}%` }}
              onAnimationEnd={motion.clearStreak}
            />
          ) : null}
          {motion.splice ? (
            <span key={motion.splice.n} className="cs-splice" aria-hidden="true" style={{ left: `${motion.splice.at}%` }} onAnimationEnd={motion.clearSplice} />
          ) : null}
        </TimeSlider.Track>
        <Markers markers={all} clip={clip} duration={duration} />
        <TimeSlider.Thumb className="cs-thumb" />
      </TimeSlider.Root>
    </div>
  );
}

function Markers({ markers, clip, duration }: { markers: TimelineMarker[]; clip: Clip; duration: number }) {
  if (!(duration > 0)) return null;
  const pct = (t: number) => `${clamp((t / duration) * 100, 0, 100)}%`;
  return (
    <>
      {clip.start !== null && clip.end !== null && clip.end > clip.start ? (
        <span
          className="cs-clip-range"
          aria-hidden="true"
          style={{ left: pct(clip.start), width: `${clamp(((clip.end - clip.start) / duration) * 100, 0, 100)}%` }}
        />
      ) : null}
      {markers.map((m, i) => (
        <span key={`${m.kind}-${m.time}-${i}`} className="cs-marker" data-kind={m.kind} style={{ left: pct(m.time), ['--i' as string]: i }} aria-hidden="true" />
      ))}
    </>
  );
}

/**
 * The strip's motion, all driven by real events and each played once:
 * - Develop: when a film arrives, the strip exposes left to right and its scene cuts appear in turn.
 * - Projector streak: a jump (seek, scene, moment, Time Lens) runs a beam of light from where you were to where you land.
 * - Splice light: while playing, each scene cut lights as the playhead passes through it.
 * Dragging the thumb draws no streak: the viewer is already watching the playhead move. The CSS switches it all off
 * under reduced motion.
 */
function useStripMotion(nowPct: number, duration: number, scenes: SkinScene[], filmKey: string | undefined, root: React.RefObject<HTMLDivElement | null>) {
  const prev = useRef<number | null>(null);
  const seq = useRef(0);
  const [streak, setStreak] = useState<{ n: number; from: number; to: number } | null>(null);
  const [splice, setSplice] = useState<{ n: number; at: number } | null>(null);
  const [developing, setDeveloping] = useState(false);
  const ready = duration > 0;

  // Develop once per film, as soon as its length is known.
  useEffect(() => {
    if (!ready) return;
    prev.current = null;
    setDeveloping(true);
    const id = window.setTimeout(() => setDeveloping(false), 1100);
    return () => window.clearTimeout(id);
  }, [ready, filmKey]);

  useEffect(() => {
    const before = prev.current;
    prev.current = nowPct;
    if (before === null || !ready) return;
    const step = nowPct - before;
    const dragging = !!root.current?.querySelector('.cs-timeslider[data-dragging]');
    if (Math.abs(step) >= 1.5) {
      if (!dragging) setStreak({ n: ++seq.current, from: before, to: nowPct });
      return;
    }
    if (step > 0) {
      const cut = scenes.find((s) => s.start > 0 && (s.start / duration) * 100 > before && (s.start / duration) * 100 <= nowPct);
      if (cut) setSplice({ n: ++seq.current, at: (cut.start / duration) * 100 });
    }
  }, [nowPct, ready, duration, scenes, root]);

  return { streak, splice, developing, clearStreak: () => setStreak(null), clearSplice: () => setSplice(null) };
}
