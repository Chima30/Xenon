import { usePlayer } from '@videojs/react/video';
import { useEffect, useRef, useState } from 'react';
import { FloatingPanel } from '../FloatingPanel';
import { clamp, formatTime, speakTime } from '../format';
import { useNativeKeydown } from '../hooks';
import { ReturnIcon } from '../icons';
import { sceneIndexAt, sceneKind, type SkinScene } from '../scenes';
import type { ThumbnailAt } from './Timeline';
import './dial.css';

interface Props {
  open: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  scenes: SkinScene[];
  thumbnailAt?: ThumbnailAt;
  onJump: (time: number, label: string) => void;
  onPreview: (index: number, opener: HTMLElement) => void;
  returnAnchor?: { time: number; onReturn: () => void } | null;
  /** Small players start in the list view. */
  preferList?: boolean;
}

const SIZE = 220;
const C = SIZE / 2;
const R = 88; // track radius

/** Point on the dial for a fraction of the runtime (0 = top, clockwise). */
const at = (fraction: number, r: number) => {
  const a = fraction * Math.PI * 2 - Math.PI / 2;
  return [C + Math.cos(a) * r, C + Math.sin(a) * r] as const;
};
function arc(from: number, to: number, r: number): string {
  const [x1, y1] = at(from, r);
  const [x2, y2] = at(Math.max(from + 0.0001, to - 0.004), r);
  const large = to - from > 0.5 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/**
 * Precision Scene Dial: a radial instrument for the current film's scenes. The track is divided only where scenes
 * really begin, so the graduations carry meaning. Turning the dial selects; nothing seeks until Jump.
 * It is a single ARIA slider, and a plain list view offers the same choices.
 */
export function SceneDial({ open, onClose, returnFocusTo, scenes, thumbnailAt, onJump, onPreview, returnAnchor, preferList }: Props) {
  const duration = usePlayer((s) => s.duration);
  const now = usePlayer((s) => Math.floor(s.currentTime));
  const playing = sceneIndexAt(scenes, now);
  const [sel, setSel] = useState(Math.max(0, playing));
  const [list, setList] = useState(Boolean(preferList));
  const [pulse, setPulse] = useState(0);
  const dialRef = useRef<HTMLDivElement>(null);

  // Re-aim at the playing scene each time the dial opens.
  useEffect(() => {
    if (open) {
      setSel(Math.max(0, playing));
      setList(Boolean(preferList));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const n = scenes.length;
  const choose = (i: number) => {
    const next = clamp(i, 0, n - 1);
    if (next === sel) return;
    setSel(next);
    setPulse((p) => p + 1);
  };

  const scene = scenes[sel];
  const latest = useRef({ sel, n });
  latest.current = { sel, n };
  const jump = () => scene && onJump(scene.start, scene.title);

  useNativeKeydown(dialRef, (e) => {
    const { sel: cur } = latest.current;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        choose(cur + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        choose(cur - 1);
        break;
      case 'PageUp':
        choose(cur + 3);
        break;
      case 'PageDown':
        choose(cur - 3);
        break;
      case 'Home':
        choose(0);
        break;
      case 'End':
        choose(latest.current.n - 1);
        break;
      case 'Enter':
        jump();
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  // Turn the dial with the scroll wheel.
  useEffect(() => {
    const el = dialRef.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) >= 50) {
        choose(latest.current.sel + Math.sign(acc));
        acc = 0;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // Drag around the dial: the pointer's angle picks the scene that contains that point of the runtime.
  const aim = (clientX: number, clientY: number, coarse: boolean) => {
    const r = dialRef.current?.getBoundingClientRect();
    if (!r || !(duration > 0)) return;
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const fraction = ((Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
    const i = Math.max(0, sceneIndexAt(scenes, fraction * duration));
    if (i !== latest.current.sel) {
      choose(i);
      if (coarse && 'vibrate' in navigator) navigator.vibrate?.(6);
    }
  };

  const kind = sceneKind(scenes);
  const frac = (t: number) => (duration > 0 ? clamp(t / duration, 0, 1) : 0);
  const pointer = scene ? frac(scene.start) * 360 : 0;
  const thumb = scene && thumbnailAt ? thumbnailAt(scene.start + 1, 330) : null;

  return (
    <FloatingPanel open={open} onClose={onClose} title="Scene dial" returnFocusTo={returnFocusTo}>
      <div className="cs-dialpanel" data-interactive>
        <div className="cs-dial-switch" role="group" aria-label="Show scenes as">
          <button type="button" className="cs-chip" aria-pressed={!list} onClick={() => setList(false)}>
            Dial
          </button>
          <button type="button" className="cs-chip" aria-pressed={list} onClick={() => setList(true)}>
            List
          </button>
        </div>

        {!list ? (
          <div
            ref={dialRef}
            className="cs-dial"
            role="slider"
            tabIndex={0}
            aria-label={`Scene dial. Arrow keys choose a ${kind.toLowerCase()}, Enter jumps.`}
            aria-valuemin={1}
            aria-valuemax={n}
            aria-valuenow={sel + 1}
            aria-valuetext={scene ? `${scene.title}, ${speakTime(scene.start)} to ${speakTime(scene.end)}${sel === playing ? ', playing now' : ''}` : ''}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              e.currentTarget.focus({ preventScroll: true });
              aim(e.clientX, e.clientY, e.pointerType !== 'mouse');
            }}
            onPointerMove={(e) => {
              if (e.buttons & 1) aim(e.clientX, e.clientY, e.pointerType !== 'mouse');
            }}
          >
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false">
              <circle className="cs-dial-bezel" cx={C} cy={C} r={C - 2} />
              <circle className="cs-dial-face" cx={C} cy={C} r={R - 14} />
              {scenes.map((s, i) => (
                <path
                  key={`a${s.start}`}
                  className="cs-dial-arc"
                  data-sel={i === sel || undefined}
                  data-playing={i === playing || undefined}
                  d={arc(frac(s.start), frac(s.end), R)}
                />
              ))}
              {scenes.map((s) => {
                const [x1, y1] = at(frac(s.start), R + 7);
                const [x2, y2] = at(frac(s.start), R + 16);
                return <line key={`t${s.start}`} className="cs-dial-tick" x1={x1} y1={y1} x2={x2} y2={y2} />;
              })}
              {returnAnchor ? (
                <rect
                  className="cs-dial-anchor"
                  x={at(frac(returnAnchor.time), R + 12)[0] - 4}
                  y={at(frac(returnAnchor.time), R + 12)[1] - 4}
                  width={8}
                  height={8}
                  transform={`rotate(45 ${at(frac(returnAnchor.time), R + 12).join(' ')})`}
                />
              ) : null}
              <circle className="cs-dial-playhead" cx={at(frac(now), R)[0]} cy={at(frac(now), R)[1]} r={4.5} />
              <g className="cs-dial-pointer" data-tick={pulse % 2 ? 'a' : 'b'} style={{ transform: `rotate(${pointer}deg)` }}>
                <path d={`M ${C} ${C - R + 12} l -7 13 h 14 z`} />
              </g>
            </svg>
            <div className="cs-dial-centre" aria-hidden="true">
              <span className="cs-dial-index">
                {String(sel + 1).padStart(2, '0')}
                <span>/{String(n).padStart(2, '0')}</span>
              </span>
              <span className="cs-dial-title">{scene?.title}</span>
              <span className="cs-dial-time">{scene ? formatTime(scene.start) : ''}</span>
            </div>
          </div>
        ) : (
          <ol className="cs-dial-list" aria-label={`${kind}s`}>
            {scenes.map((s, i) => (
              <li key={s.start}>
                <button
                  type="button"
                  className="cs-choice"
                  aria-pressed={i === sel}
                  aria-current={i === playing ? 'true' : undefined}
                  onClick={() => setSel(i)}
                >
                  <span className="cs-choice-main">{s.title}</span>
                  <span className="cs-tag">
                    {formatTime(s.start)}
                    {i === playing ? ' · now' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {scene ? (
          <div className="cs-dial-detail">
            <div className="cs-dial-still" aria-hidden="true">
              {thumb ? <img src={thumb} alt="" /> : <span>{formatTime(scene.start)}</span>}
            </div>
            <div className="cs-dial-info">
              <p className="cs-dial-kicker">
                {kind} {sel + 1} of {n}
                {sel === playing ? ' · playing now' : ''}
              </p>
              <p className="cs-dial-name">{scene.title}</p>
              <p className="cs-tag">
                {formatTime(scene.start)}–{formatTime(scene.end)}
              </p>
            </div>
          </div>
        ) : null}
        {scene?.description ? <p className="cs-dial-insight">{scene.description}</p> : null}

        <div className="cs-dial-actions">
          <button type="button" className="cs-chip" onClick={(e) => onPreview(sel, e.currentTarget)}>
            Preview
          </button>
          <button type="button" className="cs-chip cs-chip-primary" onClick={jump} disabled={sel === playing && Math.abs(now - (scene?.start ?? 0)) < 1}>
            Jump to {scene ? formatTime(scene.start) : ''}
          </button>
          {returnAnchor ? (
            <button type="button" className="cs-chip" onClick={returnAnchor.onReturn}>
              <ReturnIcon aria-hidden="true" /> Back to {formatTime(returnAnchor.time)}
            </button>
          ) : null}
        </div>
        {!scenes.some((s) => s.authored) ? (
          <p className="cs-card-desc">No chapters are published for this film, so its runtime is divided into equal, plainly labelled sections.</p>
        ) : null}
      </div>
    </FloatingPanel>
  );
}
