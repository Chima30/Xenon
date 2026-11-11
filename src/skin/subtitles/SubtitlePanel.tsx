import { useRef, useState } from 'react';
import { FloatingPanel } from '../FloatingPanel';
import { TrashIcon } from '../icons';
import { captionCssVars } from './CaptionOverlay';
import { flagFor, languageName } from './parse';
import { CAPTION_COLORS, useSubtitles, type CaptionStyle, type SubTrack } from './SubtitleContext';

export type AutoSync = (track: SubTrack) => Promise<number>;

interface Props {
  open: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  onOpenTranscript: () => void;
  /** Provide only when a real alignment service exists; the button is omitted otherwise. */
  autoSync?: AutoSync;
}

const MAX_BYTES = 2 * 1024 * 1024;

function trackName(t: SubTrack): string {
  return t.label || languageName(t.lang) || 'Subtitles';
}

export function SubtitlePanel({ open, onClose, returnFocusTo, onOpenTranscript, autoSync }: Props) {
  const sub = useSubtitles();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [lang, setLang] = useState('');
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const onFile = async (file: File) => {
    if (!/\.(srt|vtt)$/i.test(file.name)) {
      setMessage({ kind: 'error', text: 'Choose a .srt or .vtt file.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage({ kind: 'error', text: 'That file is larger than 2 MB.' });
      return;
    }
    const err = sub.addTrack(label || file.name.replace(/\.(srt|vtt)$/i, ''), lang, await file.text(), 'upload');
    setMessage(err ? { kind: 'error', text: err } : { kind: 'ok', text: `Added ${file.name}. It stays in this browser.` });
    if (!err) setLabel('');
  };

  const onPaste = () => {
    const err = sub.addTrack(label || 'Pasted subtitles', lang, pasted, 'paste');
    setMessage(err ? { kind: 'error', text: err } : { kind: 'ok', text: 'Subtitles added.' });
    if (!err) {
      setPasted('');
      setLabel('');
    }
  };

  const runSync = async () => {
    if (!autoSync || !sub.active) return;
    setSyncing(true);
    try {
      sub.setOffset(await autoSync(sub.active));
      setMessage({ kind: 'ok', text: 'Timing adjusted by the alignment service.' });
    } catch {
      setMessage({ kind: 'error', text: 'The alignment service did not return a result.' });
    } finally {
      setSyncing(false);
    }
  };

  const setStyle = (p: Partial<CaptionStyle>) => sub.setStyle(p);
  const nudge = (d: number) => sub.setOffset(sub.offset + d);

  return (
    <FloatingPanel open={open} onClose={onClose} title="Subtitles" returnFocusTo={returnFocusTo}>
      <section className="cs-card" aria-label="Subtitle tracks">
        <ul className="cs-list">
          <li>
            <button type="button" className="cs-choice" aria-pressed={sub.activeId === null} onClick={() => sub.setActive(null)}>
              Off
            </button>
          </li>
          {sub.tracks.map((t) => {
            const flag = flagFor(t.lang);
            const name = languageName(t.lang);
            return (
              <li key={t.id} className="cs-list-row">
                <button type="button" className="cs-choice" aria-pressed={sub.activeId === t.id} onClick={() => sub.setActive(t.id)}>
                  {flag ? <span aria-hidden="true">{flag} </span> : null}
                  {trackName(t)}
                  <span className="cs-tag">
                    {name && name !== trackName(t) ? `${name} · ` : ''}
                    {t.origin === 'native' ? 'from video' : t.origin === 'upload' ? 'uploaded' : 'pasted'}
                  </span>
                </button>
                {t.origin !== 'native' ? (
                  <button type="button" className="cs-icon-btn" onClick={() => sub.removeTrack(t.id)} aria-label={`Remove ${trackName(t)}`}>
                    <TrashIcon />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {sub.tracks.length === 0 ? (
          <p className="cs-muted">This video has no subtitle tracks. Add your own below.</p>
        ) : null}
      </section>

      {sub.active ? (
        <section className="cs-card" aria-label="Subtitle timing">
          <h3 className="cs-card-title">Timing offset</h3>
          <div className="cs-offset" role="group" aria-label="Adjust subtitle timing">
            <button type="button" className="cs-chip" onClick={() => nudge(-0.5)}>
              −0.5 s
            </button>
            <button type="button" className="cs-chip" onClick={() => nudge(-0.1)}>
              −0.1 s
            </button>
            <output className="cs-offset-val" aria-live="polite">
              {sub.offset > 0 ? '+' : ''}
              {sub.offset.toFixed(1)} s
            </output>
            <button type="button" className="cs-chip" onClick={() => nudge(0.1)}>
              +0.1 s
            </button>
            <button type="button" className="cs-chip" onClick={() => nudge(0.5)}>
              +0.5 s
            </button>
            <button type="button" className="cs-chip" onClick={() => sub.setOffset(0)} disabled={sub.offset === 0}>
              Reset
            </button>
          </div>
          <p className="cs-muted">Positive values show lines later. Use it when subtitles run ahead of or behind the speech.</p>
          {autoSync ? (
            <button type="button" className="cs-btn cs-btn-label" onClick={() => void runSync()} disabled={syncing}>
              <span>{syncing ? 'Aligning…' : 'Auto-sync with alignment service'}</span>
            </button>
          ) : null}
          <button type="button" className="cs-btn cs-btn-label" onClick={onOpenTranscript}>
            <span>Open transcript</span>
          </button>
        </section>
      ) : null}

      <details className="cs-card cs-details">
        <summary>Add subtitles</summary>
        <div className="cs-form">
          <label>
            Name
            <input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. French" />
          </label>
          <label>
            Language code (optional)
            <input value={lang} maxLength={10} onChange={(e) => setLang(e.target.value)} placeholder="e.g. fr or pt-BR" />
          </label>
          <div>
            <button type="button" className="cs-btn cs-btn-label" onClick={() => fileRef.current?.click()}>
              <span>Upload .srt or .vtt</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".srt,.vtt,text/vtt,application/x-subrip"
              className="cs-sr"
              tabIndex={-1}
              aria-label="Subtitle file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = '';
              }}
            />
          </div>
          <label>
            Or paste subtitle text
            <textarea rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'1\n00:00:01,000 --> 00:00:03,000\nHello'} />
          </label>
          <button type="button" className="cs-btn cs-btn-label" onClick={onPaste} disabled={!pasted.trim()}>
            <span>Add pasted subtitles</span>
          </button>
          {message ? (
            <p className="cs-form-msg" data-kind={message.kind} role={message.kind === 'error' ? 'alert' : 'status'}>
              {message.text}
            </p>
          ) : null}
        </div>
      </details>

      <details className="cs-card cs-details">
        <summary>Appearance</summary>
        <div className="cs-form">
          <fieldset>
            <legend>Size</legend>
            <div className="cs-chips">
              {(['sm', 'md', 'lg', 'xl'] as const).map((s) => (
                <button key={s} type="button" className="cs-chip" aria-pressed={sub.style.size === s} onClick={() => setStyle({ size: s })}>
                  {{ sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra large' }[s]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Colour</legend>
            <div className="cs-chips">
              {CAPTION_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="cs-chip cs-swatch"
                  aria-pressed={sub.style.color === c.value}
                  onClick={() => setStyle({ color: c.value })}
                >
                  <span className="cs-swatch-dot" style={{ background: c.value }} aria-hidden="true" />
                  {c.name}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            Background opacity: {sub.style.bgOpacity}%
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={sub.style.bgOpacity}
              aria-valuetext={`${sub.style.bgOpacity} percent`}
              onChange={(e) => setStyle({ bgOpacity: Number(e.target.value) })}
            />
          </label>
          <fieldset>
            <legend>Position</legend>
            <div className="cs-chips">
              {(['bottom', 'raised', 'top'] as const).map((p) => (
                <button key={p} type="button" className="cs-chip" aria-pressed={sub.style.position === p} onClick={() => setStyle({ position: p })}>
                  {{ bottom: 'Bottom', raised: 'Raised', top: 'Top' }[p]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Text edge</legend>
            <div className="cs-chips">
              {(['none', 'shadow', 'outline'] as const).map((o) => (
                <button key={o} type="button" className="cs-chip" aria-pressed={sub.style.outline === o} onClick={() => setStyle({ outline: o })}>
                  {{ none: 'None', shadow: 'Shadow', outline: 'Outline' }[o]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="cs-cap-preview" style={captionCssVars(sub.style)} aria-hidden="true">
            <span className="cs-caption-text">Preview: the quick brown fox</span>
          </div>
        </div>
      </details>
    </FloatingPanel>
  );
}
