import { useEffect, useRef, useState } from 'react';

const W = 160;
const H = 90;
const BLADES = 8;
const R_MAX = Math.hypot(W, H) / 2 + 4;
const DURATION = 760;

/** Smooth in, smooth out. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Aperture radius (0..1) and blade rotation over the run: close, hold a beat, open. */
function aperture(p: number): { r: number; turn: number } {
  if (p < 0.4) {
    const k = ease(p / 0.4);
    return { r: 1 - k, turn: k };
  }
  if (p < 0.5) return { r: 0, turn: 1 };
  const k = ease((p - 0.5) / 0.5);
  return { r: k, turn: 1 - k };
}

function shapes(r: number, turn: number): { shade: string; seams: string } {
  const cx = W / 2;
  const cy = H / 2;
  const radius = Math.max(0.01, r) * R_MAX;
  const rot = turn * (Math.PI / 4);
  const pts = Array.from({ length: BLADES }, (_, i) => {
    const a = rot + (i / BLADES) * Math.PI * 2;
    return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius] as const;
  });
  const hole = `M ${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ')} Z`;
  const shade = `M -20 -20 H ${W + 20} V ${H + 20} H -20 Z ${hole}`;
  // Each blade edge continues past its corner out to the frame: the seams between the leaves.
  const seams = pts
    .map(([x, y], i) => {
      const [nx, ny] = pts[(i + 1) % BLADES]!;
      const dx = nx - x;
      const dy = ny - y;
      const len = Math.hypot(dx, dy) || 1;
      const reach = R_MAX * 2;
      return `M ${x.toFixed(2)} ${y.toFixed(2)} L ${(x - (dx / len) * reach).toFixed(2)} ${(y - (dy / len) * reach).toFixed(2)}`;
    })
    .join(' ');
  return { shade, seams };
}

/**
 * Optical Iris: a short camera-aperture close-and-open over the picture whenever the viewer explicitly switches
 * films. It sits under the controls, takes no pointer events and never waits for the new film to load; it simply
 * runs once alongside the switch. Reduced motion swaps it for a brief dissolve.
 */
export function IrisTransition({ trigger, reduced }: { trigger: string; reduced: boolean }) {
  const [run, setRun] = useState(0);
  const [mode, setMode] = useState<'iris' | 'fade'>('iris');
  const first = useRef(true);
  const shadeRef = useRef<SVGPathElement>(null);
  const seamRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const prefersReduced = reduced || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setMode(prefersReduced ? 'fade' : 'iris');
    setRun((r) => r + 1);
  }, [trigger, reduced]);

  useEffect(() => {
    if (!run) return;
    let frame = 0;
    let done = false;
    const start = performance.now();
    const draw = (p: number) => {
      const { r, turn } = aperture(p);
      const s = shapes(r, turn);
      shadeRef.current?.setAttribute('d', s.shade);
      seamRef.current?.setAttribute('d', s.seams);
    };
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      setRun(0);
    };
    if (mode === 'iris') {
      draw(0);
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / DURATION);
        draw(p);
        if (p < 1) frame = requestAnimationFrame(tick);
        else finish();
      };
      frame = requestAnimationFrame(tick);
    }
    // A safety net: background tabs stop animation frames, and the iris must never linger over the film.
    const t = window.setTimeout(finish, mode === 'iris' ? DURATION + 200 : 420);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(t);
    };
  }, [run, mode]);

  if (!run) return null;
  return (
    <div className="cs-iris" data-mode={mode} aria-hidden="true">
      {mode === 'iris' ? (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
          <path ref={shadeRef} className="cs-iris-shade" fillRule="evenodd" />
          <path ref={seamRef} className="cs-iris-seams" />
        </svg>
      ) : null}
    </div>
  );
}
