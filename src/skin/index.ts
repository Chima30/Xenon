/**
 * Public surface of the reusable skin. Nothing in this folder imports from the demo catalog,
 * so `<CinemaSkin><Video src="..." /></CinemaSkin>` works for a single video with no metadata.
 */
export { CinemaSkin, useCinemaSkin } from './CinemaSkin';
export type { CinemaSkinProps, SkinMode, TimelineMarker } from './CinemaSkin';
export { KeymapDialog, SHORTCUTS } from './KeymapDialog';
export { DiagnosticsDialog, DiagnosticsBody } from './DiagnosticsDialog';
export type { DiagRow, DiagStatus } from './DiagnosticsDialog';
export { ModalDialog } from './ModalDialog';
export { formatTime, speakTime, clamp } from './format';
export { readJSON, writeJSON, isRecord, loadPrefs, savePrefs, SCRIM_MODES } from './storage';
export type { ScrimMode, Prefs } from './storage';
export { usePrefs } from './prefs/PrefsContext';
export type { Tier } from './hooks';
