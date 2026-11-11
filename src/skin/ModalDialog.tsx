import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Accessible modal built on the native <dialog>: showModal() gives a real focus trap,
 * makes the rest of the page inert, and closes on Escape. We additionally restore focus
 * to whatever opened it, and stop key events from reaching the player's hotkeys.
 */
export function ModalDialog({ open, onClose, title, children, className }: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const stop = (e: KeyboardEvent) => {
      // Keep player hotkeys (Space, arrows, F, M...) from firing while a dialog is open.
      e.stopPropagation();
    };
    const handleClose = () => {
      onClose();
      const target = opener.current;
      if (target && target.isConnected) target.focus();
    };
    dialog.addEventListener('keydown', stop);
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('keydown', stop);
      dialog.removeEventListener('close', handleClose);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={`cs-dialog ${className ?? ''}`}
      aria-labelledby={titleId}
      aria-modal="true"
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself) closes.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cs-dialog-inner">
        <header className="cs-dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="cs-icon-btn" onClick={onClose} aria-label="Close dialog">
            <CloseIcon />
          </button>
        </header>
        {/* Focusable so keyboard users can scroll long content. */}
        <div className="cs-dialog-body" tabIndex={0} role="group" aria-labelledby={titleId}>
          {open ? children : null}
        </div>
      </div>
    </dialog>
  );
}
