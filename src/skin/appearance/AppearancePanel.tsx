import { useRef, useState, type ReactNode } from 'react';
import { FloatingPanel } from '../FloatingPanel';
import { parseHex, toHex } from './color';
import { DEFAULT_APPEARANCE, useAppearance, type AccentChoice, type BgSource, type PanelArea, type PanelStyle } from './AppearanceContext';

interface Props {
  open: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}

const SOURCES: { id: BgSource; label: string }[] = [
  { id: 'poster', label: 'Film artwork' },
  { id: 'color', label: 'Solid colour' },
  { id: 'custom', label: 'My image' },
];
const ACCENTS: { id: AccentChoice; label: string }[] = [
  { id: 'default', label: 'Citron' },
  { id: 'poster', label: 'From artwork' },
  { id: 'lavender', label: 'Lavender' },
  { id: 'teal', label: 'Teal' },
  { id: 'rose', label: 'Rose' },
  { id: 'custom', label: 'Custom' },
];
const COLOR_SWATCHES = [
  { hex: '#1f3b57', name: 'Deep blue' },
  { hex: '#2b4a3a', name: 'Forest' },
  { hex: '#4a2b3f', name: 'Plum' },
  { hex: '#5a3a1f', name: 'Amber' },
  { hex: '#3a3f4a', name: 'Slate' },
];
const AREAS: { id: PanelArea; label: string }[] = [
  { id: 'header', label: 'Header buttons' },
  { id: 'wheel', label: 'Wheel and side panels' },
  { id: 'controls', label: 'Control bar' },
];
const STYLES: { id: PanelStyle; label: string }[] = [
  { id: 'glass', label: 'Glass' },
  { id: 'solid', label: 'Solid' },
  { id: 'clear', label: 'Clear' },
];

function Range({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="cs-range">
      <span>
        {label}: <strong>{value}{unit}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-valuetext={`${value}${unit === '%' ? ' percent' : ' pixels'}`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="cs-fieldset">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

export function AppearancePanel({ open, onClose, returnFocusTo }: Props) {
  const ap = useAppearance();
  const { appearance: a, derived } = ap;
  const fileRef = useRef<HTMLInputElement>(null);
  const [presetName, setPresetName] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [hexText, setHexText] = useState(a.color);
  const [accentText, setAccentText] = useState(a.customAccent);

  const commitHex = (text: string, apply: (hex: string) => void, fail: string) => {
    const rgb = parseHex(text);
    if (!rgb) {
      setMsg({ kind: 'error', text: fail });
      return;
    }
    setMsg(null);
    apply(toHex(rgb));
  };

  return (
    <FloatingPanel open={open} onClose={onClose} title="Appearance studio" wide returnFocusTo={returnFocusTo}>
      <section className="cs-card">
        <button
          type="button"
          role="switch"
          aria-checked={a.enabled}
          className="cs-switch"
          onClick={() => ap.update({ enabled: !a.enabled })}
        >
          <span>
            <strong>Adaptive atmosphere</strong>
            <span className="cs-muted">Tints the surroundings with the selected film's artwork. The video is never touched.</span>
          </span>
          <span className="cs-switch-state">{a.enabled ? 'On' : 'Off'}</span>
        </button>
      </section>

      {a.enabled ? (
        <>
          <section className="cs-card">
            <Group title="Background">
              <div className="cs-chips">
                {SOURCES.map((s) => (
                  <button key={s.id} type="button" className="cs-chip" aria-pressed={a.source === s.id} onClick={() => ap.update({ source: s.id })}>
                    {s.label}
                  </button>
                ))}
              </div>
              {a.source === 'color' ? (
                <div className="cs-form">
                  <div className="cs-chips">
                    {COLOR_SWATCHES.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        className="cs-chip cs-swatch"
                        aria-pressed={a.color.toLowerCase() === c.hex}
                        onClick={() => {
                          setHexText(c.hex);
                          ap.update({ color: c.hex });
                        }}
                      >
                        <span className="cs-swatch-dot" style={{ background: c.hex }} aria-hidden="true" />
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <label>
                    Colour (hex, for example #1f3b57)
                    <input
                      value={hexText}
                      maxLength={7}
                      onChange={(e) => {
                        setHexText(e.target.value);
                        // Apply as soon as it is a complete colour so the preview stays live.
                        const rgb = parseHex(e.target.value);
                        if (rgb && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(e.target.value.trim())) {
                          setMsg(null);
                          ap.update({ color: toHex(rgb) });
                        }
                      }}
                      onBlur={() => commitHex(hexText, (h) => ap.update({ color: h }), 'Use a hex colour like #1f3b57.')}
                    />
                  </label>
                </div>
              ) : null}
              {a.source === 'custom' ? (
                <div className="cs-form">
                  <div className="cs-chips">
                    <button type="button" className="cs-chip" onClick={() => fileRef.current?.click()}>
                      Choose image
                    </button>
                    {a.customImage ? (
                      <button type="button" className="cs-chip" onClick={() => ap.update({ customImage: null })}>
                        Remove image
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="cs-sr"
                    tabIndex={-1}
                    aria-label="Background image file"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      const err = await ap.setCustomImageFromFile(f);
                      setMsg(err ? { kind: 'error', text: err } : { kind: 'ok', text: 'Image added. It is resized and kept in this browser only.' });
                    }}
                  />
                  {!a.customImage ? <p className="cs-muted">No image yet. Until you pick one, a plain dark background is used.</p> : null}
                </div>
              ) : null}
            </Group>
          </section>

          <section className="cs-card">
            <Range label="Artwork opacity" value={a.opacity} min={0} max={100} unit="%" onChange={(v) => ap.update({ opacity: v })} />
            <Range label="Blur" value={a.blur} min={0} max={60} unit="px" onChange={(v) => ap.update({ blur: v })} />
            <Range label="Ambient light" value={a.ambient} min={0} max={100} unit="%" onChange={(v) => ap.update({ ambient: v })} />
          </section>

          <section className="cs-card">
            <Group title="Accent colour">
              <div className="cs-chips">
                {ACCENTS.map((c) => (
                  <button key={c.id} type="button" className="cs-chip" aria-pressed={a.accent === c.id} onClick={() => ap.update({ accent: c.id })}>
                    {c.label}
                  </button>
                ))}
              </div>
              {a.accent === 'custom' ? (
                <label className="cs-form">
                  Accent (hex)
                  <input
                    value={accentText}
                    maxLength={7}
                    onChange={(e) => {
                      setAccentText(e.target.value);
                      const rgb = parseHex(e.target.value);
                      if (rgb) {
                        setMsg(null);
                        ap.update({ customAccent: toHex(rgb) });
                      }
                    }}
                    onBlur={() => commitHex(accentText, (h) => ap.update({ customAccent: h }), 'Use a hex colour like #ff7a59.')}
                  />
                </label>
              ) : null}
              <p className="cs-muted" role="status">
                Accent contrast on panels: {derived.accent.ratio.toFixed(1)}:1.{' '}
                {derived.accent.fellBack
                  ? 'That colour could not be made readable, so the default accent is used.'
                  : derived.accent.adjusted
                    ? 'Lightened slightly to stay readable.'
                    : 'Meets the 4.5:1 minimum.'}
              </p>
            </Group>
          </section>

          <section className="cs-card">
            <Group title="Text contrast">
              <div className="cs-chips">
                {(['normal', 'high'] as const).map((c) => (
                  <button key={c} type="button" className="cs-chip" aria-pressed={a.contrast === c} onClick={() => ap.update({ contrast: c })}>
                    {c === 'normal' ? 'Normal' : 'High'}
                  </button>
                ))}
              </div>
              <p className="cs-muted" role="status">
                Body text on the background: {derived.textRatio.toFixed(1)}:1 (target {a.contrast === 'high' ? '7' : '4.5'}:1). The
                background is darkened as needed to reach it, even if you raise the opacity.
              </p>
            </Group>
          </section>

          <section className="cs-card">
            <Group title="Panel style">
              {AREAS.map((area) => (
                <div key={area.id} className="cs-arearow" role="group" aria-label={area.label}>
                  <span>{area.label}</span>
                  <div className="cs-chips">
                    {STYLES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="cs-chip"
                        aria-pressed={a.panels[area.id] === s.id}
                        aria-label={`${area.label}: ${s.label}`}
                        onClick={() => ap.updatePanel(area.id, s.id)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Group>
          </section>

          <section className="cs-card">
            <h3 className="cs-card-title">Colours from the artwork</h3>
            <p className="cs-muted" role="status">
              {derived.paletteStatus === 'loading' ? 'Reading colours…' : derived.note}
            </p>
            {derived.palette ? (
              <div className="cs-palette" aria-label="Extracted colours">
                {[
                  { name: 'Surface tint', c: derived.palette.tint },
                  { name: 'Dominant', c: derived.palette.dominant },
                  { name: 'Safe accent', c: derived.palette.accent.color },
                ].map((p) => (
                  <span key={p.name} className="cs-palette-item">
                    <span className="cs-swatch-dot cs-swatch-lg" style={{ background: toHex(p.c) }} aria-hidden="true" />
                    {p.name} <code>{toHex(p.c)}</code>
                  </span>
                ))}
              </div>
            ) : null}
            {ap.artworkLabel && a.source === 'poster' ? <p className="cs-muted">Artwork: {ap.artworkLabel}</p> : null}
          </section>

          <section className="cs-card">
            <h3 className="cs-card-title">Presets</h3>
            <div className="cs-timefield">
              <label>
                Preset name
                <input value={presetName} maxLength={30} onChange={(e) => setPresetName(e.target.value)} placeholder="e.g. Night mode" />
              </label>
              <button
                type="button"
                className="cs-chip"
                onClick={() => {
                  const err = ap.savePreset(presetName);
                  setMsg(err ? { kind: 'error', text: err } : { kind: 'ok', text: `Saved “${presetName.trim()}”.` });
                  if (!err) setPresetName('');
                }}
              >
                Save preset
              </button>
            </div>
            {ap.presets.length > 0 ? (
              <ul className="cs-list">
                {ap.presets.map((p) => (
                  <li key={p.id} className="cs-list-row">
                    <button
                      type="button"
                      className="cs-choice"
                      onClick={() => {
                        ap.applyPreset(p.id);
                        setMsg({ kind: 'ok', text: `Applied “${p.name}”.` });
                      }}
                    >
                      {p.name}
                    </button>
                    <button type="button" className="cs-chip" onClick={() => ap.deletePreset(p.id)} aria-label={`Delete preset ${p.name}`}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cs-muted">No presets yet. Presets store these settings but not a custom image.</p>
            )}
          </section>
        </>
      ) : (
        <p className="cs-muted">
          Off: the skin keeps its plain dark look. Turn it on to try backgrounds, accents and panel styles; your choices are
          remembered either way.
        </p>
      )}

      {msg ? (
        <p className="cs-form-msg" data-kind={msg.kind} role={msg.kind === 'error' ? 'alert' : 'status'}>
          {msg.text}
        </p>
      ) : null}
      {!ap.persisted ? <p className="cs-form-msg" data-kind="error" role="alert">Your browser would not save these settings; they last until you close the tab.</p> : null}
      <button
        type="button"
        className="cs-chip"
        onClick={() => {
          ap.reset();
          setHexText(DEFAULT_APPEARANCE.color);
          setAccentText(DEFAULT_APPEARANCE.customAccent);
          setMsg({ kind: 'ok', text: 'Appearance reset to the default, with the atmosphere off.' });
        }}
      >
        Reset appearance
      </button>
    </FloatingPanel>
  );
}
