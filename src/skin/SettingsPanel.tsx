import { useAudioTrackOptions, useQualityOptions } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import { FloatingPanel } from './FloatingPanel';
import { formatTime } from './format';
import { useSubtitles } from './subtitles/SubtitleContext';

export interface Choice {
  id: string;
  label: string;
}
export interface ChoiceSet {
  options: Choice[];
  activeId: string;
  onChange: (id: string) => void;
}
export interface SkipSegment {
  type: 'intro' | 'recap' | 'credits';
  start: number;
  end: number;
}
export interface DownloadInfo {
  href: string;
  filename?: string;
  /** Shown next to the link, e.g. the licence that permits it. */
  note: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  onOpenSubtitles: () => void;
  /** Real, selectable quality variants of the current source (separate files or renditions). */
  qualities?: ChoiceSet;
  /** Alternative servers. Shown only with two or more. */
  servers?: ChoiceSet;
  segments?: SkipSegment[];
  download?: DownloadInfo;
  onSkip: (time: number, label: string) => void;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SEGMENT_LABEL: Record<SkipSegment['type'], string> = {
  intro: 'Skip intro',
  recap: 'Skip recap',
  credits: 'Skip credits',
};

export function SettingsPanel({
  open,
  onClose,
  returnFocusTo,
  onOpenSubtitles,
  qualities,
  servers,
  segments,
  download,
  onSkip,
}: Props) {
  const store = usePlayer();
  const rate = usePlayer((s) => s.playbackRate);
  const rateAvail = usePlayer((s) => s.playbackRateAvailability);
  const adaptive = useQualityOptions();
  const audio = useAudioTrackOptions();
  const sub = useSubtitles();

  const adaptiveOptions = adaptive?.state.availability === 'available' ? adaptive.options : null;
  const fileQualities = qualities && qualities.options.length > 1 ? qualities : null;
  const audioOptions = audio?.state.availability === 'available' && audio.options.length > 1 ? audio.options : null;
  const activeSegments = segments ?? [];

  return (
    <FloatingPanel open={open} onClose={onClose} title="Settings" returnFocusTo={returnFocusTo}>
      <div className="cs-cards">
        {adaptiveOptions && adaptive ? (
          <Card title="Quality">
            <Chips>
              {adaptiveOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="cs-chip"
                  disabled={o.disabled}
                  aria-pressed={adaptive.value === o.value}
                  onClick={() => adaptive.setValue(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </Chips>
          </Card>
        ) : fileQualities ? (
          <Card title="Quality">
            <Chips>
              {fileQualities.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="cs-chip"
                  aria-pressed={fileQualities.activeId === o.id}
                  onClick={() => fileQualities.onChange(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </Chips>
            <p className="cs-muted">Changing quality reloads the file and keeps your place.</p>
          </Card>
        ) : null}

        {rateAvail === 'available' ? (
          <Card title="Speed">
            <Chips>
              {RATES.map((r) => (
                <button key={r} type="button" className="cs-chip" aria-pressed={rate === r} onClick={() => store.setPlaybackRate(r)}>
                  {r}×
                </button>
              ))}
            </Chips>
          </Card>
        ) : null}

        {audioOptions && audio ? (
          <Card title="Audio">
            <Chips>
              {audioOptions.map((o) => (
                <button key={o.value} type="button" className="cs-chip" aria-pressed={audio.value === o.value} onClick={() => audio.setValue(o.value)}>
                  {o.label}
                </button>
              ))}
            </Chips>
          </Card>
        ) : null}

        <Card title="Subtitles">
          <p className="cs-card-value">{sub.active ? sub.active.label : 'Off'}</p>
          <button type="button" className="cs-btn cs-btn-label" onClick={onOpenSubtitles}>
            <span>Subtitle menu</span>
          </button>
        </Card>

        {servers && servers.options.length > 1 ? (
          <Card title="Server">
            <Chips>
              {servers.options.map((o) => (
                <button key={o.id} type="button" className="cs-chip" aria-pressed={servers.activeId === o.id} onClick={() => servers.onChange(o.id)}>
                  {o.label}
                </button>
              ))}
            </Chips>
          </Card>
        ) : null}

        {activeSegments.length > 0 ? (
          <Card title="Skip">
            <Chips>
              {activeSegments.map((s) => (
                <button key={s.type + s.start} type="button" className="cs-chip" onClick={() => onSkip(s.end, SEGMENT_LABEL[s.type])}>
                  {SEGMENT_LABEL[s.type]} <span className="cs-tag">{formatTime(s.start)}–{formatTime(s.end)}</span>
                </button>
              ))}
            </Chips>
          </Card>
        ) : null}

        {download ? (
          <Card title="Download">
            <a className="cs-btn cs-btn-label" href={download.href} download={download.filename} target="_blank" rel="noreferrer">
              <span>Open file to save</span>
            </a>
            <p className="cs-muted">{download.note}</p>
          </Card>
        ) : null}
      </div>
    </FloatingPanel>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="cs-card" aria-label={title}>
      <h3 className="cs-card-title">{title}</h3>
      {children}
    </section>
  );
}

function Chips({ children }: { children: React.ReactNode }) {
  return <div className="cs-chips">{children}</div>;
}
