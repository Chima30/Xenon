import { VideoPlayer } from '@videojs/react/video';
import { useMemo, useState, type CSSProperties } from 'react';
import { FILMS } from '../data/catalog';
import { CinemaSkin } from '../skin';
import { ResilientVideo } from './ResilientVideo';
import '../studio.css';

/**
 * Skin Studio: a developer demo for embedding XENON. Everything here is page code; the skin only reads the
 * public CSS custom properties it documents. Nothing in this page is saved to the viewer's preferences.
 */

interface Config {
  accent: string;
  accentText: string;
  surface: string;
  radius: number;
  panelOpacity: number;
  panelBlur: number;
  controlSize: number;
  font: 'brand' | 'system';
  width: number | null;
}

const BRAND_FONT = "'Space Grotesk Variable', 'Space Grotesk', sans-serif";
const SYSTEM_FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const PRESETS: { id: string; name: string; config: Partial<Config> }[] = [
  { id: 'xenon', name: 'XENON', config: { accent: '#d8ff57', accentText: '#0a0e17', surface: '#0a0e17' } },
  { id: 'ember', name: 'Ember', config: { accent: '#ffb35c', accentText: '#0a0e17', surface: '#170f12' } },
  { id: 'hologram', name: 'Hologram', config: { accent: '#6fd6ff', accentText: '#0a0e17', surface: '#0a121c' } },
  { id: 'meadow', name: 'Meadow', config: { accent: '#b9f27c', accentText: '#0a0e17', surface: '#0d1710' } },
  { id: 'mono', name: 'Monochrome', config: { accent: '#f4f4f4', accentText: '#000000', surface: '#111111' } },
];

const DEFAULTS: Config = {
  accent: '#d8ff57',
  accentText: '#0a0e17',
  surface: '#0a0e17',
  radius: 20,
  panelOpacity: 90,
  panelBlur: 20,
  controlSize: 44,
  font: 'brand',
  width: null,
};

const WIDTHS: { label: string; value: number | null }[] = [
  { label: 'Fluid', value: null },
  { label: '960', value: 960 },
  { label: '640', value: 640 },
  { label: '390', value: 390 },
  { label: '300', value: 300 },
];

/** WCAG relative luminance contrast, so the studio can warn before a developer ships unreadable colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const m = hex.replace('#', '').match(/.{2}/g);
    if (!m || m.length < 3) return 0;
    const [r, g, bl] = m.slice(0, 3).map((x) => {
      const c = parseInt(x, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function StudioPage() {
  const [c, setC] = useState<Config>(DEFAULTS);
  const [copied, setCopied] = useState('');
  const set = (patch: Partial<Config>) => setC((prev) => ({ ...prev, ...patch }));
  const film = FILMS[2]!;

  const vars = useMemo(() => {
    const v: Record<string, string> = {
      '--media-accent-color': c.accent,
      '--media-accent-text-color': c.accentText,
      '--media-border-radius': `${c.radius}px`,
      '--xenon-surface-color': c.surface,
      '--xenon-panel-opacity': String(c.panelOpacity / 100),
      '--xenon-panel-blur': `${c.panelBlur}px`,
      '--xenon-control-size': `${c.controlSize}px`,
    };
    if (c.font === 'system') v['--media-font-family'] = SYSTEM_FONT;
    return v;
  }, [c]);

  const css = `.my-player {\n${Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')}\n}`;
  const jsx = `<VideoPlayer>\n  <div className="my-player">\n    <CinemaSkin title="${film.title}">\n      <Video src="/film.mp4" playsInline />\n    </CinemaSkin>\n  </div>\n</VideoPlayer>`;

  const textRatio = contrast(c.accent, c.accentText);
  const surfaceRatio = contrast(c.accent, c.surface);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${what} copied`);
    } catch {
      setCopied('Copy failed: select the code and copy it manually');
    }
    window.setTimeout(() => setCopied(''), 2500);
  };

  return (
    <div className="studio">
      <header className="studio-intro">
        <p className="kicker">Developer · not part of the skin</p>
        <h1 className="page-h">Skin Studio</h1>
        <p className="lede">
          Tune XENON with its public CSS custom properties and see the real player respond. The settings below only style this
          preview; the code panel gives you the exact CSS to ship.
        </p>
      </header>

      <div className="studio-grid">
        <form className="studio-controls" aria-label="Skin settings" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend>Preset</legend>
            <div className="studio-presets">
              {PRESETS.map((p) => {
                const on = p.config.accent === c.accent && p.config.surface === c.surface;
                return (
                  <button key={p.id} type="button" className="studio-preset" aria-pressed={on} onClick={() => set(p.config)}>
                    <span className="studio-swatch" aria-hidden="true" style={{ background: p.config.surface }}>
                      <span style={{ background: p.config.accent }} />
                    </span>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend>Colour</legend>
            <ColorField label="Accent" hint="--media-accent-color" value={c.accent} onChange={(v) => set({ accent: v })} />
            <ColorField label="Text on accent" hint="--media-accent-text-color" value={c.accentText} onChange={(v) => set({ accentText: v })} />
            <ColorField label="Surface" hint="--xenon-surface-color" value={c.surface} onChange={(v) => set({ surface: v })} />
            <p className="studio-check" data-ok={textRatio >= 4.5 && surfaceRatio >= 3 ? '' : undefined} role="status">
              {textRatio >= 4.5 && surfaceRatio >= 3 ? 'Passes: ' : 'Below target: '}
              Text on accent {textRatio.toFixed(1)}:1 (needs 4.5) · accent on surface {surfaceRatio.toFixed(1)}:1 (needs 3)
            </p>
          </fieldset>

          <fieldset>
            <legend>Shape and material</legend>
            <Slider label="Corner radius" hint="--media-border-radius" value={c.radius} min={0} max={32} unit="px" onChange={(v) => set({ radius: v })} />
            <Slider label="Panel opacity" hint="--xenon-panel-opacity" value={c.panelOpacity} min={55} max={100} unit="%" onChange={(v) => set({ panelOpacity: v })} />
            <Slider label="Panel blur" hint="--xenon-panel-blur" value={c.panelBlur} min={0} max={40} unit="px" onChange={(v) => set({ panelBlur: v })} />
          </fieldset>

          <fieldset>
            <legend>Type and controls</legend>
            <div className="studio-row" role="group" aria-label="Font family">
              {(['brand', 'system'] as const).map((f) => (
                <button key={f} type="button" className="studio-chip" aria-pressed={c.font === f} onClick={() => set({ font: f })}>
                  {f === 'brand' ? 'Space Grotesk' : 'System UI'}
                </button>
              ))}
            </div>
            <p className="studio-hint">--media-font-family</p>
            <Slider label="Control size" hint="--xenon-control-size (44px minimum)" value={c.controlSize} min={44} max={60} unit="px" onChange={(v) => set({ controlSize: v })} />
          </fieldset>

          <fieldset>
            <legend>Player width</legend>
            <div className="studio-row" role="group" aria-label="Player width">
              {WIDTHS.map((w) => (
                <button key={w.label} type="button" className="studio-chip" aria-pressed={c.width === w.value} onClick={() => set({ width: w.value })}>
                  {w.value ? `${w.label} px` : w.label}
                </button>
              ))}
            </div>
          </fieldset>

          <button type="button" className="studio-reset" onClick={() => setC(DEFAULTS)}>
            Reset to XENON defaults
          </button>
        </form>

        <div className="studio-stage">
          <div className="studio-frame" style={{ width: c.width ? `min(100%, ${c.width}px)` : '100%' }}>
            <div style={{ ...(vars as CSSProperties), fontFamily: c.font === 'brand' ? BRAND_FONT : undefined }}>
              <VideoPlayer>
                <CinemaSkin title={film.title} subtitle="Skin Studio preview" mediaKey="studio">
                  <ResilientVideo film={film} />
                </CinemaSkin>
              </VideoPlayer>
            </div>
          </div>

          <section className="studio-code" aria-labelledby="studio-code-h">
            <div className="studio-code-head">
              <h2 id="studio-code-h">Your configuration</h2>
              <div className="studio-row">
                <button type="button" className="studio-chip" onClick={() => void copy(css, 'CSS')}>
                  Copy CSS
                </button>
                <button type="button" className="studio-chip" onClick={() => void copy(jsx, 'Markup')}>
                  Copy markup
                </button>
              </div>
            </div>
            <pre className="code" tabIndex={0} aria-label="CSS configuration">
              <code>{css}</code>
            </pre>
            <pre className="code" tabIndex={0} aria-label="Markup example">
              <code>{jsx}</code>
            </pre>
            <p className="studio-hint" role="status">
              {copied ||
                'A viewer’s own Appearance choices (for example a custom accent) still apply on top, so their accessibility settings always win.'}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="studio-field">
      <span>
        {label}
        <span className="studio-hint">{hint}</span>
      </span>
      <span className="studio-color">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour picker`} />
        <code>{value}</code>
      </span>
    </label>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="studio-field">
      <span>
        {label} <strong>{value}{unit}</strong>
        <span className="studio-hint">{hint}</span>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
