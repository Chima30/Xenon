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

interface WheelProps {
  items: WheelItem[];
  /** The item that is currently playing / active. */
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Accessible name for the list, e.g. "Films". */
  label: string;
  /** Word used in the active badge, e.g. "Playing" or "Current". */
  activeWord: string;
}

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', ' ', 'Enter']);

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

export function NavigationWheel({ items, activeId, onSelect, label, activeWord }: WheelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const narrow = useNarrow(rootRef);

  const activeIndex = Math.max(
    0,
    items.findIndex((i) => i.id === activeId),
  );
  // "highlight" is where the wheel is pointing. Moving it never selects or seeks anything.
  const [highlight, setHighlight] = useState(activeIndex);
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;
  const itemCount = items.length;

  // Re-point at the active item when the list or the active item changes (e.g. Movies <-> Scenes).
  useEffect(() => {
    setHighlight(activeIndex);
  }, [activeIndex, itemCount]);

  const move = (next: number, focus: boolean) => {
    const i = clamp(next, 0, Math.max(0, itemCount - 1));
    setHighlight(i);
    highlightRef.current = i;
    // Focus after render: items outside the visible arc are visibility:hidden until the wheel turns.
    if (focus) pendingFocus.current = true;
  };
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (pendingFocus.current) {
      pendingFocus.current = false;
      buttons.current[highlight]?.focus();
    }
  }, [highlight]);

  // Native listeners: React's synthetic events fire after the player's own hotkey listener,
  // so arrow keys would seek/change volume. Stopping propagation here gives the wheel ownership.
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

    // Drag (mouse or touch) along the arc.
    let startY = 0;
    let startIndex = 0;
    let dragging = false;
    const STEP = 56;
    const onDown = (e: PointerEvent) => {
      if (narrow || (e.pointerType === 'mouse' && e.button !== 0)) return;
      startY = e.clientY;
      startIndex = highlightRef.current;
      dragging = false;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
      window.addEventListener('pointercancel', onUp, { once: true });
    };
    const onMove = (e: PointerEvent) => {
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 8) dragging = true;
      if (dragging) move(startIndex - Math.round(dy / STEP), false);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      if (dragging) {
        // Swallow the click that follows a drag so it does not select an item.
        const swallow = (ev: Event) => ev.stopPropagation();
        root.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => root.removeEventListener('click', swallow, { capture: true }), 0);
      }
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
  }, [itemCount, narrow]);

  // In carousel mode keep the highlighted card in view when it changes without focus moving.
  useEffect(() => {
    if (narrow) buttons.current[highlight]?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [highlight, narrow]);

  return (
    <div
      ref={rootRef}
      className="wheel"
      data-layout={narrow ? 'carousel' : 'arc'}
      style={{ ['--h' as string]: highlight }}
    >
      {!narrow ? <div className="wheel-dial" aria-hidden="true" /> : null}
      <ul className="wheel-list" aria-label={label}>
        {items.map((item, i) => {
          const d = i - highlight;
          const hidden = !narrow && Math.abs(d) > 2;
          const isActive = item.id === activeId;
          return (
            <li key={item.id} className="wheel-li" data-d={narrow ? 0 : clamp(d, -3, 3)} data-hidden={hidden || undefined}>
              <button
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                type="button"
                className="wheel-item"
                tabIndex={i === highlight ? 0 : -1}
                aria-current={isActive ? 'true' : undefined}
                aria-hidden={hidden || undefined}
                aria-label={`${item.label}${item.meta ? `, ${item.meta}` : ''}${isActive ? `, ${activeWord}` : ''}`}
                data-active={isActive || undefined}
                data-highlight={i === highlight || undefined}
                onClick={() => {
                  setHighlight(i);
                  onSelect(item.id);
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
                {isActive ? <span className="wheel-badge">{activeWord}</span> : null}
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
