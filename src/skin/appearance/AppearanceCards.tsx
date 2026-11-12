import { useRef, useState } from 'react';
import { Card, Empty, Pill, Pills } from '../ui';
import { parseHex, toHex } from './color';
import {
  DEFAULT_APPEARANCE,
  GRADIENT_PRESETS,
  useAppearance,
  type GradientPreset,
  type GradientSettings,
  type AccentChoice,
  type BackgroundMode,
  type PanelArea,
  type PanelStyle,
} from './AppearanceContext';

const BACKGROUNDS: { id: BackgroundMode; label: string; desc: string }[] = [
  { id: 'solid', label: 'Solid colour', desc: 'One clean colour from the film\u2019s palette fills the player, the page and the bars around the picture. No image, no gradient.' },
  { id: 'spectral', label: 'Spectral gradient', desc: 'The film\u2019s four-colour gradient runs through the player and the page.' },
  { id: 'artwork', label: 'Movie artwork', desc: 'The film\u2019s licensed still, blurred and tinted behind the interface. The video itself is never tinted.' },
  { id: 'custom', label: 'Custom', desc: 'Your own image or colour, kept in this browser only.' },
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
        aria-valuetext={`${value}${unit === '%' ? ' percent' : unit === '\u00b0' ? ' degrees' : ' pixels'}`}
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
  const bg = BACKGROUNDS.find((b) => b.id === a.background) ?? BACKGROUNDS[0]!;
  const showsImage = a.background === 'artwork' || (a.background === 'custom' && a.source === 'custom');

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
      </Card>

      <Card title="Background" description={bg.desc}>
        <Pills label="Background">
          {BACKGROUNDS.map((b) => (
            <Pill key={b.id} selected={a.background === b.id} onClick={() => ap.update({ background: b.id })}>
              {b.label}
            </Pill>
          ))}
        </Pills>
        {a.background === 'solid' ? (
          <div className="cs-palette" aria-label="Background colour">
            <span className="cs-palette-item">
              <span className="cs-swatch-dot cs-swatch-lg" style={{ background: ap.resolved.base }} aria-hidden="true" />
              {a.panelColor ? 'Your panel colour' : film ? 'This film\u2019s colour' : 'XENON obsidian'} <code>{ap.resolved.base}</code>
            </span>
          </div>
        ) : null}
        {a.background === 'custom' ? (
          <Pills label="Custom background">
            <Pill selected={a.source === 'color'} onClick={() => ap.update({ source: 'color' })}>
              Colour
            </Pill>
            <Pill selected={a.source === 'custom'} onClick={() => ap.update({ source: 'custom' })}>
              Image
            </Pill>
          </Pills>
        ) : null}
        {a.background === 'custom' && a.source === 'color' ? (
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
        {a.background === 'custom' && a.source === 'custom' ? (
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
            {!a.customImage ? <Empty>No image yet. Until you pick one, the film colour is used.</Empty> : null}
          </div>
        ) : null}
        {a.enabled ? (
          <Range
            label={a.background === 'artwork' ? 'Artwork opacity' : a.source === 'color' ? 'Colour strength' : 'Image opacity'}
            value={a.opacity}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => ap.update({ opacity: v })}
          />
        ) : null}
        {showsImage ? <Range label="Background blur" value={a.blur} min={0} max={60} unit="px" onChange={(v) => ap.update({ blur: v })} /> : null}
        {a.enabled ? <p className="cs-card-desc">Backgrounds are always darkened enough for text to stay readable.</p> : null}
      </Card>

      {a.background !== 'solid' ? <SpectralCard /> : null}

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

        </>
      ) : null}

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
      {a.background !== DEFAULT_APPEARANCE.background || a.theme !== 'adaptive' || a.accent !== 'default' || a.panelColor ? (
        <div className="cs-chips">
          <button
            type="button"
            className="cs-chip"
            onClick={() => {
              ap.reset();
              setHexText(DEFAULT_APPEARANCE.color);
              setAccentText(DEFAULT_APPEARANCE.customAccent);
              setPanelText('#14161f');
              setMsg({ kind: 'ok', text: 'Appearance reset: Adaptive theme, film accent, spectral gradient background.' });
            }}
          >
            Reset appearance
          </button>
        </div>
      ) : null}
    </>
  );
}

const PRESETS: { id: Exclude<GradientPreset, 'custom'>; label: string }[] = [
  { id: 'subtle', label: 'Subtle' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'vivid', label: 'Vivid' },
];
const STOPS = ['Deep', 'Mid', 'Light accent', 'Highlight'] as const;

/**
 * Spectral gradients: the four-stop spectrum every surface is built from, and the dials for it. Presets set the
 * dials; moving any dial makes the look your own ("Custom"). Saved with the rest of Appearance.
 */
function SpectralCard() {
  const ap = useAppearance();
  const { appearance: a, resolved } = ap;
  const g = a.gradient;
  const set = (patch: Partial<GradientSettings>, extra: Parameters<typeof ap.update>[0] = {}) =>
    ap.update({ ...extra, gradient: { ...g, preset: 'custom', ...patch } });
  const sp = resolved.spectrum;
  return (
    <Card title="Spectral gradients" description="Every surface is layered from one four-colour spectrum, so the player, the wheel, the dock and the page share the film's light. The video itself is never tinted.">
      <Pills label="Gradient preset">
        {PRESETS.map((p) => (
          <Pill
            key={p.id}
            selected={g.preset === p.id}
            onClick={() => {
              const v = GRADIENT_PRESETS[p.id];
              ap.update({ ambient: v.ambient, blur: v.blur, gradient: { ...g, preset: p.id, intensity: v.intensity, panelAlpha: v.panelAlpha } });
            }}
          >
            {p.label}
          </Pill>
        ))}
        {g.preset === 'custom' ? <span className="cs-tag">Custom</span> : null}
      </Pills>
      <div className="cs-spectrum" aria-label={`Spectrum in use: ${sp.join(', ')}`} role="img">
        <span className="cs-spectrum-bar" style={{ background: `linear-gradient(${g.direction}deg, ${sp[0]}, ${sp[1]} 38%, ${sp[2]} 74%, ${sp[3]})` }} />
        <span className="cs-spectrum-stops" aria-hidden="true">
          {sp.map((c, i) => (
            <span key={i} className="cs-palette-item">
              <span className="cs-swatch-dot" style={{ background: c }} /> {STOPS[i]} <code>{c}</code>
            </span>
          ))}
        </span>
      </div>
      <Pills label="Palette">
        <Pill selected={g.paletteMode === 'film'} onClick={() => set({ paletteMode: 'film' })}>
          {a.theme === 'adaptive' ? 'Each film\u2019s palette' : 'XENON palette'}
        </Pill>
        <Pill selected={g.paletteMode === 'custom'} onClick={() => set({ paletteMode: 'custom', custom: [...(sp as unknown as [string, string, string, string])] })}>
          My palette
        </Pill>
      </Pills>
      {g.paletteMode === 'custom' ? (
        <div className="cs-spectrum-edit" role="group" aria-label="My palette">
          {STOPS.map((name, i) => (
            <label key={name} className="cs-spectrum-input">
              <input
                type="color"
                value={g.custom[i]}
                onChange={(e) => {
                  const next = [...g.custom] as [string, string, string, string];
                  next[i] = e.target.value;
                  set({ custom: next });
                }}
              />
              <span>{name}</span>
            </label>
          ))}
        </div>
      ) : null}
      <Range label="Gradient intensity" value={g.intensity} min={0} max={100} unit="%" onChange={(v) => set({ intensity: v })} />
      <Range label="Ambient colour" value={a.ambient} min={0} max={100} unit="%" onChange={(v) => set({}, { ambient: v })} />
      <Range label="Gradient direction" value={g.direction} min={0} max={360} unit={'\u00b0'} onChange={(v) => set({ direction: v })} />
      <Range label="Panel transparency" value={100 - g.panelAlpha} min={0} max={60} unit="%" onChange={(v) => set({ panelAlpha: 100 - v })} />
    </Card>
  );
}
