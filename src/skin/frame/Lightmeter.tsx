import { useEffect, useRef, useState } from 'react';
import { aperture, evText, isCut, kelvinText, readFrame, scalePos, warmth, type LightReading } from './light';

const STEP_MS = 1500;
const MARKS = [-3, -2, -1, 0, 1, 2, 3];

/**
 * XENON Lightmeter: a slim plate under the picture that reads the frame on screen, the way a cinematographer's
 * meter would. The scale is painted with the frame's own tones, each where its brightness falls; the needle is the
 * frame's key in stops; the reading adds its colour temperature.
 *
 * It also lights the Photon Frame: the corners take the frame's key light (--cs-light), the lens irises follow
 * exposure (--pf-ap), and a cut sends one glint round the brackets (data-glint). These are written straight to the
 * DOM, so a reading every 1.5 s re-renders only this plate.
 *
 * It reads a 48×27 copy of the frame every 1.5 s while playing, and once on pause, seek and load. Nothing runs while
 * the tab is hidden. When a video's pixels cannot be read (no CORS), it says so instead of guessing.
 */
export function Lightmeter({ mediaKey }: { mediaKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [reading, setReading] = useState<LightReading | null | 'wait'>('wait');
  const last = useRef<LightReading | null>(null);
  const newFilm = useRef(false);

  useEffect(() => {
    newFilm.current = true;
    last.current = null;
  }, [mediaKey]);

  useEffect(() => {
    const host = ref.current;
    const stage = host?.closest('.cs-stagewrap');
    const root = host?.closest<HTMLElement>('.cs-root');
    if (!host || !stage || !root) return;
    const canvas = document.createElement('canvas');
    let glints = 0;
    let glintTimer = 0;
    const still = () => root.dataset.motion === 'reduce' || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const glint = () => {
      const frame = root.querySelector('.cs-photon');
      if (!frame || still()) return;
      glints++;
      frame.setAttribute('data-glint', glints % 2 ? 'a' : 'b');
      window.clearTimeout(glintTimer);
      glintTimer = window.setTimeout(() => frame.removeAttribute('data-glint'), 1100);
    };
    const sample = () => {
      if (document.hidden) return;
      const video = stage.querySelector('video');
      if (!video || video.readyState < 2) return;
      const r = readFrame(video, canvas);
      if (!r) {
        if (video.videoWidth) {
          setReading(null);
          root.style.removeProperty('--cs-light');
          root.style.removeProperty('--pf-ap');
        }
        return;
      }
      const prev = last.current;
      last.current = r;
      setReading(r);
      root.style.setProperty('--cs-light', r.light);
      root.style.setProperty('--pf-ap', aperture(r.ev).toFixed(3));
      if ((prev && isCut(prev, r)) || newFilm.current) glint();
      newFilm.current = false;
    };
    const soon = () => requestAnimationFrame(sample);
    const timer = window.setInterval(() => {
      const video = stage.querySelector('video');
      if (video && !video.paused) sample();
    }, STEP_MS);
    // Media events do not bubble, but they do pass ancestors in the capture phase: this follows any <video>
    // the stage swaps in (a new film, a new source).
    const events = ['loadeddata', 'seeked', 'pause', 'play'];
    events.forEach((e) => stage.addEventListener(e, soon, true));
    document.addEventListener('visibilitychange', soon);
    soon();
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(glintTimer);
      events.forEach((e) => stage.removeEventListener(e, soon, true));
      document.removeEventListener('visibilitychange', soon);
      root.style.removeProperty('--cs-light');
      root.style.removeProperty('--pf-ap');
    };
  }, []);

  const r = reading === 'wait' ? null : reading;
  const label = r
    ? `Light meter: ${evText(r.ev)}, ${warmth(r.kelvin).toLowerCase()}, ${kelvinText(r.kelvin)}`
    : reading === null
      ? 'Light meter: this video does not allow its picture to be read'
      : 'Light meter: waiting for the picture';
  const gradient = r && r.tones.length ? `linear-gradient(90deg, ${r.tones.map((t) => `${t.colour} ${(scalePos(t.ev) * 100).toFixed(1)}%`).join(', ')})` : undefined;

  return (
    <div ref={ref} className="cs-plate" data-reading={r ? 'on' : reading === null ? 'off' : 'wait'}>
      <div className="cs-lm" role="img" aria-label={label}>
        <span className="cs-lm-label" aria-hidden="true">
          Light
        </span>
        <span className="cs-lm-gauge" aria-hidden="true">
          <span className="cs-lm-scale" style={gradient ? { backgroundImage: gradient } : undefined} />
          <span className="cs-lm-ticks" />
          <span className="cs-lm-marks">
            {MARKS.map((s) => (
              <i key={s} style={{ left: `${scalePos(s) * 100}%` }}>
                {s > 0 ? `+${s}` : s < 0 ? `−${-s}` : '0'}
              </i>
            ))}
          </span>
          {r ? <span className="cs-lm-needle" style={{ left: `${scalePos(r.ev) * 100}%` }} /> : null}
        </span>
        <span className="cs-lm-read" aria-hidden="true">
          {r ? (
            <>
              {evText(r.ev)}
              <span className="cs-lm-k">
                <span className="cs-lm-dot"> · </span>
                {warmth(r.kelvin)} <span className="cs-lm-dim">{kelvinText(r.kelvin)}</span>
              </span>
            </>
          ) : reading === null ? (
            <span className="cs-lm-dim">No reading</span>
          ) : (
            <span className="cs-lm-dim">Reading…</span>
          )}
        </span>
      </div>
    </div>
  );
}
