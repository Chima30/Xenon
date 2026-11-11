import { useRef, useState } from 'react';
import { TrashIcon } from '../icons';
import { Card, Empty, Pill, Pills, SwitchRow } from '../ui';
import { captionCssVars } from './CaptionOverlay';
import { flagFor, languageName } from './parse';
import { CAPTION_COLORS, useSubtitles, type SubTrack } from './SubtitleContext';

export type AutoSync = (track: SubTrack) => Promise<number>;

const MAX_BYTES = 2 * 1024 * 1024;

const trackName = (t: SubTrack) => t.label || languageName(t.lang) || 'Subtitles';

/** Language list and the on/off switch. */
export function SubtitleTracksCard() {
  const sub = useSubtitles();
  return (
    <Card title="Subtitle language" description="Pick a language, or turn captions off.">
      <SwitchRow
        label="Show captions"
        description={sub.active ? `Showing ${trackName(sub.active)}` : 'Captions are off'}
        checked={sub.active !== null}
        disabled={sub.tracks.length === 0}
        onChange={() => sub.toggle()}
      />
      {sub.tracks.length === 0 ? (
        <Empty>This video has no subtitle tracks. Add your own under “Add subtitles”.</Empty>
      ) : (
        <ul className="cs-list">
          {sub.tracks.map((t) => {
            const flag = flagFor(t.lang);
            const lang = languageName(t.lang);
            return (
              <li key={t.id} className="cs-list-row">
                <button type="button" className="cs-choice" aria-pressed={sub.activeId === t.id} onClick={() => sub.setActive(t.id)}>
                  <span className="cs-choice-main">
                    {flag ? <span aria-hidden="true">{flag} </span> : null}
                    {trackName(t)}
                  </span>
                  <span className="cs-tag">
                    {lang && lang !== trackName(t) ? `${lang} · ` : ''}
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
      )}
    </Card>
  );
}

/** Timing offset, optional alignment service, and the transcript shortcut. */
export function SubtitleTimingCard({ onOpenTranscript, autoSync }: { onOpenTranscript: () => void; autoSync?: (track: SubTrack) => Promise<number> }) {
  const sub = useSubtitles();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const nudge = (d: number) => sub.setOffset(sub.offset + d);

  const runSync = async () => {
    if (!autoSync || !sub.active) return;
    setSyncing(true);
    try {
      sub.setOffset(await autoSync(sub.active));
      setMsg({ kind: 'ok', text: 'Timing adjusted by the alignment service.' });
    } catch {
      setMsg({ kind: 'error', text: 'The alignment service did not return a result.' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card title="Timing and transcript" description="Fix captions that run early or late, or read along.">
      {sub.active ? (
        <>
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
          <p className="cs-card-desc">Positive values show lines later.</p>
          <div className="cs-chips">
            {autoSync ? (
              <button type="button" className="cs-chip" onClick={() => void runSync()} disabled={syncing}>
                {syncing ? 'Aligning…' : 'Auto-sync with alignment service'}
              </button>
            ) : null}
            <button type="button" className="cs-chip" onClick={onOpenTranscript}>
              Open transcript
            </button>
          </div>
          {msg ? (
            <p className="cs-form-msg" data-kind={msg.kind} role={msg.kind === 'error' ? 'alert' : 'status'}>
              {msg.text}
            </p>
          ) : null}
        </>
      ) : (
        <Empty>Choose a subtitle track to adjust its timing or open its transcript.</Empty>
      )}
    </Card>
  );
}

/** Upload a .srt/.vtt file or paste subtitle text. Parsed in the browser. */
export function SubtitleAddCard() {
  const sub = useSubtitles();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [lang, setLang] = useState('');
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const onFile = async (file: File) => {
    if (!/\.(srt|vtt)$/i.test(file.name)) return setMessage({ kind: 'error', text: 'Choose a .srt or .vtt file.' });
    if (file.size > MAX_BYTES) return setMessage({ kind: 'error', text: 'That file is larger than 2 MB.' });
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

  return (
    <Card title="Add subtitles" description="Upload a file or paste text. Nothing leaves your browser.">
      <div className="cs-form">
        <label>
          Name
          <input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. French" />
        </label>
        <label>
          Language code (optional)
          <input value={lang} maxLength={10} onChange={(e) => setLang(e.target.value)} placeholder="e.g. fr or pt-BR" />
        </label>
        <div className="cs-chips">
          <button type="button" className="cs-chip" onClick={() => fileRef.current?.click()}>
            Upload .srt or .vtt
          </button>
        </div>
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
        <label>
          Or paste subtitle text
          <textarea rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'1\n00:00:01,000 --> 00:00:03,000\nHello'} />
        </label>
        <div className="cs-chips">
          <button type="button" className="cs-chip" onClick={onPaste} disabled={!pasted.trim()}>
            Add pasted subtitles
          </button>
        </div>
        {message ? (
          <p className="cs-form-msg" data-kind={message.kind} role={message.kind === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/** Subtitle appearance. Independent of the interface typography so it can be tuned for readability. */
export function SubtitleStyleCard() {
  const sub = useSubtitles();
  const st = sub.style;
  return (
    <Card title="Subtitle appearance" description="Size, typeface, colour, background, position and text edge.">
      <div className="cs-form">
        <fieldset>
          <legend>Size</legend>
          <Pills>
            {(['sm', 'md', 'lg', 'xl'] as const).map((s) => (
              <Pill key={s} selected={st.size === s} onClick={() => sub.setStyle({ size: s })}>
                {{ sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra large' }[s]}
              </Pill>
            ))}
          </Pills>
        </fieldset>
        <fieldset>
          <legend>Typeface</legend>
          <Pills>
            {(['brand', 'system', 'serif', 'mono'] as const).map((f) => (
              <Pill key={f} selected={st.font === f} onClick={() => sub.setStyle({ font: f })}>
                {{ brand: 'Space Grotesk', system: 'System sans', serif: 'Serif', mono: 'Monospace' }[f]}
              </Pill>
            ))}
          </Pills>
        </fieldset>
        <fieldset>
          <legend>Colour</legend>
          <Pills>
            {CAPTION_COLORS.map((c) => (
              <Pill key={c.value} selected={st.color === c.value} onClick={() => sub.setStyle({ color: c.value })}>
                <span className="cs-swatch-dot" style={{ background: c.value }} aria-hidden="true" /> {c.name}
              </Pill>
            ))}
          </Pills>
        </fieldset>
        <label>
          Background opacity: {st.bgOpacity}%
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={st.bgOpacity}
            aria-valuetext={`${st.bgOpacity} percent`}
            onChange={(e) => sub.setStyle({ bgOpacity: Number(e.target.value) })}
          />
        </label>
        <fieldset>
          <legend>Position</legend>
          <Pills>
            {(['bottom', 'raised', 'top'] as const).map((p) => (
              <Pill key={p} selected={st.position === p} onClick={() => sub.setStyle({ position: p })}>
                {{ bottom: 'Bottom', raised: 'Raised', top: 'Top' }[p]}
              </Pill>
            ))}
          </Pills>
        </fieldset>
        <fieldset>
          <legend>Text edge</legend>
          <Pills>
            {(['none', 'shadow', 'outline'] as const).map((o) => (
              <Pill key={o} selected={st.outline === o} onClick={() => sub.setStyle({ outline: o })}>
                {{ none: 'None', shadow: 'Shadow', outline: 'Outline' }[o]}
              </Pill>
            ))}
          </Pills>
        </fieldset>
        <div className="cs-cap-preview" style={captionCssVars(st)} aria-hidden="true">
          <span className="cs-caption-text">Preview: the quick brown fox</span>
        </div>
      </div>
    </Card>
  );
}
