import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p: IconProps) => (
  <Base {...p} fill="currentColor" stroke="none">
    <path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2Z" />
  </Base>
);
export const PauseIcon = (p: IconProps) => (
  <Base {...p} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4" height="14" rx="1.2" />
    <rect x="14" y="5" width="4" height="14" rx="1.2" />
  </Base>
);
export const ReplayIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </Base>
);
export const SeekBackIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12a8 8 0 1 0 2.5-5.8" />
    <path d="M4 4v4.5h4.5" />
  </Base>
);
export const SeekForwardIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 12a8 8 0 1 1-2.5-5.8" />
    <path d="M20 4v4.5h-4.5" />
  </Base>
);
export const VolumeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
    <path d="M15.5 9a4 4 0 0 1 0 6" />
    <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Base>
);
export const MuteIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" />
    <path d="m16 9.5 5 5" />
    <path d="m21 9.5-5 5" />
  </Base>
);
export const CaptionsIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M10 10.2a2.2 2.2 0 1 0 0 3.6" />
    <path d="M17 10.2a2.2 2.2 0 1 0 0 3.6" />
  </Base>
);
export const SettingsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Base>
);
export const FullscreenIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Base>
);
export const ExitFullscreenIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </Base>
);
export const PipIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <rect x="12" y="11" width="6.5" height="5" rx="1" fill="currentColor" stroke="none" />
  </Base>
);
export const BookmarkIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4V5a1 1 0 0 1 1-1Z" />
  </Base>
);
export const ReturnIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Base>
);
export const HelpIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8" />
    <path d="M12 17h.01" />
  </Base>
);
export const PulseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
  </Base>
);
export const CompassIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </Base>
);
export const PlayCircleIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m10.5 8.8 4.5 3.2-4.5 3.2V8.8Z" fill="currentColor" stroke="none" />
  </Base>
);
export const ScrimIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18V3Z" fill="currentColor" stroke="none" />
  </Base>
);
export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);
export const ShareIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 15V4m0 0L8 8m4-4 4 4" />
    <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </Base>
);
export const TrashIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
  </Base>
);
export const PaletteIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.6-1.3-2.9 0-1 .8-1.7 1.9-1.7H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3Z" />
    <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="10" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </Base>
);
export const CastIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
    <path d="M3 12a8 8 0 0 1 8 8M3 16a4 4 0 0 1 4 4" />
    <path d="M3 20h.01" />
  </Base>
);
export const ClipIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <path d="M8 7.5 20 17M8 16.5 20 7" />
  </Base>
);
export const MoreIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" />
  </Base>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m15 5-7 7 7 7" />
  </Base>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m9 5 7 7-7 7" />
  </Base>
);
/** Time Lens: a loupe over a strip of frames. */
export const LensIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="2.5" y="5" width="13" height="9" rx="1.5" />
    <path d="M6.5 5v9M11.5 5v9" />
    <circle cx="16.5" cy="15.5" r="4" />
    <path d="m19.5 18.5 2.5 2.5" />
  </Base>
);
/** Scene dial. `angle` (degrees, 0 = top) points the needle at the current position in the film. */
export const DialIcon = ({ angle = 0, ...p }: IconProps & { angle?: number }) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v2M21 12h-2M12 21v-2M3 12h2" />
    <path d="M12 12 12 6.5" transform={`rotate(${angle} 12 12)`} strokeWidth="2.2" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </Base>
);
/** Film reel, for the navigation wheel. */
export const ReelIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="12" cy="7" r="1.8" />
    <circle cx="12" cy="17" r="1.8" />
    <circle cx="7" cy="12" r="1.8" />
    <circle cx="17" cy="12" r="1.8" />
  </Base>
);
