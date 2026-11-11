import { VERSION, useMedia } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import { ModalDialog } from './ModalDialog';
import { formatTime } from './format';

export type DiagStatus = 'Pass' | 'Needs review' | 'Unavailable';
export interface DiagRow {
  label: string;
  status: DiagStatus;
  detail: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Host-specific rows (for example whether a Mux playback ID is configured). */
  extraRows?: DiagRow[];
}

/**
 * "Player Health": reads real player state. It reports what it can observe and says so when
 * it cannot. It does not, and cannot, certify WCAG compliance.
 */
export function DiagnosticsDialog({ open, onClose, extraRows = [] }: Props) {
  return (
    <ModalDialog open={open} onClose={onClose} title="Player health">
      <DiagnosticsBody extraRows={extraRows} />
    </ModalDialog>
  );
}

function DiagnosticsBody({ extraRows }: { extraRows: DiagRow[] }) {
  const error = usePlayer((s) => s.error);
  const canPlay = usePlayer((s) => s.canPlay);
  const currentSrc = usePlayer((s) => s.currentSrc);
  const duration = usePlayer((s) => s.duration);
  const rate = usePlayer((s) => s.playbackRate);
  const tracks = usePlayer((s) => s.textTrackList);
  const media = useMedia() as Partial<HTMLVideoElement> | null;

  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const forced = typeof window !== 'undefined' && window.matchMedia?.('(forced-colors: active)').matches === true;
  const width = media?.videoWidth ?? 0;
  const height = media?.videoHeight ?? 0;

  const rows: DiagRow[] = [
    { label: 'Video.js', status: 'Pass', detail: `@videojs/react ${VERSION}` },
    {
      label: 'Media source',
      status: currentSrc ? 'Pass' : 'Unavailable',
      detail: currentSrc || 'No source loaded yet',
    },
    {
      label: 'Playback error',
      status: error ? 'Needs review' : 'Pass',
      detail: error ? `Code ${error.code}: ${error.message}` : 'No media error reported',
    },
    {
      label: 'Ready to play',
      status: canPlay ? 'Pass' : 'Needs review',
      detail: canPlay ? 'Enough data is loaded to start' : 'Still loading, or the source failed',
    },
    {
      label: 'Duration',
      status: duration > 0 ? 'Pass' : 'Unavailable',
      detail: duration > 0 ? formatTime(duration) : 'Not known yet (metadata not loaded)',
    },
    {
      label: 'Video dimensions',
      status: width > 0 ? 'Pass' : 'Unavailable',
      detail: width > 0 ? `${width} × ${height} pixels decoded` : 'Not reported by the media element',
    },
    { label: 'Playback speed', status: 'Pass', detail: `${rate}×` },
    {
      label: 'Text tracks',
      status: tracks.length > 0 ? 'Pass' : 'Unavailable',
      detail:
        tracks.length > 0
          ? `${tracks.length} track${tracks.length === 1 ? '' : 's'} on this media`
          : 'This film has no captions, subtitles or chapters track',
    },
    {
      label: 'Reduced motion',
      status: 'Pass',
      detail: reduced ? 'Requested by your system: spin and zoom effects are off' : 'Not requested',
    },
    {
      label: 'Forced colors',
      status: 'Pass',
      detail: forced ? 'Active: system colors are used for controls' : 'Not active',
    },
    ...extraRows,
  ];

  return (
    <>
      <ul className="cs-diag-list">
        {rows.map((r) => (
          <li key={r.label} className="cs-diag-row" data-status={r.status}>
            <span className="cs-diag-label">{r.label}</span>
            <span className="cs-diag-status">{r.status}</span>
            <span className="cs-diag-detail">{r.detail}</span>
          </li>
        ))}
      </ul>
      <p className="cs-muted">
        These are live readings from the player, not a compliance certificate. Keyboard and screen reader behavior
        still needs manual testing.
      </p>
    </>
  );
}
