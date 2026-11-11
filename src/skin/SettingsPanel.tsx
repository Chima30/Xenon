import { useAudioTrackOptions, useQualityOptions } from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AppearanceCards } from './appearance/AppearanceCards';
import { DiagnosticsBody, type DiagRow } from './DiagnosticsDialog';
import { FloatingPanel } from './FloatingPanel';
import { formatTime } from './format';
import { useNativeKeydown } from './hooks';
import { DockCard, ProfileCard, ViewPrefsCard } from './prefs/A11yCards';
import { SubtitleAddCard, SubtitleStyleCard, SubtitleTimingCard, SubtitleTracksCard, type AutoSync } from './subtitles/SubtitleCards';
import { Card, Empty, Pill, Pills } from './ui';

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

export type SettingsTab = 'playback' | 'subtitles' | 'appearance' | 'accessibility' | 'advanced';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'playback', label: 'Playback' },
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'advanced', label: 'Advanced' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  onOpenTranscript: () => void;
  onOpenHelp: () => void;
  onResetAll: () => void;
  qualities?: ChoiceSet;
  servers?: ChoiceSet;
  segments?: SkipSegment[];
  download?: DownloadInfo;
  autoSync?: AutoSync;
  diagnosticsRows?: DiagRow[];
  onSkip: (time: number, label: string) => void;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SEGMENT_LABEL: Record<SkipSegment['type'], string> = { intro: 'Skip intro', recap: 'Skip recap', credits: 'Skip credits' };

interface Entry {
  id: string;
  tab: SettingsTab;
  title: string;
  keywords: string;
  node: ReactNode;
}

export function SettingsPanel(props: Props) {
  const { open, onClose, returnFocusTo, tab, onTab } = props;
  const store = usePlayer();
  const rate = usePlayer((s) => s.playbackRate);
  const rateAvail = usePlayer((s) => s.playbackRateAvailability);
  const adaptive = useQualityOptions();
  const audio = useAudioTrackOptions();
  const [query, setQuery] = useState('');
  // A fresh open starts from the tabs, not from a stale search.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);
  const baseId = useId();
  const tablistRef = useRef<HTMLDivElement>(null);

  // Arrow-key tabs. Native listener because the panel shields the player's hotkeys (and React's root listener).
  useNativeKeydown(tablistRef, (e) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    const target = TABS[next];
    if (target) {
      onTab(target.id);
      requestAnimationFrame(() => document.getElementById(`${baseId}-tab-${target.id}`)?.focus());
    }
  });

  const adaptiveOptions = adaptive?.state.availability === 'available' ? adaptive.options : null;
  const fileQualities = props.qualities && props.qualities.options.length > 1 ? props.qualities : null;
  const audioOptions = audio?.state.availability === 'available' && audio.options.length > 1 ? audio.options : null;
  const segments = props.segments ?? [];
  const servers = props.servers && props.servers.options.length > 1 ? props.servers : null;

  // Rebuilt every render on purpose: the cards close over callbacks that change (opener, panel state).
  const entries: Entry[] = (() => {
    const list: Entry[] = [];

    if (rateAvail === 'available') {
      list.push({
        id: 'speed',
        tab: 'playback',
        title: 'Playback speed',
        keywords: 'rate faster slower tempo',
        node: (
          <Card title="Playback speed" description="Slow down to follow dialogue, speed up to skim.">
            <Pills label="Playback speed">
              {RATES.map((r) => (
                <Pill key={r} selected={rate === r} onClick={() => store.setPlaybackRate(r)}>
                  {r}×
                </Pill>
              ))}
            </Pills>
          </Card>
        ),
      });
    }

    list.push({
      id: 'quality',
      tab: 'playback',
      title: 'Video quality',
      keywords: 'resolution 480p 1080p hd bitrate',
      node: (
        <Card title="Video quality" description="Only qualities this source really offers are listed.">
          {adaptiveOptions && adaptive ? (
            <Pills label="Video quality">
              {adaptiveOptions.map((o) => (
                <Pill key={o.value} selected={adaptive.value === o.value} disabled={o.disabled} onClick={() => adaptive.setValue(o.value)}>
                  {o.label}
                </Pill>
              ))}
            </Pills>
          ) : fileQualities ? (
            <>
              <Pills label="Video quality">
                {fileQualities.options.map((o) => (
                  <Pill key={o.id} selected={fileQualities.activeId === o.id} onClick={() => fileQualities.onChange(o.id)}>
                    {o.label}
                  </Pill>
                ))}
              </Pills>
              <p className="cs-card-desc">Changing quality reloads the file and keeps your place.</p>
            </>
          ) : (
            <Empty>This source offers a single quality.</Empty>
          )}
        </Card>
      ),
    });

    if (audioOptions && audio) {
      list.push({
        id: 'audio',
        tab: 'playback',
        title: 'Audio track',
        keywords: 'language dub commentary sound',
        node: (
          <Card title="Audio track">
            <Pills label="Audio track">
              {audioOptions.map((o) => (
                <Pill key={o.value} selected={audio.value === o.value} onClick={() => audio.setValue(o.value)}>
                  {o.label}
                </Pill>
              ))}
            </Pills>
          </Card>
        ),
      });
    }

    if (servers) {
      list.push({
        id: 'server',
        tab: 'playback',
        title: 'Source',
        keywords: 'server host mux commons archive alternative',
        node: (
          <Card title="Source" description="Where the video is streamed from. Switching keeps your place.">
            <Pills label="Source">
              {servers.options.map((o) => (
                <Pill key={o.id} selected={servers.activeId === o.id} onClick={() => servers.onChange(o.id)}>
                  {o.label}
                </Pill>
              ))}
            </Pills>
          </Card>
        ),
      });
    }

    if (segments.length > 0) {
      list.push({
        id: 'skip',
        tab: 'playback',
        title: 'Skip segments',
        keywords: 'intro recap credits',
        node: (
          <Card title="Skip segments">
            <Pills>
              {segments.map((s) => (
                <button key={s.type + s.start} type="button" className="cs-chip" onClick={() => props.onSkip(s.end, SEGMENT_LABEL[s.type])}>
                  {SEGMENT_LABEL[s.type]} <span className="cs-tag">{formatTime(s.start)}–{formatTime(s.end)}</span>
                </button>
              ))}
            </Pills>
          </Card>
        ),
      });
    }

    if (props.download) {
      const d = props.download;
      list.push({
        id: 'download',
        tab: 'playback',
        title: 'Download',
        keywords: 'save file offline licence',
        node: (
          <Card title="Download" description={d.note}>
            <div className="cs-chips">
              <a className="cs-chip" href={d.href} download={d.filename} target="_blank" rel="noreferrer">
                Open file to save
              </a>
            </div>
          </Card>
        ),
      });
    }

    list.push(
      { id: 'sub-tracks', tab: 'subtitles', title: 'Subtitle language', keywords: 'captions cc enable disable show hide on off', node: <SubtitleTracksCard /> },
      {
        id: 'sub-timing',
        tab: 'subtitles',
        title: 'Timing and transcript',
        keywords: 'offset sync delay early late alignment transcript search',
        node: <SubtitleTimingCard onOpenTranscript={props.onOpenTranscript} autoSync={props.autoSync} />,
      },
      { id: 'sub-add', tab: 'subtitles', title: 'Add subtitles', keywords: 'upload srt vtt paste file local', node: <SubtitleAddCard /> },
      { id: 'sub-style', tab: 'subtitles', title: 'Subtitle appearance', keywords: 'size font typeface colour color background opacity position outline shadow', node: <SubtitleStyleCard /> },

      { id: 'profile-a', tab: 'appearance', title: 'Accessibility profile', keywords: 'preset standard high contrast large controls reduced motion', node: <ProfileCard /> },
      {
        id: 'atmosphere',
        tab: 'appearance',
        title: 'Adaptive movie atmosphere',
        keywords: 'theme background colour color accent blur opacity ambient glow light panel glass solid preset artwork poster image custom',
        node: <AppearanceCards />,
      },
      { id: 'dock', tab: 'appearance', title: 'Control dock', keywords: 'labels compact buttons layout toolbar', node: <DockCard /> },

      { id: 'profile-b', tab: 'accessibility', title: 'Accessibility profile', keywords: 'preset standard high contrast large controls reduced motion', node: <ProfileCard /> },
      { id: 'view', tab: 'accessibility', title: 'Viewing preferences', keywords: 'high contrast large controls reduce motion animation size touch', node: <ViewPrefsCard /> },

      {
        id: 'diag',
        tab: 'advanced',
        title: 'Playback diagnostics',
        keywords: 'health media information source duration dimensions tracks error technical',
        node: (
          <Card title="Playback diagnostics" description="Live readings from the player, not a compliance certificate.">
            <DiagnosticsBody extraRows={props.diagnosticsRows ?? []} />
          </Card>
        ),
      },
      {
        id: 'shortcuts',
        tab: 'advanced',
        title: 'Keyboard shortcuts',
        keywords: 'keys hotkeys help keyboard',
        node: (
          <Card title="Keyboard shortcuts" description="Every shortcut, grouped and searchable.">
            <div className="cs-chips">
              <button type="button" className="cs-chip" onClick={props.onOpenHelp}>
                Show shortcuts
              </button>
            </div>
          </Card>
        ),
      },
      {
        id: 'reset',
        tab: 'advanced',
        title: 'Reset preferences',
        keywords: 'restore default clear appearance accessibility',
        node: (
          <Card title="Reset preferences" description="Restores the default appearance, accessibility and dock settings. Your saved moments and subtitles are kept.">
            <div className="cs-chips">
              <button type="button" className="cs-chip cs-chip-danger" onClick={props.onResetAll}>
                Restore defaults
              </button>
            </div>
          </Card>
        ),
      },
    );
    return list;
  })();

  const q = query.trim().toLowerCase();
  const results = q
    ? entries.filter((e) => {
        if (e.id === 'profile-b') return false; // same card as profile-a
        const hay = `${e.title} ${e.keywords} ${TABS.find((t) => t.id === e.tab)?.label ?? ''}`.toLowerCase();
        return q.split(/\s+/).every((w) => hay.includes(w));
      })
    : [];
  const tabEntries = entries.filter((e) => e.tab === tab);
  const tabLabel = (t: SettingsTab) => TABS.find((x) => x.id === t)?.label ?? '';

  return (
    <FloatingPanel open={open} onClose={onClose} title="Settings" wide returnFocusTo={returnFocusTo}>
      <div className="cs-sethead">
        <label className="cs-search">
          <span className="cs-sr">Search settings</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings"
            aria-describedby={`${baseId}-count`}
          />
        </label>
        {!q ? (
          <div ref={tablistRef} className="cs-tabs" role="tablist" aria-label="Settings categories">
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`${baseId}-tab-${t.id}`}
                type="button"
                role="tab"
                className="cs-tab"
                aria-selected={tab === t.id}
                aria-controls={`${baseId}-panel`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => onTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
        <p id={`${baseId}-count`} className="cs-sr" role="status">
          {q ? `${results.length} ${results.length === 1 ? 'setting matches' : 'settings match'}` : ''}
        </p>
      </div>

      <div
        id={`${baseId}-panel`}
        className="cs-cards"
        role={q ? 'region' : 'tabpanel'}
        aria-label={q ? 'Search results' : undefined}
        aria-labelledby={q ? undefined : `${baseId}-tab-${tab}`}
      >
        {q ? (
          results.length === 0 ? (
            <Empty>No setting matches “{query.trim()}”. Try “speed”, “captions”, “contrast” or “theme”.</Empty>
          ) : (
            results.map((e) => (
              <div key={e.id} className="cs-result">
                <p className="cs-result-cat">{tabLabel(e.tab)}</p>
                {e.node}
              </div>
            ))
          )
        ) : (
          tabEntries.map((e) => <div key={e.id}>{e.node}</div>)
        )}
      </div>
    </FloatingPanel>
  );
}
