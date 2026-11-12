/**
 * Public surface of the reusable skin. Nothing in this folder imports from the demo catalog,
 * so `<CinemaSkin><Video src="..." /></CinemaSkin>` works for a single video with no metadata.
 */
export { CinemaSkin, useCinemaSkin } from './CinemaSkin';
export type { CinemaSkinProps, PortalRequest, SkinMode, SkinScene, TimelineMarker, ScenePreview, ThumbnailAt } from './CinemaSkin';
export type { ResolvedAtmosphere, SkinPalette } from './appearance/AppearanceContext';
export { TimePortal } from './TimePortal';
export type { PortalStop } from './TimePortal';
export { sceneIndexAt } from './scenes';
export { KeymapDialog, SHORTCUTS } from './KeymapDialog';
export { DiagnosticsDialog, DiagnosticsBody } from './DiagnosticsDialog';
export type { DiagRow, DiagStatus } from './DiagnosticsDialog';
export { ModalDialog } from './ModalDialog';
export { formatTime, speakTime, clamp } from './format';
export { readJSON, writeJSON, isRecord, loadPrefs, savePrefs, SCRIM_MODES } from './storage';
export type { ScrimMode, Prefs } from './storage';
export { usePrefs } from './prefs/PrefsContext';
export type { Tier } from './hooks';
