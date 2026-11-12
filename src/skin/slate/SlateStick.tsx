import type { CSSProperties } from 'react';

/**
 * The clapstick of the slate. Its stripes are painted with the colours of the frame (darkest first), or with the
 * film's own palette until those are known. `tail` turns it upside down, the way a crew marks the end of a take.
 */
export function SlateStick({ colours, tail = false }: { colours: string[] | null; tail?: boolean }) {
  const style = colours
    ? (Object.fromEntries(colours.map((c, i) => [`--sc${i + 1}`, c])) as CSSProperties)
    : undefined;
  return (
    <div
      className="cs-slate-stick"
      data-tail={tail || undefined}
      data-frame={colours ? '' : undefined}
      style={style}
      title={colours ? `Colours of this frame: ${colours.join(' ')}` : undefined}
      aria-hidden="true"
    >
      <span className="cs-slate-hinge" />
    </div>
  );
}
