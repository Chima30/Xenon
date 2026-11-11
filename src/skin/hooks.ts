import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Keydown handling for elements inside a FloatingPanel. Panels stop key events from reaching the player's
 * hotkeys, which also hides them from React's root-level onKeyDown, so panel widgets attach a native listener
 * (it fires at the target, before the panel's listener).
 */
export function useNativeKeydown<T extends HTMLElement>(ref: RefObject<T | null>, handler: (e: KeyboardEvent) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  // No dependency list on purpose: the element often mounts after the hook (a panel that opens later), so
  // re-check every render. Attaching and removing one listener is cheap and keeps it bound to the live element.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fn = (e: KeyboardEvent) => latest.current(e);
    el.addEventListener('keydown', fn);
    return () => el.removeEventListener('keydown', fn);
  });
}

/**
 * Layout tier from the player's real container width (not the window), so an embedded player adapts
 * wherever it sits.
 *  full    >= 680px: everything in the dock
 *  compact >= 440px: labels collapse to icons
 *  tiny    >= 340px: subtitles, clip, PiP, cast and extras move into a More menu
 *  micro   <  340px: settings moves into More too; the dock keeps time, mute, More and fullscreen
 * Play/pause, seek, time, volume/mute and fullscreen are present at every tier.
 */
export type Tier = 'full' | 'compact' | 'tiny' | 'micro';

export function tierForWidth(width: number): Tier {
  return width >= 680 ? 'full' : width >= 440 ? 'compact' : width >= 340 ? 'tiny' : 'micro';
}

export function useWidthTier(ref: RefObject<HTMLElement | null>): { tier: Tier; width: number } {
  const [state, setState] = useState<{ tier: Tier; width: number }>({ tier: 'full', width: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const width = Math.round(el.getBoundingClientRect().width);
      setState((prev) => {
        const tier = tierForWidth(width);
        return prev.tier === tier && prev.width === width ? prev : { tier, width };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return state;
}
