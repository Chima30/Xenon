import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { isRecord, readJSON, writeJSON } from '../storage';

const KEY = 'slate-pos';
const GAP = 8;

/** Where the viewer put the slate, as fractions of the free area of the picture (so it survives any resize). */
export type SlatePos = { x: number; y: number } | null;
const isPos = (v: unknown): { x: number; y: number } | null =>
  isRecord(v) && typeof v.x === 'number' && typeof v.y === 'number' && v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1 ? { x: v.x, y: v.y } : null;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
/** The free area of the picture: under the top bar, above the dock, inside the frame. Coordinates are stage-relative. */
export interface Area {
  stageH: number;
  minLeft: number;
  maxLeft: number;
  minTop: number;
  maxTop: number;
  pod: Box | null;
}

/**
 * Pure placement: clamps a slate box into the free area and, if it would sit on the Playback Pod, moves it to
 * the nearest clear place (above or below the pod first, then beside it). Returns the stage-relative left/top.
 */
export function settle(want: { left: number; top: number }, size: { width: number; height: number }, a: Area): { left: number; top: number } {
  const clampX = (x: number) => Math.min(Math.max(x, a.minLeft), Math.max(a.minLeft, a.maxLeft));
  const clampY = (y: number) => Math.min(Math.max(y, a.minTop), Math.max(a.minTop, a.maxTop));
  let left = clampX(want.left);
  let top = clampY(want.top);
  const p = a.pod;
  const hits = (l: number, t: number) => !!p && l < p.left + p.width + GAP && l + size.width > p.left - GAP && t < p.top + p.height + GAP && t + size.height > p.top - GAP;
  if (p && hits(left, top)) {
    const options = [
      { left, top: p.top - GAP - size.height },
      { left, top: p.top + p.height + GAP },
      { left: p.left - GAP - size.width, top },
      { left: p.left + p.width + GAP, top },
    ]
      .map((o) => ({ left: clampX(o.left), top: clampY(o.top) }))
      .filter((o) => !hits(o.left, o.top))
      .sort((m, n) => Math.hypot(m.left - left, m.top - top) - Math.hypot(n.left - left, n.top - top));
    if (options[0]) ({ left, top } = options[0]);
  }
  return { left, top };
}

/**
 * The movable Film Slate. Dragging its grip (mouse, pen or touch) moves it with a transform, so nothing re-renders
 * while it moves; on release it settles clear of the top bar, the dock and the Playback Pod, and the position is
 * saved. With the grip focused, the arrow keys move it (Shift: further) and Home puts it back where it started.
 */
export function useMovableSlate(sectionRef: RefObject<HTMLElement | null>, gripRef: RefObject<HTMLButtonElement | null>, visible: boolean) {
  const [pos, setPos] = useState<SlatePos>(() => readJSON(KEY, isPos, null));
  const posRef = useRef(pos);
  posRef.current = pos;

  const measure = useCallback((): { a: Area; slate: Box; stage: DOMRect } | null => {
    const section = sectionRef.current;
    const stage = section?.closest('.cs-stage');
    const slate = section?.querySelector('.cs-slate');
    if (!section || !stage || !slate) return null;
    const s = stage.getBoundingClientRect();
    const sl = slate.getBoundingClientRect();
    const rel = (r: DOMRect): Box => ({ left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height });
    const top = stage.querySelector('.cs-top')?.getBoundingClientRect();
    const bottom = stage.querySelector('.cs-row')?.getBoundingClientRect();
    const pod = stage.querySelector('.cs-pod')?.getBoundingClientRect();
    const minTop = (top && top.height ? top.bottom - s.top : 0) + GAP;
    const floor = (bottom && bottom.height ? bottom.top - s.top : s.height) - GAP;
    return {
      a: { stageH: s.height, minLeft: GAP, maxLeft: s.width - sl.width - GAP, minTop, maxTop: floor - sl.height, pod: pod && pod.width ? rel(pod) : null },
      slate: rel(sl),
      stage: s,
    };
  }, [sectionRef]);

  /** Puts the slate where `pos` says, anchored by its bottom edge so the scene list still opens upwards. */
  const place = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;
    const p = posRef.current;
    if (!p) {
      section.style.removeProperty('left');
      section.style.removeProperty('bottom');
      delete section.dataset.moved;
      return;
    }
    const m = measure();
    if (!m) return;
    const want = { left: m.a.minLeft + p.x * Math.max(0, m.a.maxLeft - m.a.minLeft), top: m.a.minTop + p.y * Math.max(0, m.a.maxTop - m.a.minTop) };
    const at = settle(want, m.slate, m.a);
    section.style.left = `${at.left}px`;
    section.style.bottom = `${m.a.stageH - (at.top + m.slate.height)}px`;
    section.dataset.moved = '';
  }, [measure, sectionRef]);

  /** Settles a requested stage-relative top-left and saves it. */
  const commit = useCallback(
    (want: { left: number; top: number }) => {
      const m = measure();
      if (!m) return;
      const at = settle(want, m.slate, m.a);
      const fx = m.a.maxLeft > m.a.minLeft ? (at.left - m.a.minLeft) / (m.a.maxLeft - m.a.minLeft) : 0;
      const fy = m.a.maxTop > m.a.minTop ? (at.top - m.a.minTop) / (m.a.maxTop - m.a.minTop) : 0;
      const next = { x: Math.min(1, Math.max(0, fx)), y: Math.min(1, Math.max(0, fy)) };
      posRef.current = next;
      setPos(next);
      writeJSON(KEY, next);
      place();
    },
    [measure, place],
  );

  const reset = useCallback(() => {
    posRef.current = null;
    setPos(null);
    writeJSON(KEY, null);
    place();
  }, [place]);

  useLayoutEffect(() => {
    if (visible) place();
  }, [visible, place, pos]);

  // Follow the picture's size; follow the slate's own size (the scene list opening, a tier change).
  useEffect(() => {
    const section = sectionRef.current;
    const stage = section?.closest('.cs-stage');
    if (!visible || !section || !stage || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [visible, place, sectionRef]);

  // Grip: pointer drag and keys. Native listeners, so arrow keys never reach the player's seek hotkeys.
  useEffect(() => {
    const grip = gripRef.current;
    const section = sectionRef.current;
    if (!visible || !grip || !section) return;
    let start: { x: number; y: number; left: number; top: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const m = measure();
      if (!m) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, left: m.slate.left, top: m.slate.top };
      section.dataset.dragging = '';
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      section.style.transform = `translate(${e.clientX - start.x}px, ${e.clientY - start.y}px)`;
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const s = start;
      start = null;
      section.style.removeProperty('transform');
      delete section.dataset.dragging;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 3) return;
      commit({ left: s.left + e.clientX - s.x, top: s.top + e.clientY - s.y });
    };
    const key = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 64 : 16;
      const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (e.key === 'Home') {
        e.preventDefault();
        e.stopPropagation();
        reset();
        return;
      }
      const v = d[e.key];
      if (!v) return;
      e.preventDefault();
      e.stopPropagation();
      const m = measure();
      if (m) commit({ left: m.slate.left + v[0], top: m.slate.top + v[1] });
    };
    grip.addEventListener('pointerdown', down);
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    grip.addEventListener('keydown', key);
    grip.addEventListener('dblclick', reset);
    return () => {
      grip.removeEventListener('pointerdown', down);
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      grip.removeEventListener('keydown', key);
      grip.removeEventListener('dblclick', reset);
    };
  }, [visible, gripRef, sectionRef, measure, commit, reset]);

  return { moved: pos !== null, reset };
}
