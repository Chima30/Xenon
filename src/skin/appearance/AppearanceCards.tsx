import { useRef, useState } from 'react';
import { Card, Empty, Pill, Pills, SwitchRow } from '../ui';
import { parseHex, toHex } from './color';
import {
  DEFAULT_APPEARANCE,
  useAppearance,
  type AccentChoice,
  type BgSource,
  type PanelArea,
  type PanelStyle,
} from './AppearanceContext';

const SOURCES: { id: BgSource; label: string }[] = [
  { id: 'poster', label: 'Film artwork' },
  { id: 'color', label: 'Solid colour' },
  { id: 'custom', label: 'My image' },
];
const ACCENTS: { id: AccentChoice; label: string }[] = [
  { id: 'default', label: 'Film' },
  { id: 'citron', label: 'Citron' },
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
  { id: 'controls', label: 'Control dock' },
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

/** Adaptive movie atmosphere: the master switch and, when on, every control for it. */
export function AppearanceCards() {
  const ap = useAppearance();
  const { appearance: a, derived } = ap;
  const fileRef = useRef<HTMLInputElement>(null);
  const [presetName, setPresetName] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [hexText, setHexText] = useState(a.color);
  const [accentText, setAccentText] = useState(a.customAccent);
  const [panelText, setPanelText] = useState(a.panelColor ?? '#14161f');
  const film = ap.filmPalette;

  const commitHex = (text: string, apply: (hex: string) => void, fail: string) => {
    const rgb = parseHex(text);
    if (!rgb) return setMsg({ kind: 'error', text: fail });
    setMsg(null);
    apply(toHex(rgb));
  };

  return (
    <>
      <Card title="Theme" description="Adaptive re-colours the whole player for each film. Fixed keeps one look for every film.">
        <Pills label="Theme">
          {(['adaptive', 'fixed'] as const).map((t) => (
            <Pill key={t} selected={a.theme === t} onClick={() => ap.update({ theme: t })}>
              {t === 'adaptive' ? 'Adaptive' : 'Fixed'}
            </Pill>
          ))}
        </Pills>
        {a.theme === 'adaptive' && film ? (
          <div className="cs-palette" aria-label="This film's palette">
            {[
              { name: 'Surface', c: film.base },
              { name: 'Accent', c: film.accent },
              { name: 'Text', c: film.ink },
              { name: 'Light', c: film.secondary },
            ]
              .filter((p): p is { name: string; c: string } => Boolean(p.c))
              .map((p) => (
                <span key={p.name} className="cs-palette-item">
                  <span className="cs-swatch-dot cs-swatch-lg" style={{ background: p.c }} aria-hidden="true" />
                  {p.name} <code>{p.c}</code>
                </span>
              ))}
          </div>
        ) : (
          <p className="cs-card-desc">{a.theme === 'fixed' ? 'Fixed: XENON obsidian with your accent choice.' : 'This video has no signature palette; colours come from its artwork when it can be read.'}</p>
        )}
        <SwitchRow
          label="Film artwork behind the player"
          description={a.enabled ? 'On: a blurred, darkened still sits behind the interface. The video itself is never tinted.' : 'Off: plain surfaces only.'}
          checked={a.enabled}
          onChange={(v) => ap.update({ enabled: v })}
        />
      </Card>

      <Card title="Accent and panel colour" description="Accents always pass a 4.5:1 contrast check before they are used.">
        <Pills label="Accent colour">
          {ACCENTS.map((c) => (
            <Pill key={c.id} selected={a.accent === c.id} onClick={() => ap.update({ accent: c.id })}>
              {c.label}
            </Pill>
          ))}
        </Pills>
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
        <p className="cs-card-desc" role="status">
          Contrast on panels: {derived.accent.ratio.toFixed(1)}:1.{' '}
          {derived.accent.fellBack
            ? 'That colour could not be made readable, so the default accent is used.'
            : derived.accent.adjusted
              ? 'Lightened slightly to stay readable.'
              : 'Meets the 4.5:1 minimum.'}
        </p>
        <Pills label="Panel colour">
          <Pill selected={a.panelColor === null} onClick={() => ap.update({ panelColor: null })}>
            {a.theme === 'adaptive' ? 'Film' : 'XENON'}
          </Pill>
          <Pill selected={a.panelColor !== null} onClick={() => ap.update({ panelColor: parseHex(panelText) ? toHex(parseHex(panelText)!) : '#14161f' })}>
            Custom
          </Pill>
        </Pills>
        {a.panelColor !== null ? (
          <label className="cs-form">
            Panel colour (hex, keep it dark)
            <input
              value={panelText}
              maxLength={7}
              onChange={(e) => {
                setPanelText(e.target.value);
                const rgb = parseHex(e.target.value);
                if (rgb) ap.update({ panelColor: toHex(rgb) });
              }}
              onBlur={() => commitHex(panelText, (h) => ap.update({ panelColor: h }), 'Use a hex colour like #14161f.')}
            />
          </label>
        ) : null}
      </Card>

      {a.enabled ? (
        <>
          <Card title="Background" description="What fills the space around the video.">
            <Pills label="Background source">
              {SOURCES.map((s) => (
                <Pill key={s.id} selected={a.source === s.id} onClick={() => ap.update({ source: s.id })}>
                  {s.label}
                </Pill>
              ))}
            </Pills>
            {a.source === 'color' ? (
              <div className="cs-form">
                <Pills label="Colour swatches">
                  {COLOR_SWATCHES.map((c) => (
                    <Pill
                      key={c.hex}
                      selected={a.color.toLowerCase() === c.hex}
                      onClick={() => {
                        setHexText(c.hex);
                        ap.update({ color: c.hex });
                      }}
                    >
                      <span className="cs-swatch-dot" style={{ background: c.hex }} aria-hidden="true" /> {c.name}
                    </Pill>
                  ))}
                </Pills>
                <label>
                  Colour (hex, for example #1f3b57)
                  <input
                    value={hexText}
                    maxLength={7}
                    onChange={(e) => {
                      setHexText(e.target.value);
                      const rgb = parseHex(e.target.value);
                      if (rgb) {
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
                <Pills>
                  <button type="button" className="cs-chip" onClick={() => fileRef.current?.click()}>
                    Choose image
                  </button>
                  {a.customImage ? (
                    <button type="button" className="cs-chip" onClick={() => ap.update({ customImage: null })}>
                      Remove image
                    </button>
                  ) : null}
                </Pills>
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
                {!a.customImage ? <Empty>No image yet. Until you pick one, a plain dark background is used.</Empty> : null}
              </div>
            ) : null}
          </Card>

          <Card title="Opacity, blur and light" description="Backgrounds are always darkened enough for text to stay readable.">
            <Range label="Artwork opacity" value={a.opacity} min={0} max={100} unit="%" onChange={(v) => ap.update({ opacity: v })} />
            <Range label="Blur" value={a.blur} min={0} max={60} unit="px" onChange={(v) => ap.update({ blur: v })} />
            <Range label="Ambient light" value={a.ambient} min={0} max={100} unit="%" onChange={(v) => ap.update({ ambient: v })} />
          </Card>

          <Card title="Text contrast" description="High raises the target from 4.5:1 to 7:1.">
            <Pills label="Text contrast">
              {(['normal', 'high'] as const).map((c) => (
                <Pill key={c} selected={a.contrast === c} onClick={() => ap.update({ contrast: c })}>
                  {c === 'normal' ? 'Normal' : 'High'}
                </Pill>
              ))}
            </Pills>
            <p className="cs-card-desc" role="status">
              Body text on the background: {derived.textRatio.toFixed(1)}:1 (target {a.contrast === 'high' ? '7' : '4.5'}:1).
            </p>
          </Card>

          <Card title="Panel style" description="Glass is translucent, Solid is opaque, Clear is nearly transparent.">
            {AREAS.map((area) => (
              <div key={area.id} className="cs-arearow" role="group" aria-label={area.label}>
                <span>{area.label}</span>
                <Pills>
                  {STYLES.map((s) => (
                    <Pill key={s.id} selected={a.panels[area.id] === s.id} label={`${area.label}: ${s.label}`} onClick={() => ap.updatePanel(area.id, s.id)}>
                      {s.label}
                    </Pill>
                  ))}
                </Pills>
              </div>
            ))}
          </Card>

          <Card title="Colours from the artwork" description={derived.paletteStatus === 'loading' ? 'Reading colours…' : derived.note}>
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
            {ap.artworkLabel && a.source === 'poster' ? <p className="cs-card-desc">Artwork: {ap.artworkLabel}</p> : null}
          </Card>

          <Card title="Theme presets" description="Save these settings and restore them later. Presets do not include a custom image.">
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
                      <span className="cs-choice-main">{p.name}</span>
                    </button>
                    <button type="button" className="cs-chip" onClick={() => ap.deletePreset(p.id)} aria-label={`Delete preset ${p.name}`}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No presets yet.</Empty>
            )}
          </Card>
        </>
      ) : null}

      {msg ? (
        <p className="cs-form-msg" data-kind={msg.kind} role={msg.kind === 'error' ? 'alert' : 'status'}>
          {msg.text}
        </p>
      ) : null}
      {!ap.persisted ? (
        <p className="cs-form-msg" data-kind="error" role="alert">
          Your browser would not save these settings; they last until you close the tab.
        </p>
      ) : null}
      {a.enabled || a.theme !== 'adaptive' || a.accent !== 'default' || a.panelColor ? (
        <div className="cs-chips">
          <button
            type="button"
            className="cs-chip"
            onClick={() => {
              ap.reset();
              setHexText(DEFAULT_APPEARANCE.color);
              setAccentText(DEFAULT_APPEARANCE.customAccent);
              setPanelText('#14161f');
              setMsg({ kind: 'ok', text: 'Appearance reset: Adaptive theme, film accent, artwork on.' });
            }}
          >
            Reset appearance
          </button>
        </div>
      ) : null}
    </>
  );
}
