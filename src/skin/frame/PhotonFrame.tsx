const CORNERS = ['tl', 'tr', 'br', 'bl'] as const;

/**
 * XENON Photon Frame: the housing of the instrument. A thin machined rim follows the player's own radius, and four
 * optical corner markers (a bracket on the rim and a small lens index inside it) carry the film's light.
 *
 * It is pure decoration drawn at the very edge: aria-hidden, no pointer events, nothing over the picture's
 * content. Every state is CSS on attributes the skin already sets (data-playback, data-mode, :fullscreen) plus
 * `flash`, so nothing animates continuously and no JavaScript runs per frame:
 *   playing   minimal: a neutral rim, corners at rest
 *   paused    the corners light in turn (a short pause-to-freeze pass) and stay softly lit
 *   saved     a brief lavender pulse, the Moment Atlas colour, confirming the save
 *   explore   the seam to the navigation wheel is lit; the wheel's coupler meets it
 *   switching the frame's colours glide to the new film's palette
 *   fullscreen the decoration steps aside for the picture
 */
export function PhotonFrame({ flash }: { flash: number }) {
  return (
    <div className="cs-photon" aria-hidden="true" data-flash={flash > 0 ? (flash % 2 ? 'a' : 'b') : undefined}>
      <span className="cs-photon-rim" />
      {CORNERS.map((c) => (
        <span key={c} className="cs-photon-corner" data-corner={c}>
          <span className="cs-photon-lens" />
        </span>
      ))}
    </div>
  );
}
