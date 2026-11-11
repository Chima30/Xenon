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
import { ClipPanel, EMPTY_CLIP, type Clip } from './ClipPanel';
import { DiagnosticsDialog, type DiagRow } from './DiagnosticsDialog';
import { KeymapDialog } from './KeymapDialog';
import { SettingsPanel, type ChoiceSet, type DownloadInfo, type SkipSegment } from './SettingsPanel';
import {
  BookmarkIcon,
  CaptionsIcon,
  CastIcon,
  ClipIcon,
  ChevronLeftIcon,
  CompassIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  HelpIcon,
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
import { clamp } from './format';
import { AppearanceProvider, useAppearance } from './appearance/AppearanceContext';
import { AppearancePanel } from './appearance/AppearancePanel';
import { Atmosphere } from './appearance/Atmosphere';
import { CaptionOverlay } from './subtitles/CaptionOverlay';
import { SubtitleProvider, useSubtitles } from './subtitles/SubtitleContext';
import { SubtitlePanel, type AutoSync } from './subtitles/SubtitlePanel';
import { TranscriptPanel } from './subtitles/TranscriptPanel';
import { loadPrefs, savePrefs, SCRIM_MODES, type ScrimMode } from './storage';
import './cinema-skin.css';
import './panels.css';
import './appearance/appearance.css';

export type SkinMode = 'watch' | 'explore' | 'remember';

export interface TimelineMarker {
  time: number;
  kind: 'moment' | 'anchor' | 'scene';
  label: string;
}

interface SkinContextValue {
  mode: SkinMode;
  setMode: (mode: SkinMode) => void;
  /** Polite screen-reader + visual status message. */
  announce: (message: string) => void;
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
  /** Extra buttons for the top-right toolbar. */
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
  /** Credit line shown in the Appearance studio, e.g. "Still frame from Sintel (CC BY 3.0)". */
  artworkLabel?: string;
}

const SCRIM_LABEL: Record<ScrimMode, string> = {
  default: 'Default',
  'high-contrast': 'High contrast',
  theater: 'Theater',
};

type PanelName = 'settings' | 'subtitles' | 'transcript' | 'clip' | 'appearance';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function CinemaSkin(props: CinemaSkinProps) {
  return (
    <AppearanceProvider artwork={props.artwork} artworkLabel={props.artworkLabel}>
      <SubtitleProvider mediaKey={props.mediaKey ?? 'default'}>
        <SkinInner {...props} />
      </SubtitleProvider>
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
}: CinemaSkinProps) {
  const store = usePlayer();
  const media = useMedia() as HTMLMediaElement | null;
  const subs = useSubtitles();
  const look = useAppearance();
  const [mode, setModeState] = useState<SkinMode>(defaultMode);
  const [scrim, setScrim] = useState<ScrimMode>(() => loadPrefs().scrim);
  const [helpOpen, setHelpOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [panel, setPanel] = useState<PanelName | null>(null);
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
  const togglePanel = (name: PanelName, opener: HTMLElement) => (panel === name ? setPanel(null) : openPanel(name, opener));
  const closePanel = () => setPanel(null);

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

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?') {
      e.preventDefault();
      setHelpOpen(true);
    } else if ((e.key === 'c' || e.key === 'C') && !(e.target as HTMLElement).closest('.cs-panel, .cs-rail, .cs-atlas')) {
      e.preventDefault();
      if (subs.tracks.length === 0) announce('No subtitles available. Open the subtitle menu to add some.');
      else {
        subs.toggle();
        announce(subs.active ? 'Captions off' : 'Captions on');
      }
    }
  };

  const ctx = useMemo<SkinContextValue>(() => ({ mode: effectiveMode, setMode, announce }), [effectiveMode, setMode, announce]);

  const jump = (time: number, label: string) => {
    if (onJump) onJump(time, label);
    else void store.seek(time);
  };

  return (
    <SkinContext.Provider value={ctx}>
      <Container
        className={`cs-root ${className ?? ''}`}
        data-scrim={scrim}
        data-mode={effectiveMode}
        data-atm={look.derived.active ? 'on' : 'off'}
        data-rail={look.wheelCollapsed ? 'collapsed' : 'open'}
        data-theme="cinema"
        style={look.cssVars}
      >
        <Atmosphere />
        <div className="cs-layout" onKeyDown={onKeyDown}>
          {effectiveMode === 'explore' && railSlot ? (
            <aside className="cs-rail" aria-label="Navigate films and scenes">
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
            </aside>
          ) : null}

          <div className="cs-stagewrap">
          <div className="cs-stage">
            {children}
            <CaptionOverlay />
            <Controls.Root>
              <Controls.Content className="cs-controls">
                <TopBar
                  title={title}
                  subtitle={subtitle}
                  hasModes={hasModes}
                  mode={effectiveMode}
                  onMode={setMode}
                  showAtlas={Boolean(atlasSlot)}
                  showRail={Boolean(railSlot)}
                  scrim={scrim}
                  onScrim={cycleScrim}
                  onHelp={() => setHelpOpen(true)}
                  onDiag={() => setDiagOpen(true)}
                  onAppearance={(el) => togglePanel('appearance', el)}
                  appearanceOpen={panel === 'appearance'}
                  extra={topActions}
                />
                <CenterCluster />
                <BottomBar
                  markers={markers}
                  clip={clip}
                  onSaveMoment={onSaveMoment}
                  panel={panel}
                  onToggle={togglePanel}
                />
              </Controls.Content>
            </Controls.Root>
            <SkipButton segments={segments} onSkip={jump} />
            <BufferingSpinner />
            <p className="cs-toast" role="status" aria-live="polite">
              {status}
            </p>
          </div>

          {/* Panels live beside the stage, not inside it: over the video on wide players, under it on phones. */}
            <SettingsPanel
              open={panel === 'settings'}
              onClose={closePanel}
              returnFocusTo={panelOpener}
              onOpenSubtitles={() => openPanel('subtitles', panelOpener)}
              qualities={qualities}
              servers={servers}
              segments={segments}
              download={download}
              onSkip={jump}
            />
            <SubtitlePanel
              open={panel === 'subtitles'}
              onClose={closePanel}
              returnFocusTo={panelOpener}
              onOpenTranscript={() => openPanel('transcript', panelOpener)}
              autoSync={autoSync}
            />
            <TranscriptPanel
              open={panel === 'transcript'}
              onClose={closePanel}
              returnFocusTo={panelOpener}
              onSeek={(t) => jump(t, 'Transcript line')}
            />
            <AppearancePanel open={panel === 'appearance'} onClose={closePanel} returnFocusTo={panelOpener} />
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
          </div>

          {effectiveMode === 'remember' && atlasSlot ? (
            <section className="cs-atlas" aria-label="My Atlas: saved moments">
              {atlasSlot}
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
        <StatusAnnouncer />

        <ErrorDialog.Root>
          <ErrorDialog.Popup className="cs-error">
            <ErrorDialog.Title className="cs-error-title" />
            <ErrorDialog.Description className="cs-error-desc" />
            <ErrorDialog.Close className="cs-btn" />
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
  return (
    <div className="cs-top">
      <div className="cs-titleblock">
        {p.title ? <p className="cs-title">{p.title}</p> : null}
        {p.subtitle ? <p className="cs-subtitle">{p.subtitle}</p> : null}
      </div>
      <div className="cs-toolbar">
        {p.hasModes ? (
          <div className="cs-seg" role="group" aria-label="View mode">
            <button
              type="button"
              className="cs-seg-btn"
              aria-pressed={p.mode === 'watch'}
              onClick={() => p.onMode('watch')}
            >
              <PlayIcon /> <span>Watch</span>
            </button>
            {p.showRail ? (
              <button
                type="button"
                className="cs-seg-btn"
                aria-pressed={p.mode === 'explore'}
                onClick={() => p.onMode('explore')}
              >
                <CompassIcon /> <span>Explore</span>
              </button>
            ) : null}
            {p.showAtlas ? (
              <button
                type="button"
                className="cs-seg-btn"
                aria-pressed={p.mode === 'remember'}
                onClick={() => p.onMode('remember')}
              >
                <BookmarkIcon /> <span>My Atlas</span>
              </button>
            ) : null}
          </div>
        ) : null}
        {p.extra}
        <button type="button" className="cs-icon-btn" onClick={p.onScrim} title={`Scrim: ${SCRIM_LABEL[p.scrim]}`}>
          <ScrimIcon />
          <span className="cs-sr">Change scrim. Current: {SCRIM_LABEL[p.scrim]}</span>
        </button>
        <button
          type="button"
          className="cs-icon-btn"
          data-panel-toggle
          aria-expanded={p.appearanceOpen}
          aria-haspopup="dialog"
          onClick={(e) => p.onAppearance(e.currentTarget)}
          title="Appearance studio"
        >
          <PaletteIcon />
          <span className="cs-sr">Open appearance studio</span>
        </button>
        <button type="button" className="cs-icon-btn" onClick={p.onDiag} title="Player health">
          <PulseIcon />
          <span className="cs-sr">Open player health</span>
        </button>
        <button type="button" className="cs-icon-btn" onClick={p.onHelp} title="Keyboard shortcuts (?)">
          <HelpIcon />
          <span className="cs-sr">Open keyboard shortcuts</span>
        </button>
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
          <button {...props}>
            <SeekBackIcon />
            <span className="cs-seek-num">10</span>
          </button>
        )}
      />
      <PlayButton
        className="cs-btn cs-btn-play"
        render={(props, state) => (
          <button {...props}>
            {state.ended || ended ? <ReplayIcon /> : state.paused ? <PlayIcon /> : <PauseIcon />}
          </button>
        )}
      />
      <SeekButton
        seconds={10}
        className="cs-btn cs-btn-round"
        render={(props) => (
          <button {...props}>
            <SeekForwardIcon />
            <span className="cs-seek-num">10</span>
          </button>
        )}
      />
    </div>
  );
}

function BufferingSpinner() {
  const waiting = usePlayer((s) => s.waiting);
  const paused = usePlayer((s) => s.paused);
  if (!waiting || paused) return null;
  return (
    <div className="cs-buffering" role="status">
      <span className="cs-spinner" aria-hidden="true" />
      <span className="cs-sr">Buffering</span>
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

interface BottomProps {
  markers?: TimelineMarker[];
  clip: Clip;
  onSaveMoment?: () => void;
  panel: PanelName | null;
  onToggle: (name: PanelName, opener: HTMLElement) => void;
}

function BottomBar({ markers, clip, onSaveMoment, panel, onToggle }: BottomProps) {
  const store = usePlayer();
  const pip = usePlayer((s) => s.pictureInPictureAvailability);
  const cast = usePlayer((s) => s.remotePlaybackAvailability);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const subs = useSubtitles();

  const toggle = (name: PanelName) => (e: React.MouseEvent<HTMLButtonElement>) => onToggle(name, e.currentTarget);
  const hasClip = clip.start !== null || clip.end !== null;

  return (
    <div className="cs-bottom">
      <TimeSlider.Root className="cs-timeslider">
        <TimeSlider.Track className="cs-track">
          <TimeSlider.Buffer className="cs-buffer" />
          <TimeSlider.Fill className="cs-fill" />
        </TimeSlider.Track>
        <Markers markers={markers ?? []} clip={clip} />
        <TimeSlider.Thumb className="cs-thumb" />
      </TimeSlider.Root>

      <Controls.Group className="cs-row" aria-label="Playback controls">
        <div className="cs-time">
          <Time.Value type="current" />
          <span aria-hidden="true">/</span>
          <Time.Value type="duration" />
        </div>

        <div className="cs-spacer" />

        {onSaveMoment ? (
          <button type="button" className="cs-btn cs-btn-label" onClick={onSaveMoment}>
            <BookmarkIcon />
            <span>Save moment</span>
          </button>
        ) : null}

        <button
          type="button"
          className="cs-btn"
          data-panel-toggle
          data-on={hasClip ? '' : undefined}
          aria-expanded={panel === 'clip'}
          aria-haspopup="dialog"
          aria-label="Clip selection"
          onClick={toggle('clip')}
        >
          <ClipIcon />
        </button>

        <div className="cs-volume">
          <MuteButton
            className="cs-btn"
            render={(props, state) => (
              <button {...props}>{state.muted || volume === 0 || muted ? <MuteIcon /> : <VolumeIcon />}</button>
            )}
          />
          <VolumeSlider.Root className="cs-volslider">
            <VolumeSlider.Track className="cs-track">
              <VolumeSlider.Fill className="cs-fill" />
            </VolumeSlider.Track>
            <VolumeSlider.Thumb className="cs-thumb" />
          </VolumeSlider.Root>
        </div>

        <button
          type="button"
          className="cs-btn"
          data-panel-toggle
          data-on={subs.active ? '' : undefined}
          aria-expanded={panel === 'subtitles' || panel === 'transcript'}
          aria-haspopup="dialog"
          aria-label={subs.active ? `Subtitles: ${subs.active.label}` : 'Subtitles: off'}
          onClick={toggle('subtitles')}
        >
          <CaptionsIcon />
        </button>

        {cast === 'available' ? (
          <button type="button" className="cs-btn" aria-label="Cast to a device" onClick={() => void store.promptRemotePlayback()}>
            <CastIcon />
          </button>
        ) : null}

        {pip === 'available' ? (
          <PiPButton className="cs-btn" render={(props) => <button {...props}><PipIcon /></button>} />
        ) : null}

        <button
          type="button"
          className="cs-btn"
          data-panel-toggle
          aria-expanded={panel === 'settings'}
          aria-haspopup="dialog"
          aria-label="Settings"
          onClick={toggle('settings')}
        >
          <SettingsIcon />
        </button>

        <FullscreenButton
          className="cs-btn"
          render={(props, state) => (
            <button {...props}>{state.fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}</button>
          )}
        />
      </Controls.Group>
    </div>
  );
}
