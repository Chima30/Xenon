import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clamp } from '../skin/format';
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
  onSelect: (id: string, opener: HTMLElement) => void;
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

interface WheelProps {
  variant: WheelVariant;
  sets: Record<WheelVariant, WheelSet>;
}

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', ' ', 'Enter']);
/** Pointer travel, in px, that turns the wheel by one item. Roughly the arc length between two frames. */
const DRAG_STEP: Record<WheelVariant, number> = { movies: 86, scenes: 70 };
/** Time for the frames to fold into the hub before the other face unfolds. Matches wheel.css. */
const FOLD_MS = 190;

/** True while the surrounding player container is narrow; the wheel then becomes a snap carousel. */
function useNarrow(ref: React.RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const host = ref.current?.closest('.cs-root');
    if (!host || typeof ResizeObserver === 'undefined') return;
    const measure = () => setNarrow(host.getBoundingClientRect().width < 760);
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
 * XENON's navigation wheel. One instrument with two faces (films and scenes): changing face folds the frames
 * into the hub and unfolds the others from it, so it reads as the same machine re-arranging itself.
 *
 * The wheel only ever POINTS at something while it turns. Nothing loads or seeks until the viewer presses
 * Enter, Space or clicks, so browsing is always safe.
 */
export function NavigationWheel({ variant, sets }: WheelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const narrow = useNarrow(rootRef);

  // The face on screen. It trails `variant` by one fold so the old frames can leave first.
  const [shown, setShown] = useState<WheelVariant>(variant);
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (variant === shown) return;
    if (narrow || prefersReducedMotion(rootRef.current)) {
      setShown(variant);
      return;
    }
    setFolded(true);
    const t = window.setTimeout(() => {
      setShown(variant);
      setFolded(false);
    }, FOLD_MS);
    return () => window.clearTimeout(t);
  }, [variant, shown, narrow]);

  const set = sets[shown];
  const { items, activeId } = set;
  const itemCount = items.length;
  const activeIndex = Math.max(
    0,
    items.findIndex((i) => i.id === activeId),
  );

  // "highlight" is where the wheel is pointing. Moving it never selects or seeks anything.
  const [highlight, setHighlight] = useState(activeIndex);
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;
  /** Fractional position while a drag is in progress; null otherwise. */
  const [drag, setDrag] = useState<number | null>(null);
  /** Bumped on every selection to replay the gate's confirmation flash. */
  const [fired, setFired] = useState(0);

  // Re-point at the live item when the face, the list or the live item changes.
  useEffect(() => {
    setHighlight(activeIndex);
  }, [activeIndex, itemCount, shown]);

  const pendingFocus = useRef(false);
  const move = (next: number, focus: boolean) => {
    const i = clamp(next, 0, Math.max(0, itemCount - 1));
    setHighlight(i);
    highlightRef.current = i;
    // Focus after render: frames outside the visible arc are visibility:hidden until the wheel turns.
    if (focus) pendingFocus.current = true;
  };
  useEffect(() => {
    if (pendingFocus.current) {
      pendingFocus.current = false;
      buttons.current[highlight]?.focus({ preventScroll: !narrow });
    }
  }, [highlight, narrow]);

  // Native listeners: React's synthetic events fire after the player's own hotkey listener,
  // so arrow keys would seek or change volume. Stopping propagation here gives the wheel ownership.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onKey = (e: KeyboardEvent) => {
      if (!NAV_KEYS.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
      e.stopPropagation(); // keep Space/Enter/arrows from reaching player hotkeys
      const cur = highlightRef.current;
      let next = cur;
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          next = cur - 1;
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          next = cur + 1;
          break;
        case 'PageUp':
          next = cur - 3;
          break;
        case 'PageDown':
          next = cur + 3;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = itemCount - 1;
          break;
        default:
          return; // Space / Enter: let the focused button activate natively
      }
      e.preventDefault();
      move(next, true);
    };

    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (narrow) return; // carousel scrolls natively
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) >= 60) {
        move(highlightRef.current + Math.sign(acc), false);
        acc = 0;
      }
    };

    // Drag (mouse, pen or touch): the wheel follows the pointer exactly, then settles on the nearest frame.
    let startY = 0;
    let startIndex = 0;
    let dragging = false;
    let pos = 0;
    const step = DRAG_STEP[shown];
    const onDown = (e: PointerEvent) => {
      if (narrow || (e.pointerType === 'mouse' && e.button !== 0)) return;
      startY = e.clientY;
      startIndex = highlightRef.current;
      pos = startIndex;
      dragging = false;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
      window.addEventListener('pointercancel', onUp, { once: true });
    };
    const onMove = (e: PointerEvent) => {
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 6) dragging = true;
      if (!dragging) return;
      // A little give past either end, so the limit is felt rather than hit.
      pos = clamp(startIndex - dy / step, -0.35, itemCount - 1 + 0.35);
      setDrag(pos);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      if (!dragging) return;
      move(Math.round(pos), false);
      setDrag(null);
      // Swallow the click that follows a drag so it does not select an item.
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCount, narrow, shown]);

  // In carousel mode keep the highlighted card in view when it changes without focus moving.
  useEffect(() => {
    if (narrow) buttons.current[highlight]?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [highlight, narrow]);

  const position = drag ?? highlight;
  const nearest = clamp(Math.round(position), 0, Math.max(0, itemCount - 1));
  const reach = shown === 'scenes' ? 3 : 2;

  return (
    <div
      ref={rootRef}
      className="wheel"
      data-layout={narrow ? 'carousel' : 'arc'}
      data-variant={shown}
      data-dragging={drag !== null || undefined}
      data-folded={folded || undefined}
      style={{ ['--wheel-h' as string]: position, ['--wheel-fan' as string]: folded ? 0 : 1 }}
    >
      {!narrow ? (
        <>
          <div className="wheel-dial" aria-hidden="true" />
          <div className="wheel-ring" aria-hidden="true" />
          {/* The hub is a readout, not a control: position, total and the film the wheel belongs to. */}
          <div className="wheel-hub" aria-hidden="true">
            {set.hubImage ? <HubLens src={set.hubImage} /> : null}
            <span className="wheel-readout">
              <strong>{itemCount > 0 ? pad2(nearest + 1) : '--'}</strong>
              <span>/ {pad2(itemCount)}</span>
            </span>
            <span className="wheel-unit">{set.unit}</span>
          </div>
          {/* The gate: a fixed viewfinder frame. Whatever sits inside it is what Enter will select. */}
          <div key={fired} className="wheel-gate" data-fired={fired > 0 || undefined} aria-hidden="true" />
        </>
      ) : null}
      <ul className="wheel-list" aria-label={set.label}>
        {items.map((item, i) => {
          const d = i - nearest;
          const hidden = !narrow && Math.abs(d) > reach;
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
                tabIndex={i === highlight ? 0 : -1}
                aria-current={isActive ? 'true' : undefined}
                aria-hidden={hidden || undefined}
                aria-label={`${item.label}${item.meta ? `, ${item.meta}` : ''}${isActive ? `, ${set.activeWord}` : ''}`}
                data-active={isActive || undefined}
                data-highlight={i === nearest || undefined}
                onClick={(e) => {
                  setHighlight(i);
                  setFired((n) => n + 1);
                  set.onSelect(item.id, e.currentTarget);
                }}
                onFocus={() => {
                  if (highlightRef.current !== i) setHighlight(i);
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
  return (
    <img
      className="wheel-thumb"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
