import {
  Container,
  Controls,
  ErrorDialog,
  FullscreenButton,
  Gesture,
  Hotkey,
  MuteButton,
  PiPButton,
  PlayButton,
  SeekButton,
  StatusAnnouncer,
  Time,
  TimeSlider,
  VolumeSlider,
  useMedia,
} from '@videojs/react';
import { usePlayer } from '@videojs/react/video';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { AppearanceProvider, useAppearance, type SkinPalette } from './appearance/AppearanceContext';
import { Atmosphere } from './appearance/Atmosphere';
import { ClipPanel, EMPTY_CLIP, type Clip } from './ClipPanel';
import { DiagnosticsDialog, type DiagRow } from './DiagnosticsDialog';
import { clamp, formatTime } from './format';
import { useWidthTier, type Tier } from './hooks';
import {
  BookmarkIcon,
  CaptionsIcon,
  CastIcon,
  ChevronLeftIcon,
  ClipIcon,
  CompassIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  HelpIcon,
  MoreIcon,
  MuteIcon,
  PaletteIcon,
  PauseIcon,
  PipIcon,
  PlayIcon,
  PulseIcon,
  ReplayIcon,
  ScrimIcon,
  SeekBackIcon,
  SeekForwardIcon,
  SettingsIcon,
  VolumeIcon,
} from './icons';
import { KeymapDialog } from './KeymapDialog';
import { FloatingPanel } from './FloatingPanel';
import { PrefsProvider, usePrefs } from './prefs/PrefsContext';
import { SettingsPanel, type ChoiceSet, type DownloadInfo, type SettingsTab, type SkipSegment } from './SettingsPanel';
import { CaptionOverlay } from './subtitles/CaptionOverlay';
import type { AutoSync } from './subtitles/SubtitleCards';
import { SubtitleProvider, useSubtitles } from './subtitles/SubtitleContext';
import { TranscriptPanel } from './subtitles/TranscriptPanel';
import { loadPrefs, savePrefs, SCRIM_MODES, type ScrimMode } from './storage';
import '@fontsource-variable/space-grotesk';
import './tokens.css';
import './cinema-skin.css';
import './panels.css';
import './appearance/appearance.css';
import './polish.css';
import './instrument.css';

export type SkinMode = 'watch' | 'explore' | 'remember';

export interface TimelineMarker {
  time: number;
  kind: 'moment' | 'anchor' | 'scene';
  label: string;
}

/** What the timeline shows while the pointer is over a position: a real still and a name, when the host has them. */
export interface ScenePreview {
  image?: string | null;
  label?: string;
}

interface SkinContextValue {
  mode: SkinMode;
  setMode: (mode: SkinMode) => void;
  /** Polite screen-reader + visual status message. */
  announce: (message: string) => void;
  /** Layout tier derived from the player's real container width. */
  tier: Tier;
}

const SkinContext = createContext<SkinContextValue | null>(null);

export function useCinemaSkin(): SkinContextValue {
  const ctx = useContext(SkinContext);
  if (!ctx) throw new Error('useCinemaSkin must be used inside <CinemaSkin>');
  return ctx;
}

export interface CinemaSkinProps {
  /** The media element, e.g. <Video src="..." playsInline />. */
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** Identifies the film for per-film storage of uploaded subtitles. Defaults to a shared key. */
  mediaKey?: string;
  /** Left rail shown in Explore mode (the navigation wheel). Optional: omit for a plain one-video embed. */
  railSlot?: ReactNode;
  /** Panel shown under the video in Remember mode (the moment atlas). Optional. */
  atlasSlot?: ReactNode;
  /** Extra buttons for the top-right toolbar. On very small players they move into the More menu. */
  topActions?: ReactNode;
  /** Ticks drawn over the seek bar. They never take pointer events. */
  markers?: TimelineMarker[];
  /** When set, a "Save moment" button appears in the control bar. */
  onSaveMoment?: () => void;
  /** Extra rows for the Player health dialog. */
  diagnosticsRows?: DiagRow[];
  defaultMode?: SkinMode;
  className?: string;
  /**
   * Lets the host announce a message through the skin's live region. Pass a new object (new `id`) per message.
   */
  notice?: { id: number; message: string } | null;

  /* ---- Optional settings data. Each card appears only when its data is real. ---- */
  /** Real quality variants (separate files). Adaptive renditions from HLS/Mux are detected automatically. */
  qualities?: ChoiceSet;
  /** Alternative playback servers; the card shows only with two or more. */
  servers?: ChoiceSet;
  /** Intro / recap / credits ranges. A skip button appears while playback is inside one. */
  segments?: SkipSegment[];
  /** Download link; pass only when the provider/licence permits downloading. */
  download?: DownloadInfo;
  /** Alignment service for subtitles. The button is omitted when not provided. */
  autoSync?: AutoSync;
  /** Called to build a shareable link for a clip; the share button is omitted when not provided. */
  onShareClip?: (start: number, end: number) => void;
  initialClip?: Clip;
  /** Called when the viewer uses a skip button or jumps via the transcript. */
  onJump?: (time: number, label: string) => void;
  /** Licensed artwork for the selected film. Used only when the viewer turns Adaptive atmosphere on. */
  artwork?: string | null;
  /** Credit line shown in the Appearance settings, e.g. "Still frame from Sintel (CC BY 3.0)". */
  artworkLabel?: string;
  /** The film's signature colours. Every surface, control and highlight is re-coloured from them. */
  palette?: SkinPalette | null;
  /** Content floated over the stage, above the controls (the host uses it for the Time Portal). */
  stageSlot?: ReactNode;
  /** Returns a still and a name for a timeline position. Omit it and the timeline shows the time alone. */
  scenePreview?: (time: number) => ScenePreview | null;

  /**
   * Content drawn over the video but beneath captions and controls (hosts use it for footage simulation).
   * It never receives pointer events. Not needed in normal use.
   */
  videoOverlay?: ReactNode;
  /** Previews the strongest readable control styling without touching the viewer's saved preferences. */
  forceHighContrast?: boolean;
}

const SCRIM_LABEL: Record<ScrimMode, string> = {
  default: 'Default',
  'high-contrast': 'High contrast',
  theater: 'Theater',
};

type PanelName = 'settings' | 'transcript' | 'clip' | 'more';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function CinemaSkin(props: CinemaSkinProps) {
  return (
    <AppearanceProvider artwork={props.artwork} artworkLabel={props.artworkLabel} palette={props.palette}>
      <PrefsProvider forceHighContrast={props.forceHighContrast}>
        <SubtitleProvider mediaKey={props.mediaKey ?? 'default'}>
          <SkinInner {...props} />
        </SubtitleProvider>
      </PrefsProvider>
    </AppearanceProvider>
  );
}

function SkinInner({
  children,
  title,
  subtitle,
  railSlot,
  atlasSlot,
  topActions,
  markers,
  onSaveMoment,
  diagnosticsRows,
  defaultMode = 'watch',
  className,
  notice,
  qualities,
  servers,
  segments,
  download,
  autoSync,
  onShareClip,
  initialClip,
  onJump,
  videoOverlay,
  stageSlot,
  scenePreview,
}: CinemaSkinProps) {
  const store = usePlayer();
  const media = useMedia() as HTMLMediaElement | null;
  const subs = useSubtitles();
  const look = useAppearance();
  const view = usePrefs();
  const wrapRef = useRef<HTMLDivElement>(null);
  const { tier } = useWidthTier(wrapRef);

  const [mode, setModeState] = useState<SkinMode>(defaultMode);
  const [scrim, setScrim] = useState<ScrimMode>(() => loadPrefs().scrim);
  const [helpOpen, setHelpOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('playback');
  const [panelOpener, setPanelOpener] = useState<HTMLElement | null>(null);
  const [clip, setClip] = useState<Clip>(initialClip ?? EMPTY_CLIP);
  const clipRun = useRef(false); // true while "Play clip" is running without looping

  const hasModes = Boolean(railSlot || atlasSlot);
  const effectiveMode: SkinMode =
    mode === 'explore' && !railSlot ? 'watch' : mode === 'remember' && !atlasSlot ? 'watch' : mode;

  const setMode = useCallback((m: SkinMode) => setModeState(m), []);
  const announce = useCallback((message: string) => {
    // Clear first so repeating the same message is announced again.
    setStatus('');
    window.setTimeout(() => setStatus(message), 30);
  }, []);

  const noticeId = notice?.id;
  const noticeMessage = notice?.message;
  useEffect(() => {
    if (noticeId !== undefined && noticeMessage) announce(noticeMessage);
  }, [noticeId, noticeMessage, announce]);

  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(''), 4000);
    return () => window.clearTimeout(t);
  }, [status]);

  /* ---- panels ---- */
  const openPanel = (name: PanelName, opener?: HTMLElement | null) => {
    setPanelOpener(opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null));
    setPanel(name);
  };
  const closePanel = () => setPanel(null);
  const toggleSimple = (name: Exclude<PanelName, 'settings'>, opener: HTMLElement) =>
    panel === name ? closePanel() : openPanel(name, opener);
  /** Settings is one panel with five tabs; callers pick the tab to land on. */
  const toggleSettings = (tab: SettingsTab | null, opener: HTMLElement) => {
    if (panel === 'settings' && (tab === null || tab === settingsTab)) return closePanel();
    if (tab) setSettingsTab(tab);
    openPanel('settings', opener);
  };

  /* ---- clip looping: checked on a short interval, tighter than the 4 Hz timeupdate ---- */
  const clipEnd = clip.end;
  const clipStart = clip.start;
  const clipLoop = clip.loop;
  useEffect(() => {
    if (!media || clipEnd === null || clipStart === null || clipEnd <= clipStart) return;
    // A short interval rather than rAF: it keeps running when the tab is in the background, and 40 ms is
    // far tighter than the ~250 ms timeupdate event.
    const tick = () => {
      if (!media.paused && media.currentTime >= clipEnd) {
        if (clipLoop) {
          media.currentTime = clipStart;
        } else if (clipRun.current) {
          clipRun.current = false;
          media.pause();
        }
      }
    };
    const id = window.setInterval(tick, 40);
    return () => window.clearInterval(id);
  }, [media, clipStart, clipEnd, clipLoop]);

  const playClip = () => {
    if (clipStart === null || clipEnd === null) return;
    clipRun.current = true;
    void store.seek(clipStart);
    void store.play();
    announce(`Playing clip ${clipStart.toFixed(0)} to ${clipEnd.toFixed(0)} seconds`);
  };

  const cycleScrim = () => {
    const next = SCRIM_MODES[(SCRIM_MODES.indexOf(scrim) + 1) % SCRIM_MODES.length] ?? 'default';
    setScrim(next);
    savePrefs({ scrim: next });
    announce(`Scrim: ${SCRIM_LABEL[next]}`);
  };

  const resetAll = () => {
    view.reset();
    look.reset();
    setScrim('default');
    savePrefs({ scrim: 'default' });
    announce('Appearance, accessibility and dock settings restored to defaults');
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?') {
      e.preventDefault();
      setHelpOpen(true);
    } else if ((e.key === 'c' || e.key === 'C') && !(e.target as HTMLElement).closest('.cs-panel, .cs-rail, .cs-atlas')) {
      e.preventDefault();
      if (subs.tracks.length === 0) announce('No subtitles available. Open the subtitle settings to add some.');
      else {
        subs.toggle();
        announce(subs.active ? 'Captions off' : 'Captions on');
      }
    }
  };

  const ctx = useMemo<SkinContextValue>(() => ({ mode: effectiveMode, setMode, announce, tier }), [effectiveMode, setMode, announce, tier]);

  const jump = (time: number, label: string) => {
    if (onJump) onJump(time, label);
    else void store.seek(time);
  };

  const reduced = view.prefs.reducedMotion;

  return (
    <SkinContext.Provider value={ctx}>
      <Container
        className={`cs-root ${className ?? ''}`}
        data-scrim={scrim}
        data-mode={effectiveMode}
        data-atm={look.derived.active ? 'on' : 'off'}
        data-has-rail={railSlot ? '' : undefined}
        data-rail={look.wheelCollapsed ? 'collapsed' : 'open'}
        data-tier={tier}
        data-large={view.prefs.largeControls || undefined}
        data-hc={view.highContrast || undefined}
        data-motion={reduced ? 'reduce' : undefined}
        data-dock-labels={view.prefs.dockLabels ? 'on' : 'off'}
        data-dock-compact={view.prefs.dockCompact || undefined}
        data-theme="cinema"
        style={look.cssVars}
      >
        <Atmosphere />
        <div className="cs-layout" onKeyDown={onKeyDown}>
          {railSlot ? (
            <section className="cs-rail" aria-label="Navigate films and scenes" inert={effectiveMode !== 'explore'}>
              <div className="cs-rail-inner">
                <div className="cs-rail-bar">
                  <span className="cs-rail-title" aria-hidden="true">
                    Navigate
                  </span>
                  <button
                    type="button"
                    className="cs-icon-btn cs-rail-toggle"
                    aria-expanded={!look.wheelCollapsed}
                    aria-controls="cs-rail-body"
                    aria-label={look.wheelCollapsed ? 'Expand the wheel panel' : 'Collapse the wheel panel'}
                    data-tip={look.wheelCollapsed ? 'Expand wheel' : 'Collapse wheel'}
                    data-tip-align="end"
                    onClick={() => {
                      look.setWheelCollapsed(!look.wheelCollapsed);
                      announce(look.wheelCollapsed ? 'Wheel panel expanded' : 'Wheel panel collapsed');
                    }}
                  >
                    <ChevronLeftIcon />
                  </button>
                </div>
                {/* inert removes the hidden wheel from the tab order and the accessibility tree while collapsed. */}
                <div id="cs-rail-body" className="cs-rail-body" inert={look.wheelCollapsed}>
                  {railSlot}
                </div>
              </div>
            </section>
          ) : null}

          <div ref={wrapRef} className="cs-stagewrap" data-tier={tier}>
            <div className="cs-stage">
              {children}
              {videoOverlay ? (
                <div className="cs-video-overlay" aria-hidden="true">
                  {videoOverlay}
                </div>
              ) : null}
              <CaptionOverlay />
              <Controls.Root>
                <Controls.Content className="cs-controls">
                  <TopBar
                    title={title}
                    subtitle={subtitle}
                    tier={tier}
                    hasModes={hasModes}
                    mode={effectiveMode}
                    onMode={setMode}
                    showAtlas={Boolean(atlasSlot)}
                    showRail={Boolean(railSlot)}
                    scrim={scrim}
                    onScrim={cycleScrim}
                    onHelp={() => setHelpOpen(true)}
                    onDiag={() => setDiagOpen(true)}
                    onAppearance={(el) => toggleSettings('appearance', el)}
                    appearanceOpen={panel === 'settings' && settingsTab === 'appearance'}
                    extra={topActions}
                  />
                  <CenterCluster />
                  <BottomBar
                    tier={tier}
                    markers={markers}
                    scenePreview={scenePreview}
                    clip={clip}
                    onSaveMoment={onSaveMoment}
                    panel={panel}
                    settingsTab={settingsTab}
                    onSettings={(tab, el) => toggleSettings(tab, el)}
                    onSimple={toggleSimple}
                  />
                </Controls.Content>
              </Controls.Root>
              <SkipButton segments={segments} onSkip={jump} />
              <LoadingState />
              <p className="cs-toast" role="status" aria-live="polite">
                {status}
              </p>
            </div>

            {/* Panels live beside the stage, not inside it: over the video on wide players, under it on small ones. */}
            <SettingsPanel
              open={panel === 'settings'}
              onClose={closePanel}
              returnFocusTo={panelOpener}
              tab={settingsTab}
              onTab={setSettingsTab}
              onOpenTranscript={() => openPanel('transcript', panelOpener)}
              onOpenHelp={() => setHelpOpen(true)}
              onResetAll={resetAll}
              qualities={qualities}
              servers={servers}
              segments={segments}
              download={download}
              autoSync={autoSync}
              diagnosticsRows={diagnosticsRows}
              onSkip={jump}
            />
            <TranscriptPanel
              open={panel === 'transcript'}
              onClose={closePanel}
              returnFocusTo={panelOpener}
              onSeek={(t) => jump(t, 'Transcript line')}
            />
            <ClipPanel
              open={panel === 'clip'}
              onClose={closePanel}
              returnFocusTo={panelOpener}
              clip={clip}
              onChange={setClip}
              onPlay={playClip}
              onAnnounce={announce}
              onShare={onShareClip}
            />
            <MorePanel
              open={panel === 'more'}
              onClose={closePanel}
              returnFocusTo={panelOpener}
              tier={tier}
              onSaveMoment={onSaveMoment}
              onClip={() => openPanel('clip', panelOpener)}
              onSettings={(tab) => {
                setSettingsTab(tab);
                openPanel('settings', panelOpener);
              }}
              onScrim={cycleScrim}
              scrim={scrim}
              onDiag={() => setDiagOpen(true)}
              onHelp={() => setHelpOpen(true)}
              extra={topActions}
            />
            {stageSlot}
          </div>

          {atlasSlot ? (
            <section className="cs-atlas" aria-label="My Atlas: saved moments" inert={effectiveMode !== 'remember'}>
              <div className="cs-atlas-inner">{atlasSlot}</div>
            </section>
          ) : null}
        </div>

        <KeymapDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
        <DiagnosticsDialog open={diagOpen} onClose={() => setDiagOpen(false)} extraRows={diagnosticsRows} />

        {/* Hotkeys listen on the container, so they are scoped to this player and ignore typing in fields.
            "C" is handled above because captions are drawn by the skin, not by native text tracks. */}
        <Hotkey keys="Space" action="togglePaused" />
        <Hotkey keys="k" action="togglePaused" />
        <Hotkey keys="m" action="toggleMuted" />
        <Hotkey keys="f" action="toggleFullscreen" />
        <Hotkey keys="i" action="togglePictureInPicture" />
        <Hotkey keys="ArrowLeft" action="seekStep" value={-10} />
        <Hotkey keys="ArrowRight" action="seekStep" value={10} />
        <Hotkey keys="j" action="seekStep" value={-10} />
        <Hotkey keys="l" action="seekStep" value={10} />
        <Hotkey keys="ArrowUp" action="volumeStep" value={0.1} />
        <Hotkey keys="ArrowDown" action="volumeStep" value={-0.1} />
        <Gesture type="tap" action="togglePaused" pointer="mouse" region="center" />
        <Gesture type="tap" action="toggleControls" pointer="touch" />
        <Gesture type="doubletap" action="seekStep" value={-10} region="left" />
        <Gesture type="doubletap" action="seekStep" value={10} region="right" />
        {/* Announces Playing, Paused, Muted and seeks to screen readers. The class keeps it in the accessibility
            tree but off screen; it must never be hidden with display or visibility. */}
        <StatusAnnouncer className="cs-sr cs-announcer" />

        <ErrorDialog.Root>
          <ErrorDialog.Popup className="cs-error">
            <ErrorDialog.Title className="cs-error-title" />
            <ErrorDialog.Description className="cs-error-desc" />
            <div className="cs-error-actions">
              <button
                type="button"
                className="cs-btn cs-btn-label"
                onClick={() => {
                  store.dismissError();
                  media?.load();
                }}
              >
                <span>Try again</span>
              </button>
              <ErrorDialog.Close className="cs-btn cs-btn-label" />
            </div>
          </ErrorDialog.Popup>
        </ErrorDialog.Root>
      </Container>
    </SkinContext.Provider>
  );
}

/* ------------------------------------------------------------------ */

interface TopBarProps {
  title?: string;
  subtitle?: string;
  tier: Tier;
  hasModes: boolean;
  mode: SkinMode;
  onMode: (m: SkinMode) => void;
  showRail: boolean;
  showAtlas: boolean;
  scrim: ScrimMode;
  onScrim: () => void;
  onHelp: () => void;
  onDiag: () => void;
  onAppearance: (opener: HTMLElement) => void;
  appearanceOpen: boolean;
  extra?: ReactNode;
}

function TopBar(p: TopBarProps) {
  const tiny = p.tier === 'tiny' || p.tier === 'micro';
  return (
    <div className="cs-top">
      {!tiny ? (
        <div className="cs-titleblock">
          {p.title ? <p className="cs-title">{p.title}</p> : null}
          {p.subtitle ? <p className="cs-subtitle">{p.subtitle}</p> : null}
        </div>
      ) : null}
      <div className="cs-toolbar">
        {p.hasModes ? (
          <div className="cs-seg" role="group" aria-label="View mode">
            <button type="button" className="cs-seg-btn" aria-pressed={p.mode === 'watch'} onClick={() => p.onMode('watch')}>
              <PlayIcon /> <span>Watch</span>
            </button>
            {p.showRail ? (
              <button type="button" className="cs-seg-btn" aria-pressed={p.mode === 'explore'} onClick={() => p.onMode('explore')}>
                <CompassIcon /> <span>Explore</span>
              </button>
            ) : null}
            {p.showAtlas ? (
              <button type="button" className="cs-seg-btn" aria-pressed={p.mode === 'remember'} onClick={() => p.onMode('remember')}>
                <BookmarkIcon /> <span>My Atlas</span>
              </button>
            ) : null}
          </div>
        ) : null}
        {!tiny ? (
          <>
            {p.extra}
            <button type="button" className="cs-icon-btn" onClick={p.onScrim} aria-label={`Change scrim. Current: ${SCRIM_LABEL[p.scrim]}`} data-tip={`Scrim: ${SCRIM_LABEL[p.scrim]}`} data-tip-pos="below">
              <ScrimIcon />
            </button>
            <button
              type="button"
              className="cs-icon-btn"
              data-panel-toggle
              aria-expanded={p.appearanceOpen}
              aria-haspopup="dialog"
              aria-label="Appearance settings"
              data-tip="Appearance"
              data-tip-pos="below"
              onClick={(e) => p.onAppearance(e.currentTarget)}
            >
              <PaletteIcon />
            </button>
            <button type="button" className="cs-icon-btn" onClick={p.onDiag} aria-label="Open player health" data-tip="Player health" data-tip-pos="below">
              <PulseIcon />
            </button>
            <button type="button" className="cs-icon-btn" onClick={p.onHelp} aria-label="Open keyboard shortcuts" data-tip="Shortcuts (?)" data-tip-pos="below" data-tip-align="end">
              <HelpIcon />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function CenterCluster() {
  const ended = usePlayer((s) => s.ended);
  return (
    <div className="cs-center">
      <SeekButton
        seconds={-10}
        className="cs-btn cs-btn-round"
        render={(props) => (
          <button {...props} data-tip="Back 10 s (J)">
            <SeekBackIcon />
            <span className="cs-seek-num">10</span>
          </button>
        )}
      />
      <PlayButton
        className="cs-btn cs-btn-play"
        render={(props, state) => (
          <button {...props} data-tip={state.ended || ended ? 'Replay (K)' : state.paused ? 'Play (K)' : 'Pause (K)'}>
            {state.ended || ended ? <ReplayIcon /> : state.paused ? <PlayIcon /> : <PauseIcon />}
          </button>
        )}
      />
      <SeekButton
        seconds={10}
        className="cs-btn cs-btn-round"
        render={(props) => (
          <button {...props} data-tip="Forward 10 s (L)">
            <SeekForwardIcon />
            <span className="cs-seek-num">10</span>
          </button>
        )}
      />
    </div>
  );
}

/** Spinner for buffering and for the first load, with a visible label so it is never a mystery. */
function LoadingState() {
  const waiting = usePlayer((s) => s.waiting);
  const paused = usePlayer((s) => s.paused);
  const canPlay = usePlayer((s) => s.canPlay);
  const error = usePlayer((s) => s.error);
  const initial = !canPlay && !error;
  if (!(initial || (waiting && !paused))) return null;
  return (
    <div className="cs-buffering" role="status" data-initial={initial || undefined}>
      <span className="cs-spinner" aria-hidden="true" />
      <span className={initial ? 'cs-loading-label' : 'cs-sr'}>{initial ? 'Loading video…' : 'Buffering'}</span>
    </div>
  );
}

/** A skip button that appears only while playback is inside an intro / recap / credits range. */
function SkipButton({ segments, onSkip }: { segments?: SkipSegment[]; onSkip: (t: number, label: string) => void }) {
  const idx = usePlayer((s) => (segments ?? []).findIndex((g) => s.currentTime >= g.start && s.currentTime < g.end - 1));
  const seg = idx >= 0 ? segments?.[idx] : undefined;
  if (!seg) return null;
  const label = { intro: 'Skip intro', recap: 'Skip recap', credits: 'Skip credits' }[seg.type];
  return (
    <button type="button" className="cs-btn cs-btn-label cs-skip" data-keep onClick={() => onSkip(seg.end, label)}>
      <span>{label}</span>
    </button>
  );
}

function Markers({ markers, clip }: { markers: TimelineMarker[]; clip: Clip }) {
  const duration = usePlayer((s) => s.duration);
  if (!(duration > 0)) return null;
  const pct = (t: number) => `${clamp((t / duration) * 100, 0, 100)}%`;
  return (
    <>
      {clip.start !== null && clip.end !== null && clip.end > clip.start ? (
        <span
          className="cs-clip-range"
          aria-hidden="true"
          style={{ left: pct(clip.start), width: `${clamp(((clip.end - clip.start) / duration) * 100, 0, 100)}%` }}
        />
      ) : null}
      {markers.map((m, i) => (
        <span key={`${m.kind}-${m.time}-${i}`} className="cs-marker" data-kind={m.kind} style={{ left: pct(m.time) }} aria-hidden="true" />
      ))}
    </>
  );
}

/**
 * The seek bar plus a pointer preview. The preview never claims to be a live frame: it shows the still and name
 * the host supplies for that part of the film, with the exact time under the pointer. It is decorative for
 * assistive technology, because the slider already speaks its own value.
 */
function Timeline({
  markers,
  clip,
  scenePreview,
}: {
  markers: TimelineMarker[];
  clip: Clip;
  scenePreview?: (time: number) => ScenePreview | null;
}) {
  const duration = usePlayer((s) => s.duration);
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [badImage, setBadImage] = useState<string | null>(null);
  const time = hover !== null ? hover * duration : 0;
  const info = hover !== null && scenePreview ? scenePreview(time) : null;
  const image = info?.image && info.image !== badImage ? info.image : null;
  return (
    <div
      ref={ref}
      className="cs-tl"
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (r && r.width > 0 && duration > 0) setHover(clamp((e.clientX - r.left) / r.width, 0, 1));
      }}
      onPointerLeave={() => setHover(null)}
      onPointerCancel={() => setHover(null)}
    >
      {hover !== null && duration > 0 ? (
        <div className="cs-tl-preview" aria-hidden="true" data-image={image ? '' : undefined} style={{ ['--x' as string]: `${hover * 100}%` }}>
          {image ? <img src={image} alt="" draggable={false} onError={() => setBadImage(image)} /> : null}
          <span className="cs-tl-meta">
            {info?.label ? <span className="cs-tl-label">{info.label}</span> : null}
            <span className="cs-tl-time">{formatTime(time)}</span>
          </span>
        </div>
      ) : null}
      <TimeSlider.Root className="cs-timeslider">
        <TimeSlider.Track className="cs-track">
          <TimeSlider.Buffer className="cs-buffer" />
          <TimeSlider.Fill className="cs-fill" />
        </TimeSlider.Track>
        <Markers markers={markers} clip={clip} />
        <TimeSlider.Thumb className="cs-thumb" />
      </TimeSlider.Root>
    </div>
  );
}

interface BottomProps {
  tier: Tier;
  markers?: TimelineMarker[];
  scenePreview?: (time: number) => ScenePreview | null;
  clip: Clip;
  onSaveMoment?: () => void;
  panel: PanelName | null;
  settingsTab: SettingsTab;
  onSettings: (tab: SettingsTab | null, opener: HTMLElement) => void;
  onSimple: (name: 'clip' | 'transcript' | 'more', opener: HTMLElement) => void;
}

function BottomBar({ tier, markers, scenePreview, clip, onSaveMoment, panel, settingsTab, onSettings, onSimple }: BottomProps) {
  const store = usePlayer();
  const pip = usePlayer((s) => s.pictureInPictureAvailability);
  const cast = usePlayer((s) => s.remotePlaybackAvailability);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const subs = useSubtitles();
  const tiny = tier === 'tiny' || tier === 'micro';
  const micro = tier === 'micro';
  const hasClip = clip.start !== null || clip.end !== null;

  return (
    <div className="cs-bottom">
      <Timeline markers={markers ?? []} clip={clip} scenePreview={scenePreview} />

      <Controls.Group className="cs-row" aria-label="Playback controls">
        <div className="cs-time">
          <Time.Value type="current" />
          <span aria-hidden="true">/</span>
          <Time.Value type="duration" />
        </div>

        <div className="cs-spacer" />

        {!tiny && onSaveMoment ? (
          <button type="button" className="cs-btn cs-btn-label" onClick={onSaveMoment} data-tip="Save this moment">
            <BookmarkIcon />
            <span>Save moment</span>
          </button>
        ) : null}

        {!tiny ? (
          <button
            type="button"
            className="cs-btn"
            data-panel-toggle
            data-on={hasClip ? '' : undefined}
            aria-expanded={panel === 'clip'}
            aria-haspopup="dialog"
            aria-label="Clip selection"
            data-tip="Clip"
            onClick={(e) => onSimple('clip', e.currentTarget)}
          >
            <ClipIcon />
          </button>
        ) : null}

        <div className="cs-volume">
          <MuteButton
            className="cs-btn"
            render={(props, state) => (
              <button {...props} data-tip={state.muted || volume === 0 || muted ? 'Unmute (M)' : 'Mute (M)'}>
                {state.muted || volume === 0 || muted ? <MuteIcon /> : <VolumeIcon />}
              </button>
            )}
          />
          {!tiny ? (
            <VolumeSlider.Root className="cs-volslider">
              <VolumeSlider.Track className="cs-track">
                <VolumeSlider.Fill className="cs-fill" />
              </VolumeSlider.Track>
              <VolumeSlider.Thumb className="cs-thumb" />
            </VolumeSlider.Root>
          ) : null}
        </div>

        {!tiny ? (
        <button
          type="button"
          className="cs-btn"
          data-panel-toggle
          data-on={subs.active ? '' : undefined}
          aria-expanded={panel === 'settings' && settingsTab === 'subtitles'}
          aria-haspopup="dialog"
          aria-label={subs.active ? `Subtitles: ${subs.active.label}` : 'Subtitles: off'}
          data-tip="Subtitles (C)"
          onClick={(e) => onSettings('subtitles', e.currentTarget)}
        >
          <CaptionsIcon />
        </button>
        ) : null}

        {!tiny && cast === 'available' ? (
          <button type="button" className="cs-btn" aria-label="Cast to a device" data-tip="Cast" onClick={() => void store.promptRemotePlayback()}>
            <CastIcon />
          </button>
        ) : null}

        {!tiny && pip === 'available' ? (
          <PiPButton className="cs-btn" render={(props) => <button {...props} data-tip="Picture-in-picture (I)"><PipIcon /></button>} />
        ) : null}

        {!micro ? (
        <button
          type="button"
          className="cs-btn"
          data-panel-toggle
          aria-expanded={panel === 'settings' && settingsTab !== 'subtitles' && settingsTab !== 'appearance'}
          aria-haspopup="dialog"
          aria-label="Settings"
          data-tip="Settings"
          onClick={(e) => onSettings(settingsTab === 'subtitles' || settingsTab === 'appearance' ? 'playback' : null, e.currentTarget)}
        >
          <SettingsIcon />
        </button>
        ) : null}

        {tiny ? (
          <button
            type="button"
            className="cs-btn"
            data-panel-toggle
            aria-expanded={panel === 'more'}
            aria-haspopup="dialog"
            aria-label="More controls"
            data-tip="More"
            onClick={(e) => onSimple('more', e.currentTarget)}
          >
            <MoreIcon />
          </button>
        ) : null}

        <FullscreenButton
          className="cs-btn"
          render={(props, state) => (
            <button {...props} data-tip={state.fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'} data-tip-align="end">
              {state.fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
            </button>
          )}
        />
      </Controls.Group>
    </div>
  );
}

/** Secondary actions for very small players, where the dock keeps only the essentials. */
function MorePanel({
  open,
  onClose,
  returnFocusTo,
  tier,
  onSaveMoment,
  onClip,
  onSettings,
  onScrim,
  scrim,
  onDiag,
  onHelp,
  extra,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  tier: Tier;
  onSaveMoment?: () => void;
  onClip: () => void;
  onSettings: (tab: SettingsTab) => void;
  onScrim: () => void;
  scrim: ScrimMode;
  onDiag: () => void;
  onHelp: () => void;
  extra?: ReactNode;
}) {
  const store = usePlayer();
  const pip = usePlayer((s) => s.pictureInPictureAvailability);
  const cast = usePlayer((s) => s.remotePlaybackAvailability);
  const act = (fn: () => void) => () => {
    onClose();
    // Let the panel close (and return focus) before the next one opens.
    window.setTimeout(fn, 0);
  };
  return (
    <FloatingPanel open={open} onClose={onClose} title="More controls" returnFocusTo={returnFocusTo}>
      <div className="cs-more">
        {extra ? <div className="cs-more-extra">{extra}</div> : null}
        {onSaveMoment ? (
          <button type="button" className="cs-row-btn" onClick={act(onSaveMoment)}>
            <BookmarkIcon /> <span>Save this moment</span>
          </button>
        ) : null}
        <button type="button" className="cs-row-btn" onClick={act(onClip)}>
          <ClipIcon /> <span>Clip selection</span>
        </button>
        {pip === 'available' ? (
          <button type="button" className="cs-row-btn" onClick={act(() => void store.requestPictureInPicture())}>
            <PipIcon /> <span>Picture-in-picture</span>
          </button>
        ) : null}
        {cast === 'available' ? (
          <button type="button" className="cs-row-btn" onClick={act(() => void store.promptRemotePlayback())}>
            <CastIcon /> <span>Cast to a device</span>
          </button>
        ) : null}
        <button type="button" className="cs-row-btn" onClick={act(() => onSettings('subtitles'))}>
          <CaptionsIcon /> <span>Subtitles</span>
        </button>
        {tier === 'micro' ? (
          <button type="button" className="cs-row-btn" onClick={act(() => onSettings('playback'))}>
            <SettingsIcon /> <span>Settings</span>
          </button>
        ) : null}
        <button type="button" className="cs-row-btn" onClick={act(() => onSettings('appearance'))}>
          <PaletteIcon /> <span>Appearance</span>
        </button>
        <button type="button" className="cs-row-btn" onClick={onScrim}>
          <ScrimIcon /> <span>Scrim: {SCRIM_LABEL[scrim]}</span>
        </button>
        <button type="button" className="cs-row-btn" onClick={act(onDiag)}>
          <PulseIcon /> <span>Player health</span>
        </button>
        <button type="button" className="cs-row-btn" onClick={act(onHelp)}>
          <HelpIcon /> <span>Keyboard shortcuts</span>
        </button>
      </div>
    </FloatingPanel>
  );
}
