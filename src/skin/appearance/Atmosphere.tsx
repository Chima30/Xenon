import { useAppearance } from './AppearanceContext';

/**
 * Background layers behind the interface. They sit under the layout (z-index 0) and are the only elements
 * that blur or tint, so the video, which lives above them in its own opaque-or-transparent stage, is never filtered.
 */
export function Atmosphere() {
  const { derived, appearance } = useAppearance();
  if (!derived.active) return null;
  return (
    <div className="cs-atmosphere" aria-hidden="true">
      {appearance.source === 'color' ? (
        <div className="cs-atm-color" />
      ) : derived.imageUrl ? (
        // Keyed by URL so a new film's artwork fades in instead of snapping.
        <div key={derived.imageUrl} className="cs-atm-art" />
      ) : null}
      <div className="cs-atm-glow" />
      <div className="cs-atm-scrim" />
    </div>
  );
}
