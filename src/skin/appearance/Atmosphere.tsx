import { useAppearance } from './AppearanceContext';

/**
 * Background layers behind the interface. They sit under the layout (z-index 0) and are the only elements
 * that blur or tint, so the video, which lives above them in its own opaque-or-transparent stage, is never filtered.
 */
export function Atmosphere() {
  const { derived, appearance } = useAppearance();
  // Solid (the default): one clean film colour, nothing layered on it.
  if (appearance.background === 'solid') return <div className="cs-atmosphere" data-solid aria-hidden="true" />;
  // Spectral: the Living Lightfield (the film's glow and secondary light, slowly drifting) and no image.
  if (!derived.active) {
    return (
      <div className="cs-atmosphere" data-light-only aria-hidden="true">
        <div className="cs-atm-light" />
      </div>
    );
  }
  // Artwork or Custom: the viewer's chosen image or colour, tinted and scrimmed.
  return (
    <div className="cs-atmosphere" aria-hidden="true">
      <div className="cs-atm-light" />
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
