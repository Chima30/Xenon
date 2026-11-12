import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { clamp } from '../format';
import './wheel.css';

export interface WheelItem {
  id: string;
  label: string;
  meta?: string;
  /** Still image URL; falls back to a timecode card when missing or failing. */
  image?: string | null;
  fallbackText?: string;
  /** 0..1 watched fraction. */
  progress?: number;
}

/** One face of the instrument: what it lists, which item is live, and what selecting does. */
export interface WheelSet {
  items: WheelItem[];
  /** The item that is currently playing / active. */
  activeId: string | null;
  /** Click, Enter or Space on a frame. `keyboard` is true when it came from the keyboard. */
  onSelect: (id: string, opener: HTMLElement, keyboard: boolean) => void;
  /** Accessible name for the list, e.g. "Films". */
  label: string;
  /** Word used in the active badge, e.g. "Now". */
  activeWord: string;
  /** Short word shown in the hub readout, e.g. "Films". */
  unit: string;
  /** Still shown inside the hub lens, so the context survives a change of face. */
  hubImage?: string | null;
}

export type WheelVariant = 'movies' | 'scenes';

/** A request from outside to turn the wheel to an item. A new `id` re-applies it. */
export interface WheelPoint {
  id: number;
  face: WheelVariant;
  index: number;
  /** Move keyboard focus to the frame once it is in the gate. */
  focus?: boolean;
}

/** Why the frame in the gate changed: the viewer turned the wheel, something asked for it, or playback moved on. */
export type PointSource = 'user' | 'point' | 'live';

interface WheelProps {
  variant: WheelVariant;
  sets: Record<WheelVariant, WheelSet>;
  point?: WheelPoint | null;
  /** The frame in (or settling into) the gate changed. Fires once per frame passed, never once per animation frame. */
  onPoint?: (face: WheelVariant, index: number, source: PointSource) => void;
}

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
/** Pointer travel, in px, that turns the wheel by one frame. Roughly the arc length between two frames. */
const DRAG_STEP: Record<WheelVariant, number> = { movies: 92, scenes: 74 };
/** Wheel-event travel, in px, per frame: one notch of a mouse wheel turns one frame; trackpads turn smoothly. */
const SCROLL_STEP = 100;

/* ------------------------------------------------------------------ */
/* Motion: one damped spring, written straight to CSS custom properties.                                   */
/* React renders only when a different frame reaches the gate; every in-between frame is a style write.    */
/* ------------------------------------------------------------------ */

/** Stiffness and damping: a damping ratio of about 0.9, so the snap settles with the faintest give. */
const SPRING_K = 230;
const SPRING_C = 27;
/** How quickly a flick loses speed (1/s). A flick at v frames/s coasts about v / FRICTION frames. */
const FRICTION = 4;

class WheelMotion {
  pos = 0;
  vel = 0;
  target = 0;
  fan = 1;
  private max = 0;
  private springing = false;
  private fanFrom = 1;
  private fanTo = 1;
  private fanStart = 0;
  private fanMs = 0;
  private fanDone: (() => void) | null = null;
  private raf = 0;
  private last = 0;
  private nearest = -1;

  constructor(
    private readonly el: HTMLElement,
    private readonly onNearest: (index: number) => void,
  ) {}

  setCount(count: number) {
    this.max = Math.max(0, count - 1);
  }

  private write() {
    const s = this.el.style;
    s.setProperty('--wheel-h', this.pos.toFixed(4));
    s.setProperty('--wheel-fan', this.fan.toFixed(4));
    // 1 when a frame sits exactly in the gate, falling to 0 halfway between two frames: drives the gate light.
    s.setProperty('--wheel-lock', (1 - Math.min(1, Math.abs(this.pos - Math.round(this.pos)) * 2.4)).toFixed(3));
    const n = clamp(Math.round(this.pos), 0, this.max);
    if (n !== this.nearest) {
      this.nearest = n;
      this.onNearest(n);
    }
  }

  /** Places the wheel at once: first paint, a new face, reduced motion. */
  jump(index: number) {
    this.pos = this.target = clamp(index, 0, this.max);
    this.vel = 0;
    this.springing = false;
    this.write();
  }

  /** Turns to a position on the spring, carrying whatever speed the wheel already has. */
  to(position: number) {
    this.target = clamp(position, 0, this.max);
    this.springing = true;
    this.run();
  }

  /** Direct manipulation: the wheel follows the pointer exactly, with a little give past either end. */
  drag(position: number, velocity: number) {
    this.pos = clamp(position, -0.4, this.max + 0.4);
    this.vel = velocity;
    this.springing = false;
    this.write();
  }

  /** Lets go: the flick decelerates and the wheel snaps to the frame it would have come to rest nearest. */
  release(): number {
    const rest = this.pos + this.vel / FRICTION;
    const snap = clamp(Math.round(rest), 0, this.max);
    this.to(snap);
    return snap;
  }

  /** Folds the frames into the hub (0) or fans them back out (1). */
  fold(to: 0 | 1, ms: number, done?: () => void) {
    this.fanFrom = this.fan;
    this.fanTo = to;
    this.fanStart = -1; // stamped by the first animation frame, on the same clock as every later frame
    this.fanMs = ms;
    this.fanDone = done ?? null;
    this.run();
  }

  /** Ends every animation where it stands. */
  settle() {
    if (this.fanMs > 0) {
      this.fan = this.fanTo;
      this.fanMs = 0;
      const done = this.fanDone;
      this.fanDone = null;
      done?.();
    }
    if (this.springing) this.jump(Math.round(this.target));
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private run() {
    if (this.raf) return;
    this.last = -1;
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    // Only animation-frame timestamps are compared, never performance.now(): they share one clock everywhere.
    const dt = this.last < 0 ? 1 / 60 : Math.min(0.034, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.springing) {
      // Semi-implicit Euler in two sub-steps: stable at 30 fps and above.
      for (let k = 0; k < 2; k++) {
        const h = dt / 2;
        const a = -SPRING_K * (this.pos - this.target) - SPRING_C * this.vel;
        this.vel += a * h;
        this.pos += this.vel * h;
      }
      if (Math.abs(this.pos - this.target) < 0.0015 && Math.abs(this.vel) < 0.02) {
        this.pos = this.target;
        this.vel = 0;
        this.springing = false;
      }
    }
    if (this.fanMs > 0) {
      if (this.fanStart < 0) this.fanStart = now - 1000 / 60;
      const p = Math.min(1, (now - this.fanStart) / this.fanMs);
      // Folding accelerates into the hub; unfolding decelerates out of it.
      const e = this.fanTo < this.fanFrom ? p * p * p : 1 - Math.pow(1 - p, 3);
      this.fan = this.fanFrom + (this.fanTo - this.fanFrom) * e;
      if (p >= 1) {
        this.fanMs = 0;
        this.fan = this.fanTo;
        const done = this.fanDone;
        this.fanDone = null;
        done?.();
      }
    }
    this.write();
    if (!this.raf && (this.springing || this.fanMs > 0)) this.raf = requestAnimationFrame(this.tick);
  };
}

/* ------------------------------------------------------------------ */

/** True while the surrounding player container is narrow; the wheel then becomes a snap carousel. */
function useNarrow(ref: RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const host = ref.current?.closest('.cs-root');
    if (!host || typeof ResizeObserver === 'undefined') return;
    const measure = () => setNarrow(host.getBoundingClientRect().width < 761);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [ref]);
  return narrow;
}

function prefersReducedMotion(el: HTMLElement | null): boolean {
  if (el?.closest('[data-motion="reduce"]')) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Focus an element, trying again on the next few frames if it cannot take focus yet (a host page's reduced-motion
 * reset can leave a just-revealed subtree visibility:hidden for one frame).
 */
function focusSoon(el: HTMLElement | null | undefined, preventScroll: boolean, tries = 4) {
  if (!el) return;
  el.focus({ preventScroll });
  if (document.activeElement !== el && tries > 0 && el.isConnected) requestAnimationFrame(() => focusSoon(el, preventScroll, tries - 1));
}

/**
 * XENON's navigation wheel: a curved filmstrip riding round a hub. One instrument with two faces (Movies and
 * Scenes). Changing face folds the frames into the hub and fans the others out of it.
 *
 * The wheel only ever POINTS at something while it turns. Nothing loads or seeks until the viewer chooses the
 * action offered for the frame in the gate, so browsing is always safe.
 *
 * Motion: drag and scroll move the wheel directly; a flick coasts, decelerates and snaps to the nearest frame on
 * a spring. Positions are written to CSS custom properties every animation frame, and the frames' arc, depth,
 * scale and light are all computed in CSS from them, so turning costs no React renders and no layout.
 */
export function NavigationWheel({ variant, sets, point, onPoint }: WheelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const motion = useRef<WheelMotion | null>(null);
  const narrow = useNarrow(rootRef);

  // The face on screen. It trails `variant` by one fold so the old frames can leave first.
  const [shown, setShown] = useState<WheelVariant>(variant);
  const set = sets[shown];
  const { items, activeId } = set;
  const itemCount = items.length;
  const activeIndex = Math.max(0, items.findIndex((i) => i.id === activeId));

  /** The frame nearest the gate right now (follows the animation, one render per frame passed). */
  const [nearest, setNearest] = useState(activeIndex);
  /** Where the wheel is headed: the frame the viewer aimed at. Drives the tab stop and the detail card. */
  const [aim, setAim] = useState(activeIndex);
  /** Bumped on every selection to replay the gate's confirmation flash. */
  const [fired, setFired] = useState(0);
  const [dragging, setDragging] = useState(false);

  const latest = useRef({ aim, itemCount, shown, narrow, onPoint });
  latest.current = { aim, itemCount, shown, narrow, onPoint };
  /** True while a drag or scroll is turning the wheel freely: the gate frame then becomes the aim as it passes. */
  const free = useRef(false);
  /** A frame to focus once React has rendered it as the aim (it may be outside the visible arc until then). */
  const pendingFocus = useRef<number | null>(null);
  /** Bumped with every focus request, so the request is honoured even when the aim does not change. */
  const [focusReq, setFocusReq] = useState(0);
  const requestFocus = (index: number) => {
    pendingFocus.current = index;
    setFocusReq((n) => n + 1);
  };

  const report = (index: number, source: PointSource) => {
    latest.current.aim = index;
    setAim(index);
    latest.current.onPoint?.(latest.current.shown, index, source);
  };
  const wanted = useRef(variant);
  wanted.current = variant;
  const shownRef = useRef(shown);
  shownRef.current = shown;

  // One motion engine per mounted wheel.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const m = new WheelMotion(el, (n) => {
      setNearest(n);
      if (free.current && n !== latest.current.aim) report(n, 'user');
    });
    m.setCount(itemCount);
    m.jump(activeIndex);
    motion.current = m;
    return () => m.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reduced = () => prefersReducedMotion(rootRef.current);
  /** Turns to a frame: on the spring, or at once under reduced motion. */
  const turnTo = (index: number) => {
    const m = motion.current;
    if (!m) return;
    if (reduced() || latest.current.narrow) m.jump(index);
    else m.to(index);
  };

  // Change of face: fold the old frames into the hub, swap, fan the new ones out.
  useEffect(() => {
    if (variant === shown) return;
    const m = motion.current;
    if (!m || narrow || reduced()) {
      m?.settle();
      setShown(variant);
      return;
    }
    // The viewer may have switched back while the frames were folding: show whatever is wanted now.
    m.fold(0, 170, () => {
      if (wanted.current === shownRef.current) m.fold(1, 260);
      else setShown(wanted.current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  // A new face, a new list or a request from outside: place the wheel.
  const appliedPoint = useRef<number | null>(null);
  const pointId = point?.id;
  useLayoutEffect(() => {
    const m = motion.current;
    if (!m) return;
    m.setCount(itemCount);
    const request = point && point.face === shown && appliedPoint.current !== point.id ? point : null;
    if (request) appliedPoint.current = request.id;
    const index = clamp(request ? request.index : activeIndex, 0, Math.max(0, itemCount - 1));
    if (m.fan < 1) {
      // Just swapped faces behind a fold: start the new face in place and fan it out.
      m.jump(index);
      if (reduced() || narrow) m.settle();
      else m.fold(1, 260);
    } else if (request) {
      turnTo(index);
    } else {
      m.jump(index);
      setNearest(index);
    }
    report(index, request ? 'point' : 'live');
    if (request?.focus) requestFocus(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, itemCount, pointId]);

  // Playback moved on to another scene (or another film started): follow it, unless the viewer is browsing.
  const prevActive = useRef(activeIndex);
  useEffect(() => {
    const was = prevActive.current;
    prevActive.current = activeIndex;
    if (was === activeIndex || free.current) return;
    if (latest.current.aim !== was) return; // the viewer is looking elsewhere; leave the wheel where they put it
    turnTo(activeIndex);
    report(activeIndex, 'live');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // Focus the aimed frame once it is rendered as the aim (and so visible).
  useEffect(() => {
    if (pendingFocus.current === null || pendingFocus.current !== aim) return;
    pendingFocus.current = null;
    focusSoon(buttons.current[aim], !narrow);
  }, [aim, narrow, nearest, focusReq]);

  // Carousel: keep the aimed card in view.
  useEffect(() => {
    if (narrow) buttons.current[aim]?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [aim, narrow]);

  // Native listeners: React's synthetic events fire after the player's own hotkey listener, so arrow keys would
  // seek or change volume. Stopping propagation here gives the wheel ownership of its keys.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const step = DRAG_STEP[shown];

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.stopPropagation(); // the focused frame activates natively; the player must not toggle playback
        return;
      }
      if (!NAV_KEYS.has(e.key)) return;
      e.stopPropagation();
      e.preventDefault();
      const { aim: cur, itemCount: count } = latest.current;
      let next = cur;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = cur - 1;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = cur + 1;
      else if (e.key === 'PageUp') next = cur - 3;
      else if (e.key === 'PageDown') next = cur + 3;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = count - 1;
      next = clamp(next, 0, Math.max(0, count - 1));
      free.current = false;
      requestFocus(next);
      turnTo(next);
      report(next, 'user');
    };

    // Scroll: trackpads turn the wheel continuously, mouse notches one frame each; it snaps once the scrolling stops.
    let scrollPos = 0;
    let scrolling = false;
    let scrollTimer = 0;
    const onWheel = (e: WheelEvent) => {
      const m = motion.current;
      if (latest.current.narrow || !m) return;
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * root.clientHeight : e.deltaY;
      if (!scrolling) {
        scrolling = true;
        scrollPos = m.target;
        free.current = true;
      }
      const max = Math.max(0, latest.current.itemCount - 1);
      scrollPos = clamp(scrollPos + px / SCROLL_STEP, -0.3, max + 0.3);
      if (reduced()) m.jump(Math.round(clamp(scrollPos, 0, max)));
      else m.to(scrollPos);
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrolling = false;
        free.current = false;
        const snap = clamp(Math.round(scrollPos), 0, max);
        turnTo(snap);
        if (snap !== latest.current.aim) report(snap, 'user');
      }, 130);
    };

    // Drag (mouse, pen or touch): the wheel follows the pointer exactly; letting go coasts and snaps.
    let startY = 0;
    let startPos = 0;
    let moved = false;
    let samples: { t: number; y: number }[] = [];
    const onDown = (e: PointerEvent) => {
      const m = motion.current;
      if (latest.current.narrow || !m || (e.pointerType === 'mouse' && e.button !== 0)) return;
      startY = e.clientY;
      startPos = m.pos; // grab the wheel where it is, even mid-turn
      moved = false;
      samples = [{ t: e.timeStamp, y: e.clientY }];
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
      window.addEventListener('pointercancel', onUp, { once: true });
    };
    const onMove = (e: PointerEvent) => {
      const m = motion.current;
      if (!m) return;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) > 6) {
        moved = true;
        free.current = true;
        setDragging(true);
      }
      if (!moved) return;
      samples.push({ t: e.timeStamp, y: e.clientY });
      while (samples.length > 2 && e.timeStamp - samples[0]!.t > 90) samples.shift();
      const first = samples[0]!;
      const span = Math.max(1, e.timeStamp - first.t);
      const velocity = (-(e.clientY - first.y) / step / span) * 1000; // frames per second
      m.drag(startPos - dy / step, velocity);
    };
    const onUp = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      const m = motion.current;
      if (!moved || !m) return;
      // A finger that stopped before lifting has no flick left in it.
      const lastSample = samples[samples.length - 1];
      if (lastSample && e.timeStamp - lastSample.t > 80) m.vel = 0;
      free.current = false;
      setDragging(false);
      let snap: number;
      if (reduced()) {
        snap = clamp(Math.round(m.pos), 0, Math.max(0, latest.current.itemCount - 1));
        m.jump(snap);
      } else snap = m.release();
      if (snap !== latest.current.aim) report(snap, 'user');
      // Swallow the click that follows a drag so it does not select a frame.
      const swallow = (ev: Event) => ev.stopPropagation();
      root.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => root.removeEventListener('click', swallow, { capture: true }), 0);
    };

    root.addEventListener('keydown', onKey);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('pointerdown', onDown);
    return () => {
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.clearTimeout(scrollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const reach = shown === 'scenes' ? 3 : 2;
  const gate = narrow ? aim : nearest;

  return (
    <div
      ref={rootRef}
      className="wheel"
      data-layout={narrow ? 'carousel' : 'arc'}
      data-variant={shown}
      data-dragging={dragging || undefined}
    >
      {!narrow ? (
        <>
          <div className="wheel-dial" aria-hidden="true" />
          <div className="wheel-ring" aria-hidden="true" />
          <div className="wheel-light" aria-hidden="true" />
          {/* The hub is a readout, not a control: position, total and the film the wheel belongs to. */}
          <div className="wheel-hub" aria-hidden="true">
            {set.hubImage ? <HubLens src={set.hubImage} /> : null}
            <span className="wheel-readout">
              <strong>{itemCount > 0 ? pad2(gate + 1) : '--'}</strong>
              <span>/ {pad2(itemCount)}</span>
            </span>
            <span className="wheel-unit">{set.unit}</span>
          </div>
          {/* The gate: a fixed viewfinder frame. Whatever sits inside it is what the detail card describes. */}
          <div key={fired} className="wheel-gate" data-fired={fired > 0 || undefined} aria-hidden="true" />
          {/* Explore: a fine line from the gate to the seam with the picture, pulsing once per new frame in the gate. */}
          <div key={`coupler-${shown}-${gate}`} className="wheel-coupler" aria-hidden="true" />
        </>
      ) : null}
      <ul className="wheel-list" aria-label={set.label}>
        {items.map((item, i) => {
          const d = i - gate;
          const hidden = !narrow && Math.abs(d) > reach + 1 && i !== aim;
          const isActive = item.id === activeId;
          return (
            <li
              key={`${shown}-${item.id}`}
              className="wheel-li"
              data-d={narrow ? 0 : clamp(d, -4, 4)}
              data-hidden={hidden || undefined}
              style={{ ['--i' as string]: i }}
            >
              <button
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                type="button"
                className="wheel-item"
                tabIndex={i === aim ? 0 : -1}
                aria-current={isActive ? 'true' : undefined}
                aria-hidden={hidden || undefined}
                aria-label={`${item.label}${item.meta ? `, ${item.meta}` : ''}${isActive ? `, ${set.activeWord}` : ''}`}
                data-active={isActive || undefined}
                data-highlight={i === gate || undefined}
                onClick={(e) => {
                  free.current = false;
                  if (i !== latest.current.aim) {
                    turnTo(i);
                    report(i, 'user');
                  }
                  setFired((n) => n + 1);
                  // detail 0: activated from the keyboard (Enter / Space), not a pointer.
                  set.onSelect(item.id, e.currentTarget, e.detail === 0);
                }}
                onFocus={(e) => {
                  // Keyboard focus turns the wheel; the focus a mouse press gives a frame must not (it may be a drag).
                  let keyboard = true;
                  try {
                    keyboard = e.currentTarget.matches(':focus-visible');
                  } catch {
                    /* engines without :focus-visible */
                  }
                  if (keyboard && latest.current.aim !== i && !free.current) {
                    turnTo(i);
                    report(i, 'user');
                  }
                }}
              >
                <Thumb src={item.image ?? null} fallback={item.fallbackText ?? item.label} />
                <span className="wheel-caption">
                  <span className="wheel-label">{item.label}</span>
                  {item.meta ? <span className="wheel-meta">{item.meta}</span> : null}
                </span>
                {isActive ? (
                  <span className="wheel-badge">
                    <span className="wheel-badge-dot" aria-hidden="true" />
                    {set.activeWord}
                  </span>
                ) : null}
                {item.progress && item.progress > 0 ? (
                  <span className="wheel-progress" aria-hidden="true">
                    <span style={{ width: `${clamp(item.progress, 0, 1) * 100}%` }} />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HubLens({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return null;
  return <img className="wheel-lens" src={src} alt="" draggable={false} onError={() => setFailed(true)} />;
}

function Thumb({ src, fallback }: { src: string | null; fallback: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <span className="wheel-thumb wheel-thumb-fallback" aria-hidden="true">
        {fallback}
      </span>
    );
  }
  return <img className="wheel-thumb" src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />;
}
