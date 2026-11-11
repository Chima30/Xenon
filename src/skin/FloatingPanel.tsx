import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons';

interface FloatingPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Wider variant for the transcript. */
  wide?: boolean;
  /** Element that opened the panel; focus returns here on close. */
  returnFocusTo?: HTMLElement | null;
}

/**
 * A non-modal floating panel anchored over the video. Moves focus in on open, closes on Escape
 * or an outside press, and gives focus back. Keys typed inside never reach the player hotkeys
 * (so Space on a button or arrows in a slider do not pause or seek the video).
 */
export function FloatingPanel({ open, onClose, title, children, wide, returnFocusTo }: FloatingPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const returnRef = useRef(returnFocusTo);
  returnRef.current = returnFocusTo;

  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    // Focus the panel itself so a screen reader announces its title, then Tab walks the controls.
    el.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || el.contains(t)) return;
      // Presses on a panel toggle are handled by the toggle itself.
      if (t instanceof Element && t.closest('[data-panel-toggle]')) return;
      closeRef.current();
    };
    // Escape must close the panel even when focus has drifted elsewhere (for example after clicking the video).
    // A modal dialog on top handles its own Escape, so leave that alone.
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
      closeRef.current();
    };
    el.addEventListener('keydown', onKey);
    document.addEventListener('keydown', onDocKey);
    document.addEventListener('pointerdown', onPointerDown, true);
    const opener = returnRef.current;
    return () => {
      el.removeEventListener('keydown', onKey);
      document.removeEventListener('keydown', onDocKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      className="cs-panel"
      data-wide={wide || undefined}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header className="cs-panel-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="cs-icon-btn" onClick={onClose} aria-label={`Close ${title}`}>
          <CloseIcon />
        </button>
      </header>
      <div className="cs-panel-body">{children}</div>
    </div>
  );
}
