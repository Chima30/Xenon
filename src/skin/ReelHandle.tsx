import { useEffect, useState, type Ref } from 'react';

interface Props {
  open: boolean;
  onToggle: (opener: HTMLElement) => void;
  /** A still from the current film, seen through the reel's window. */
  artwork?: string | null;
  controlsId: string;
  buttonRef?: Ref<HTMLButtonElement>;
}

/**
 * The reel handle: the outer edge of the navigation wheel, always present on the left of the picture in Watch
 * mode so the instrument stays recognisable while you watch. It is a real button (Enter, Space or W opens the
 * wheel) and shrinks to a sliver while the controls are idle, so it never sits over the film in earnest.
 */
export function ReelHandle({ open, onToggle, artwork, controlsId, buttonRef }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [artwork]);
  return (
    <button
      ref={buttonRef}
      type="button"
      className="cs-reel"
      aria-expanded={open}
      aria-controls={controlsId}
      aria-label={open ? 'Close the navigation wheel' : 'Open the navigation wheel'}
      data-tip={open ? 'Close wheel (W)' : 'Navigation wheel (W)'}
      data-tip-pos="right"
      onClick={(e) => onToggle(e.currentTarget)}
    >
      <span className="cs-reel-body" aria-hidden="true">
        <span className="cs-reel-window">{artwork && !failed ? <img src={artwork} alt="" draggable={false} onError={() => setFailed(true)} /> : null}</span>
        <span className="cs-reel-teeth" />
        <span className="cs-reel-led" />
      </span>
    </button>
  );
}
