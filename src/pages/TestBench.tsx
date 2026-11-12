import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { PlayerPage } from './PlayerPage';

/**
 * Demo-site testing tools: player-size presets and footage simulation. They live here, not in the skin, so
 * judges can test responsiveness and contrast while the skin stays a clean standalone player.
 *
 * Size changes resize the real container (CSS width), so the skin's container-based layout responds;
 * nothing is scaled with transforms. The footage overlay is passed to the skin as a layer between the video
 * and its controls, so it never touches controls, captions, focus rings or menus. Neither control remounts
 * the player, so playback continues through every change.
 */

type SizeId = 'desktop' | 'tablet' | 'phone' | 'tiny';
type FootageId = 'default' | 'white' | 'dark' | 'contrast';

const SIZES: { id: SizeId; label: string; width: number | null; hint: string }[] = [
  { id: 'desktop', label: 'Desktop', width: null, hint: 'Full available width' },
  { id: 'tablet', label: 'Tablet', width: 768, hint: '768 px wide' },
  { id: 'phone', label: 'Phone', width: 390, hint: '390 px wide' },
  { id: 'tiny', label: 'Tiny', width: 300, hint: '300 px wide, like a small embed' },
];

const FOOTAGE: { id: FootageId; label: string; text: string }[] = [
  { id: 'default', label: 'Default', text: 'The video is shown normally.' },
  {
    id: 'white',
    label: 'Wash to White',
    text: 'A strong white layer over the video only, to simulate extremely bright footage. Controls, captions, menus and focus rings stay on top, so check they remain readable.',
  },
  {
    id: 'dark',
    label: 'Dark Footage',
    text: 'A dark layer over the video only, to simulate low-light scenes. Check that icons, the progress bar and focus rings still stand out.',
  },
  {
    id: 'contrast',
    label: 'High Contrast Test',
    text: 'Previews the strongest readable styling: solid black control surfaces, white borders and thick focus rings. Your saved preferences are not changed.',
  },
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.id === value);
    let next = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else return;
    e.preventDefault();
    const target = options[next];
    if (target) {
      onChange(target.id);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className="seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o, i) => (
        <button
          key={o.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          tabIndex={value === o.id ? 0 : -1}
          title={o.hint}
          className="seg-btn"
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TestBench({ filmId, startTime, endTime }: { filmId?: string; startTime?: number; endTime?: number }) {
  const [size, setSize] = useState<SizeId>('desktop');
  const [footage, setFootage] = useState<FootageId>('default');
  const frameRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  // The lab is a demo tool, so it starts folded away below the player; its state is remembered for the session.
  const [labOpen, setLabOpen] = useState(() => {
    try {
      return sessionStorage.getItem('xenon-lab-open') === '1';
    } catch {
      return false;
    }
  });
  const toggleLab = () =>
    setLabOpen((o) => {
      try {
        sessionStorage.setItem('xenon-lab-open', o ? '0' : '1');
      } catch {
        /* storage unavailable: the lab still works for this page view */
      }
      return !o;
    });

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setMeasured(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const preset = SIZES.find((s) => s.id === size);
  const mode = FOOTAGE.find((f) => f.id === footage);
  const isDefault = size === 'desktop' && footage === 'default';

  return (
    <div className="bench-wrap">
      <div
        ref={frameRef}
        className="bench-frame"
        data-size={size}
        style={{ width: preset?.width ? `min(100%, ${preset.width}px)` : '100%' }}
      >
        <PlayerPage
          filmId={filmId}
          startTime={startTime}
          endTime={endTime}
          bench={{
            forceHighContrast: footage === 'contrast',
            overlay:
              footage === 'white' || footage === 'dark' ? <div className="bench-overlay" data-footage={footage} /> : undefined,
          }}
        />
      </div>

      {/* XENON Test Lab: demo-page tooling only. The reusable skin knows nothing about it. */}
      <section className="lab" aria-labelledby="lab-title" data-open={labOpen || undefined}>
        <button type="button" className="lab-toggle" aria-expanded={labOpen} aria-controls="lab-body" onClick={toggleLab}>
          <span className="lab-mark" aria-hidden="true" />
          <span id="lab-title" className="lab-title">
            XENON Test Lab
          </span>
          <span className="lab-summary">
            {preset?.label} · {mode?.label}
            {measured ? ` · ${measured} px` : ''}
          </span>
          <span className="lab-chevron" aria-hidden="true" />
        </button>
      <div id="lab-body" className="bench" hidden={!labOpen}>
        <div className="bench-group">
          <span className="bench-label">Player size</span>
          <Segmented label="Player size" value={size} options={SIZES} onChange={setSize} />
          <span className="bench-readout" role="status">
            {preset?.hint}
            {measured ? ` · now ${measured} px` : ''}
          </span>
        </div>
        <div className="bench-group">
          <span className="bench-label">Footage test</span>
          <Segmented label="Footage test" value={footage} options={FOOTAGE} onChange={setFootage} />
          <button
            type="button"
            className="bench-reset"
            onClick={() => {
              setSize('desktop');
              setFootage('default');
            }}
            disabled={isDefault}
          >
            Reset
          </button>
        </div>
        <p className="bench-note" role="status">
          <strong>{mode?.label}.</strong> {mode?.text}
        </p>
      </div>
      </section>
    </div>
  );
}
