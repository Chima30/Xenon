import { usePlayer } from '@videojs/react/video';
import { useEffect, useId, useRef, useState } from 'react';
import { clamp, formatTime, speakTime } from '../format';
import { CloseIcon, ReturnIcon } from '../icons';
import { sceneIndexAt, type SkinScene } from '../scenes';
import type { ThumbnailAt, TimelineMarker } from './Timeline';
import './lens.css';

const SPANS = [
  { seconds: 120, label: '2 min' },
  { seconds: 40, label: '40 s' },
  { seconds: 12, label: '12 s' },
];
const FRAMES = 9;

interface Props {
  onClose: () => void;
  /** The control that opened the lens; focus returns to it. */
  returnFocusTo?: HTMLElement | null;
  scenes: SkinScene[];
  thumbnailAt?: ThumbnailAt;
  markers: TimelineMarker[];
  onJump: (time: number, label: string) => void;
}

/**
 * Time Lens: the timeline opened up into a precision filmstrip. Moving the lens never seeks; the viewer inspects a
 * moment (stills from the film itself, timestamps, scene cuts, saved moments) and explicitly chooses Jump.
 * Without thumbnails it still works as a fine-grained timecode ruler.
 */
export function TimeLens({ onClose, returnFocusTo, scenes, thumbnailAt, markers, onJump }: Props) {
  const duration = usePlayer((s) => s.duration);
  const now = usePlayer((s) => Math.floor(s.currentTime));
  const [target, setTargetState] = useState(() => now);
  const [spanIdx, setSpanIdx] = useState(1);
  const [badImages, setBadImages] = useState<Set<string>>(() => new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const max = Math.max(0, Math.floor(duration));
  const setTarget = (t: number) => setTargetState(clamp(Math.round(t), 0, max));
  const span = Math.max(1, Math.min(SPANS[spanIdx]?.seconds ?? 40, max || 40));
  const step = span / FRAMES;
  const windowStart = clamp(Math.floor((target - span / 2) / step) * step, 0, Math.max(0, max - span));
  const pos = (t: number) => clamp(((t - windowStart) / span) * 100, 0, 100);
  const inWindow = (t: number) => t >= windowStart && t <= windowStart + span;

  const latest = useRef({ target, step, span, max, windowStart });
  latest.current = { target, step, span, max, windowStart };
  const jumpRef = useRef(() => {});
  jumpRef.current = () => onJump(target, 'the Time Lens position');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Focus the strip on open; give focus back on close.
  const opener = useRef(returnFocusTo);
  useEffect(() => {
    stripRef.current?.focus({ preventScroll: true });
    const back = opener.current;
    return () => {
      if (back && back.isConnected) back.focus({ preventScroll: true });
    };
  }, []);

  // Native listeners: the player's hotkeys listen natively on the container, so the lens must stop keys first.
  useEffect(() => {
    const root = rootRef.current;
    const strip = stripRef.current;
    if (!root || !strip) return;
    const onRootKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) e.stopPropagation();
    };
    const onStripKey = (e: KeyboardEvent) => {
      const { target: t, step: st, span: sp, max: mx } = latest.current;
      let next: number | null = null;
      switch (e.key) {
        case 'ArrowLeft':
          next = t - (e.shiftKey ? 1 : Math.max(1, Math.round(st)));
          break;
        case 'ArrowRight':
          next = t + (e.shiftKey ? 1 : Math.max(1, Math.round(st)));
          break;
        case 'PageUp':
          next = t - sp;
          break;
        case 'PageDown':
          next = t + sp;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = mx;
          break;
        case 'ArrowUp':
          setSpanIdx((i) => Math.min(SPANS.length - 1, i + 1)); // zoom in
          break;
        case 'ArrowDown':
          setSpanIdx((i) => Math.max(0, i - 1)); // zoom out
          break;
        case 'Enter':
          jumpRef.current();
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (next !== null) setTargetState(clamp(Math.round(next), 0, mx));
    };
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY + e.deltaX;
      if (Math.abs(acc) >= 40) {
        const { target: t, step: st, max: mx } = latest.current;
        setTargetState(clamp(Math.round(t + Math.sign(acc) * Math.max(1, Math.round(st))), 0, mx));
        acc = 0;
      }
    };
    root.addEventListener('keydown', onRootKey);
    strip.addEventListener('keydown', onStripKey);
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      root.removeEventListener('keydown', onRootKey);
      strip.removeEventListener('keydown', onStripKey);
      strip.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Drag across the strip to aim the lens. Never seeks.
  const aimFromPointer = (clientX: number) => {
    const frames = stripRef.current?.querySelector('.cs-lens-frames');
    const r = frames?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    const { windowStart: ws, span: sp } = latest.current;
    setTarget(ws + clamp((clientX - r.left) / r.width, 0, 1) * sp);
  };

  const sceneIdx = sceneIndexAt(scenes, target);
  const scene = scenes[sceneIdx];
  const delta = target - now;
  const loupe = thumbnailAt ? thumbnailAt(target, 500) : null;
  const frames = Array.from({ length: FRAMES }, (_, i) => {
    const t0 = windowStart + i * step;
    const mid = Math.min(max, Math.round(t0 + step / 2));
    return { i, t0, mid, src: thumbnailAt ? thumbnailAt(mid, 330) : null, on: target >= t0 && target < t0 + step };
  });
  const cuts = scenes.filter((s) => s.start > windowStart && s.start < windowStart + span);
  const pins = markers.filter((m) => m.kind !== 'scene' && inWindow(m.time));
  const failed = (src: string | null) => (src ? badImages.has(src) : true);
  const markFailed = (src: string) => setBadImages((s) => new Set(s).add(src));

  return (
    <div ref={rootRef} className="cs-lens" role="dialog" aria-modal="false" aria-labelledby={titleId} data-interactive>
      <div className="cs-lens-loupe" aria-hidden="true">
        {loupe && !failed(loupe) ? (
          <img key={loupe} src={loupe} alt="" draggable={false} onError={() => markFailed(loupe)} />
        ) : (
          <span className="cs-lens-loupe-fallback">{formatTime(target)}</span>
        )}
        <span className="cs-lens-reticle" />
      </div>

      <div className="cs-lens-main">
        <header className="cs-lens-head">
          <h2 id={titleId} className="cs-lens-title">
            Time Lens
          </h2>
          <strong className="cs-lens-time" aria-live="polite">
            {formatTime(target)}
          </strong>
          {scene ? <span className="cs-lens-scene">{scene.title}</span> : null}
          <span className="cs-lens-delta">
            {Math.abs(delta) < 1 ? 'at the playhead' : `${delta > 0 ? '+' : '−'}${formatTime(Math.abs(delta))} from the playhead`}
          </span>
          <div className="cs-lens-zoom" role="group" aria-label="Lens span">
            {SPANS.map((s, i) => (
              <button key={s.label} type="button" className="cs-lens-chip" aria-pressed={spanIdx === i} onClick={() => setSpanIdx(i)}>
                {s.label}
              </button>
            ))}
          </div>
          <button type="button" className="cs-icon-btn cs-lens-close" onClick={onClose} aria-label="Close Time Lens">
            <CloseIcon />
          </button>
        </header>

        <div
          ref={stripRef}
          className="cs-lens-strip"
          role="slider"
          tabIndex={0}
          aria-label="Time Lens position. Arrow keys move, Shift for one second, Up and Down zoom, Enter jumps."
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={target}
          aria-valuetext={`${speakTime(target)}${scene ? `, ${scene.title}` : ''}`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            aimFromPointer(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons & 1) aimFromPointer(e.clientX);
          }}
        >
          <ol className="cs-lens-frames" aria-hidden="true">
            {frames.map((f) => (
              <li key={`${f.t0}`} className="cs-lens-frame" data-on={f.on || undefined}>
                {f.src && !failed(f.src) ? (
                  <img src={f.src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => markFailed(f.src!)} />
                ) : (
                  <span className="cs-lens-frame-fallback" />
                )}
                <span className="cs-lens-frame-time">{formatTime(f.mid)}</span>
              </li>
            ))}
          </ol>
          <div className="cs-lens-overlay" aria-hidden="true">
            {cuts.map((c) => (
              <span key={c.start} className="cs-lens-cut" style={{ left: `${pos(c.start)}%` }}>
                <span>{c.title}</span>
              </span>
            ))}
            {pins.map((m, i) => (
              <span key={`${m.kind}-${m.time}-${i}`} className="cs-lens-pin" data-kind={m.kind} style={{ left: `${pos(m.time)}%` }} />
            ))}
            {inWindow(now) ? <span className="cs-lens-playhead" style={{ left: `${pos(now)}%` }} /> : null}
            <span className="cs-lens-needle" style={{ left: `${pos(target)}%` }} />
          </div>
        </div>

        <footer className="cs-lens-actions">
          <div className="cs-lens-nudge" role="group" aria-label="Fine adjustment">
            {[-5, -1, 1, 5].map((d) => (
              <button
                key={d}
                type="button"
                className="cs-lens-chip"
                onClick={() => setTarget(target + d)}
                aria-label={`Move the lens ${d < 0 ? 'back' : 'forward'} ${Math.abs(d)} second${Math.abs(d) === 1 ? '' : 's'}`}
              >
                {d > 0 ? `+${d}` : `−${-d}`} s
              </button>
            ))}
          </div>
          <button type="button" className="cs-lens-chip" onClick={() => setTarget(now)} disabled={Math.abs(delta) < 1}>
            <ReturnIcon aria-hidden="true" /> To playhead
          </button>
          <button type="button" className="cs-lens-jump" onClick={() => jumpRef.current()} disabled={Math.abs(delta) < 1}>
            Jump to {formatTime(target)}
          </button>
        </footer>
      </div>
    </div>
  );
}
