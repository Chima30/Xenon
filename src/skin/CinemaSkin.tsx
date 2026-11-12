import {
  Container,
  Controls,
  ErrorDialog,
  FullscreenButton,
  Gesture,
  Hotkey,
  MuteButton,
  PiPButton,
  StatusAnnouncer,
  Time,
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
import { AppearanceProvider, useAppearance, type ResolvedAtmosphere, type SkinPalette } from './appearance/AppearanceContext';
import { Atmosphere } from './appearance/Atmosphere';
import { ClipPanel, EMPTY_CLIP, type Clip } from './ClipPanel';
import { DiagnosticsDialog, type DiagRow } from './DiagnosticsDialog';
import { SceneDial } from './dock/SceneDial';
import { Timeline, type ScenePreview, type ThumbnailAt, type TimelineMarker } from './dock/Timeline';
import { TimeLens } from './dock/TimeLens';
import { Transport } from './dock/Transport';
import { formatTime } from './format';
import { useWidthTier, type Tier } from './hooks';
import {
  BookmarkIcon,
  CaptionsIcon,
  CastIcon,
  ChevronLeftIcon,
  ClipIcon,
  CompassIcon,
  DialIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  HelpIcon,
  LensIcon,
  MoreIcon,
  MuteIcon,
  PaletteIcon,
  PipIcon,
  PlayIcon,
  PulseIcon,
  ReelIcon,
  ScrimIcon,
  SettingsIcon,
  VolumeIcon,
} from './icons';
import { KeymapDialog } from './KeymapDialog';
import { FloatingPanel } from './FloatingPanel';
import { PauseCanvas } from './PauseCanvas';
import { PrefsProvider, usePrefs, type DockLayout } from './prefs/PrefsContext';
import { ReelHandle } from './ReelHandle';
import { sceneIndexAt, sceneKind, type SkinScene } from './scenes';
import { SettingsPanel, type ChoiceSet, type DownloadInfo, type SettingsTab, type SkipSegment } from './SettingsPanel';
import { CaptionOverlay } from './subtitles/CaptionOverlay';
import type { AutoSync } from './subtitles/SubtitleCards';
import { SubtitleProvider, useSubtitles } from './subtitles/SubtitleContext';
import { TranscriptPanel } from './subtitles/TranscriptPanel';
import { TimePortal, type PortalStop } from './TimePortal';
import { loadPrefs, savePrefs, SCRIM_MODES, type ScrimMode } from './storage';
import '@fontsource-variable/space-grotesk';
import './tokens.css';
import './cinema-skin.css';
import './panels.css';
import './appearance/appearance.css';
import './polish.css';
import './instrument.css';
import './hardware.css';

export type { ScenePreview, ThumbnailAt, TimelineMarker } from './dock/Timeline';
export type { SkinScene } from './scenes';

export type SkinMode = 'watch' | 'explore' | 'remember';

/** A request to show stops in the Time Portal. Nothing changes until the viewer chooses the primary action. */
export interface PortalRequest {
  stops: PortalStop[];
  index: number;
  opener?: HTMLElement | null;
  /** Label for the primary action per stop; null hides it. Defaults to "Jump here". */
  actionLabel?: (stop: PortalStop) => string | null;
  /** What the primary action does. Defaults to a jump that leaves a Return Anchor. */
  onAction?: (stop: PortalStop) => void;
}

interface SkinContextValue {
  mode: SkinMode;
  setMode: (mode: SkinMode) => void;
  /** Polite screen-reader + visual status message. */
  announce: (message: string) => void;
  /** Layout tier derived from the player's real container width. */
  tier: Tier;
  openPortal: (request: PortalRequest) => void;
  closePortal: () => void;
  /** Closes the wheel drawer in Watch mode (no effect in Explore, where the wheel is a column). */
  closeNavigation: () => void;
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
  /** The navigation wheel. Shown as a column in Explore and as a drawer from the reel handle in Watch. Optional. */
  railSlot?: ReactNode;
  /** Panel shown under the video in Remember mode (the moment atlas). Optional. */
  atlasSlot?: ReactNode;
  /** Extra buttons for the top-right toolbar. On very small players they move into the More menu. */
  topActions?: ReactNode;
  /** Saved moments and the Return Anchor, drawn on the timeline. Scene cuts come from `scenes`. */
  markers?: TimelineMarker[];
  /** When set, a "Save moment" button appears in the control bar and on the Pause Canvas. */
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
  /** Called for every intentional jump (scenes, lens, skip, transcript), so the host can keep a Return Anchor. */
  onJump?: (time: number, label: string) => void;
  /** The Return Anchor left by the last jump, offered on the Pause Canvas, Scene Dial and Time Portal. */
  returnAnchor?: { time: number; onReturn: () => void } | null;
  /** Licensed artwork for the selected film. Used only when the viewer turns Adaptive atmosphere on. */
  artwork?: string | null;
  /** Credit line shown in the Appearance settings, e.g. "Still frame from Sintel (CC BY 3.0)". */
  artworkLabel?: string;
  /** The film's signature colours. In the Adaptive theme every surface and control is re-coloured from them. */
  palette?: SkinPalette | null;
  /** Called whenever the player's atmosphere changes, so the host page can match its surroundings. */
  onAtmosphere?: (atmosphere: ResolvedAtmosphere) => void;
  /**
   * Scenes of this video: authored chapters, or plainly labelled sections. They drive the scene cuts on the
   * timeline, the Scene Dial, the Pause Canvas and the Time Lens. Omit them and those features step aside.
   */
  scenes?: SkinScene[];
  /** Returns a real still (from thumbnail metadata or a permitted frame service) for a second of the video. */
  thumbnailAt?: ThumbnailAt;
  /** Content floated over the stage, above the controls. */
  stageSlot?: ReactNode;
  /** Overrides the timeline hover preview. */
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

type PanelName = 'settings' | 'transcript' | 'clip' | 'more' | 'dial';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

const NO_SCENES: SkinScene[] = [];

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
  returnAnchor,
  artwork,
  onAtmosphere,
  scenes = NO_SCENES,
  thumbnailAt,
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
  const railRef = useRef<HTMLElement>(null);
  const reelRef = useRef<HTMLButtonElement>(null);
  const { tier, width: stageWidth } = useWidthTier(wrapRef);
  const layout: DockLayout = view.prefs.dockLayout;

  const [mode, setModeState] = useState<SkinMode>(defaultMode);
  const [scrim, setScrim] = useState<ScrimMode>(() => loadPrefs().scrim);
  const [helpOpen, setHelpOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [panel, setPanel] = useState<PanelName | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('playback');
  const [panelOpener, setPanelOpener] = useState<HTMLElement | null>(null);
  const [clip, setClip] = useState<Clip>(initialClip ?? EMPTY_CLIP);
  const [lens, setLens] = useState<{ opener: HTMLElement | null } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [portal, setPortal] = useState<PortalRequest | null>(null);
  const clipRun = useRef(false); // true while "Play clip" is running without looping

  const hasModes = Boolean(railSlot || atlasSlot);
  const effectiveMode: SkinMode =
    mode === 'explore' && !railSlot ? 'watch' : mode === 'remember' && !atlasSlot ? 'watch' : mode;
  const drawerOpen = drawer && effectiveMode === 'watch' && Boolean(railSlot);

  const setMode = useCallback((m: SkinMode) => {
    setModeState(m);
    setDrawer(false);
  }, []);
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

  // Let the host page wear the same atmosphere as the player.
  const resolved = look.resolved;
  useEffect(() => {
    onAtmosphere?.(resolved);
  }, [resolved, onAtmosphere]);

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
  const toggleLens = (opener: HTMLElement | null) => {
    if (lens) setLens(null);
    else {
      setPanel(null);
      setLens({ opener });
    }
  };

  /* ---- wheel drawer (Watch mode) ---- */
  const toggleDrawer = useCallback(() => setDrawer((d) => !d), []);
  const closeNavigation = useCallback(() => setDrawer(false), []);
  const drawerWasOpen = useRef(false);
  useEffect(() => {
    const rail = railRef.current;
    if (drawerOpen) {
      drawerWasOpen.current = true;
      // Move focus onto the wheel's current frame (or the first control) once it is no longer inert.
      requestAnimationFrame(() => {
        const target =
          rail?.querySelector<HTMLElement>('.wheel-item[tabindex="0"]') ?? rail?.querySelector<HTMLElement>('button, [tabindex="0"]');
        target?.focus({ preventScroll: true });
      });
      const onDown = (e: PointerEvent) => {
        const t = e.target as Element | null;
        if (!t || rail?.contains(t) || t.closest('.cs-reel, .tp, .cs-panel, dialog')) return;
        setDrawer(false);
      };
      document.addEventListener('pointerdown', onDown, true);
      return () => document.removeEventListener('pointerdown', onDown, true);
    }
    if (drawerWasOpen.current) {
      drawerWasOpen.current = false;
      // Focus returns to the reel handle that opened it (unless the viewer has moved on to something else).
      const active = document.activeElement;
      if (!active || active === document.body || rail?.contains(active)) reelRef.current?.focus({ preventScroll: true });
    }
  }, [drawerOpen]);

  /* ---- Time Portal ---- */
  const openPortal = useCallback((request: PortalRequest) => setPortal(request), []);
  const closePortal = useCallback(() => setPortal(null), []);

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

  /** Every intentional jump goes through the host (which keeps the Return Anchor and announces it), or seeks here. */
  const jump = (time: number, label: string) => {
    if (onJump) onJump(time, label);
    else {
      void store.seek(time);
      announce(`Jumped to ${label}, ${formatTime(time)}`);
    }
  };

  /** Scene previews from the dial, the lens and the Pause Canvas all open the same Time Portal. */
  const kind = sceneKind(scenes);
  const previewScene = (index: number, opener: HTMLElement | null) =>
    openPortal({
      stops: scenes.map((s) => ({
        time: s.start,
        end: s.end,
        title: s.title,
        image: thumbnailAt ? thumbnailAt(s.start + 1, 500) : null,
        kind,
        note: s.description,
      })),
      index,
      opener,
    });

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const inPanel = (e.target as HTMLElement).closest('.cs-panel, .cs-atlas, .tp, .cs-lens');
    if (e.key === 'Escape' && drawerOpen) {
      e.preventDefault();
      setDrawer(false);
    } else if (e.key === '?') {
      e.preventDefault();
      setHelpOpen(true);
    } else if ((e.key === 't' || e.key === 'T') && !inPanel) {
      e.preventDefault();
      toggleLens(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    } else if ((e.key === 'w' || e.key === 'W') && railSlot && !inPanel) {
      e.preventDefault();
      if (effectiveMode === 'explore') railRef.current?.querySelector<HTMLElement>('.wheel-item[tabindex="0"]')?.focus();
      else {
        if (effectiveMode !== 'watch') setModeState('watch');
        toggleDrawer();
      }
    } else if ((e.key === 'c' || e.key === 'C') && !(e.target as HTMLElement).closest('.cs-panel, .cs-rail, .cs-atlas')) {
      e.preventDefault();
      if (subs.tracks.length === 0) announce('No subtitles available. Open the subtitle settings to add some.');
      else {
        subs.toggle();
        announce(subs.active ? 'Captions off' : 'Captions on');
      }
    }
  };

  const ctx = useMemo<SkinContextValue>(
    () => ({ mode: effectiveMode, setMode, announce, tier, openPortal, closePortal, closeNavigation }),
    [effectiveMode, setMode, announce, tier, openPortal, closePortal, closeNavigation],
  );

  const reduced = view.prefs.reducedMotion;
  const hasScenes = scenes.length > 0;
  const tiny = tier === 'tiny' || tier === 'micro';
  const busy = Boolean(portal || lens || drawerOpen || panel);

  return (
    <SkinContext.Provider value={ctx}>
      <Container
        className={`cs-root ${className ?? ''}`}
        data-scrim={scrim}
        data-mode={effectiveMode}
        data-atm={look.derived.active ? 'on' : 'off'}
        data-has-rail={railSlot ? '' : undefined}
        data-rail={look.wheelCollapsed ? 'collapsed' : 'open'}
        data-drawer={drawerOpen ? 'open' : undefined}
        data-dock={layout}
        data-lens={lens ? 'open' : undefined}
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
            <section
              ref={railRef}
              id="cs-rail"
              className="cs-rail"
              aria-label="Navigation wheel: films and scenes"
              inert={!(effectiveMode === 'explore' || drawerOpen)}
              data-interactive
            >
              <div className="cs-rail-inner">
                <div className="cs-rail-bar">
                  <span className="cs-rail-title" aria-hidden="true">
                    <ReelIcon /> Navigate
                  </span>
                  {drawerOpen ? (
                    <button
                      type="button"
                      className="cs-icon-btn cs-rail-toggle"
                      aria-label="Close the navigation wheel"
                      data-tip="Close (Esc)"
                      data-tip-align="end"
                      onClick={() => setDrawer(false)}
                    >
                      <ChevronLeftIcon />
                    </button>
                  ) : (
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
                  )}
                </div>
                {/* inert removes the hidden wheel from the tab order and the accessibility tree while collapsed. */}
                <div id="cs-rail-body" className="cs-rail-body" inert={look.wheelCollapsed && !drawerOpen}>
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
              <PauseCanvas
                title={title}
                subtitle={subtitle}
                scenes={scenes}
                thumbnailAt={thumbnailAt}
                onSaveMoment={onSaveMoment}
                returnAnchor={returnAnchor}
                onPreviewScene={previewScene}
                tier={tier}
                suppressed={!view.prefs.pauseCanvas || busy}
              />
              <CaptionOverlay />
              {railSlot && effectiveMode === 'watch' && tier !== 'micro' ? (
                <ReelHandle
                  buttonRef={reelRef}
                  open={drawerOpen}
                  onToggle={() => toggleDrawer()}
                  artwork={artwork ?? null}
                  controlsId="cs-rail"
                />
              ) : null}
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
                  {layout === 'floating' ? (
                    <div className="cs-center">
                      <Transport placement="stage" />
                    </div>
                  ) : (
                    <div className="cs-center" aria-hidden="true" />
                  )}
                  <BottomBar
                    tier={tier}
                    stageWidth={stageWidth}
                    layout={layout}
                    markers={markers ?? []}
                    scenes={scenes}
                    thumbnailAt={thumbnailAt}
                    scenePreview={scenePreview}
                    clip={clip}
                    onSaveMoment={onSaveMoment}
                    panel={panel}
                    settingsTab={settingsTab}
                    onSettings={(tab, el) => toggleSettings(tab, el)}
                    onSimple={toggleSimple}
                    lensOpen={Boolean(lens)}
                    onLens={toggleLens}
                    lens={
                      lens ? (
                        <TimeLens
                          onClose={() => setLens(null)}
                          returnFocusTo={lens.opener}
                          scenes={scenes}
                          thumbnailAt={thumbnailAt}
                          markers={markers ?? []}
                          onJump={jump}
                        />
                      ) : null
                    }
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
            {hasScenes ? (
              <SceneDial
                open={panel === 'dial'}
                onClose={closePanel}
                returnFocusTo={panelOpener}
                scenes={scenes}
                thumbnailAt={thumbnailAt}
                onJump={jump}
                onPreview={(i, el) => previewScene(i, el)}
                returnAnchor={returnAnchor}
                preferList={tiny}
              />
            ) : null}
            <MorePanel
              open={panel === 'more'}
              onClose={closePanel}
              returnFocusTo={panelOpener}
              tier={tier}
              onSaveMoment={onSaveMoment}
              onClip={() => openPanel('clip', panelOpener)}
              onLens={() => toggleLens(panelOpener)}
              onDial={hasScenes ? () => openPanel('dial', panelOpener) : undefined}
              onWheel={railSlot && effectiveMode === 'watch' ? () => setDrawer(true) : undefined}
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
            {portal ? (
              <PortalHost
                request={portal}
                onIndex={(i) => setPortal((p) => (p ? { ...p, index: Math.max(0, Math.min(i, p.stops.length - 1)) } : p))}
                onClose={closePortal}
                onAction={(stop) => {
                  setPortal(null);
                  if (portal.onAction) portal.onAction(stop);
                  else jump(stop.time, stop.title);
                }}
                returnAnchor={returnAnchor}
              />
            ) : null}
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
            "C", "T" and "W" are handled above because they drive skin features rather than media actions. */}
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
        {/* Announces Playing, Paused, Muted and seeks to screen readers. .cs-announcer keeps it in the accessibility
            tree but clipped to a 1px box off the layout; it is never hidden with display or visibility. */}
        <StatusAnnouncer className="cs-announcer" />

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

/** Reads the playhead once a second so the portal's "ahead / behind" stays live without re-rendering the skin. */
function PortalHost({
  request,
  onIndex,
  onClose,
  onAction,
  returnAnchor,
}: {
  request: PortalRequest;
  onIndex: (i: number) => void;
  onClose: () => void;
  onAction: (stop: PortalStop) => void;
  returnAnchor?: { time: number; onReturn: () => void } | null;
}) {
  const now = usePlayer((s) => Math.floor(s.currentTime));
  return (
    <TimePortal
      stops={request.stops}
      index={request.index}
      onIndex={onIndex}
      currentTime={now}
      anchorTime={returnAnchor?.time ?? null}
      onJump={onAction}
      actionLabel={request.actionLabel}
      onReturn={
        returnAnchor
          ? () => {
              onClose();
              returnAnchor.onReturn();
            }
          : undefined
      }
      onClose={onClose}
      returnFocusTo={request.opener}
    />
  );
}

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

/** Spinner for the first load, with a visible label so it is never a mystery. Mid-play buffering spins the play bezel. */
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

/** Live needle for the Scene Dial button: where the playhead sits in the runtime, in 5-degree steps. */
function DialButtonIcon() {
  const angle = usePlayer((s) => (s.duration > 0 ? Math.round((s.currentTime / s.duration) * 72) * 5 : 0));
  return <DialIcon angle={angle} />;
}

interface BottomProps {
  tier: Tier;
  /** Measured stage width; the docked transport needs more room before Tools can stay in the dock. */
  stageWidth: number;
  layout: DockLayout;
  markers: TimelineMarker[];
  scenes: SkinScene[];
  thumbnailAt?: ThumbnailAt;
  scenePreview?: (time: number) => ScenePreview | null;
  clip: Clip;
  onSaveMoment?: () => void;
  panel: PanelName | null;
  settingsTab: SettingsTab;
  onSettings: (tab: SettingsTab | null, opener: HTMLElement) => void;
  onSimple: (name: 'clip' | 'transcript' | 'more' | 'dial', opener: HTMLElement) => void;
  lensOpen: boolean;
  onLens: (opener: HTMLElement) => void;
  lens: ReactNode;
}

/**
 * The control dock, organised as an instrument: Primary (transport), Timeline (strip and time), Tools, Sound and
 * Viewing. What does not fit at the current width moves into More; play, seek, time, mute and fullscreen never do.
 */
function BottomBar({
  tier,
  stageWidth,
  layout,
  markers,
  scenes,
  thumbnailAt,
  scenePreview,
  clip,
  onSaveMoment,
  panel,
  settingsTab,
  onSettings,
  onSimple,
  lensOpen,
  onLens,
  lens,
}: BottomProps) {
  const store = usePlayer();
  const pip = usePlayer((s) => s.pictureInPictureAvailability);
  const cast = usePlayer((s) => s.remotePlaybackAvailability);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const subs = useSubtitles();
  const tiny = tier === 'tiny' || tier === 'micro';
  const micro = tier === 'micro';
  const hasClip = clip.start !== null || clip.end !== null;
  // Tools stay in the dock only when everything fits on one line; otherwise they move into More.
  const roomy = tier === 'full' && (layout === 'floating' || (layout === 'expanded' && stageWidth >= 900));
  const inlineTimeline = layout === 'compact' && tier === 'full';
  const showMore = !roomy;
  const hasScenes = scenes.length > 0;
  const playing = usePlayer((s) => sceneIndexAt(scenes, s.currentTime));

  const timeline = <Timeline markers={markers} clip={clip} scenes={scenes} thumbnailAt={thumbnailAt} scenePreview={scenePreview} lensOpen={lensOpen} />;

  return (
    <div className="cs-bottom" data-layout={layout}>
      {lens}
      {!inlineTimeline ? timeline : null}

      <Controls.Group className="cs-row" aria-label="Playback controls">
        {layout !== 'floating' ? (
          <div className="cs-group" data-group="primary">
            <span className="cs-group-cap" aria-hidden="true">
              Play
            </span>
            <Transport placement="dock" />
          </div>
        ) : null}

        <div className="cs-group" data-group="time">
          <span className="cs-group-cap" aria-hidden="true">
            {hasScenes && playing >= 0 ? scenes[playing]?.title : 'Time'}
          </span>
          <div className="cs-time">
            <Time.Value type="current" />
            <span aria-hidden="true">/</span>
            <Time.Value type="duration" />
          </div>
        </div>

        {inlineTimeline ? <div className="cs-group cs-group-timeline">{timeline}</div> : <div className="cs-spacer" />}

        {roomy ? (
          <div className="cs-group" data-group="tools" role="group" aria-label="Tools">
            <span className="cs-group-cap" aria-hidden="true">
              Tools
            </span>
            {onSaveMoment ? (
              <button type="button" className="cs-btn cs-btn-label" onClick={onSaveMoment} data-tip="Save this moment">
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
              data-tip="Clip"
              onClick={(e) => onSimple('clip', e.currentTarget)}
            >
              <ClipIcon />
            </button>
            <button
              type="button"
              className="cs-btn"
              aria-expanded={lensOpen}
              aria-haspopup="dialog"
              aria-label="Time Lens"
              data-tip="Time Lens (T)"
              onClick={(e) => onLens(e.currentTarget)}
            >
              <LensIcon />
            </button>
            {hasScenes ? (
              <button
                type="button"
                className="cs-btn"
                data-panel-toggle
                aria-expanded={panel === 'dial'}
                aria-haspopup="dialog"
                aria-label="Scene dial"
                data-tip="Scene dial"
                onClick={(e) => onSimple('dial', e.currentTarget)}
              >
                <DialButtonIcon />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="cs-group cs-volume" data-group="audio" role="group" aria-label="Sound">
          <span className="cs-group-cap" aria-hidden="true">
            Sound
          </span>
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

        <div className="cs-group" data-group="view" role="group" aria-label="Viewing">
          <span className="cs-group-cap" aria-hidden="true">
            View
          </span>
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

          {showMore ? (
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
        </div>
      </Controls.Group>
    </div>
  );
}

/** Secondary actions for smaller players and the Compact layout, where the dock keeps only the essentials. */
function MorePanel({
  open,
  onClose,
  returnFocusTo,
  tier,
  onSaveMoment,
  onClip,
  onLens,
  onDial,
  onWheel,
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
  onLens: () => void;
  onDial?: () => void;
  onWheel?: () => void;
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
      <div className="cs-more" data-interactive>
        {extra && (tier === 'tiny' || tier === 'micro') ? <div className="cs-more-extra">{extra}</div> : null}
        {onSaveMoment ? (
          <button type="button" className="cs-row-btn" onClick={act(onSaveMoment)}>
            <BookmarkIcon /> <span>Save this moment</span>
          </button>
        ) : null}
        <button type="button" className="cs-row-btn" onClick={act(onLens)}>
          <LensIcon /> <span>Time Lens</span>
        </button>
        {onDial ? (
          <button type="button" className="cs-row-btn" onClick={act(onDial)}>
            <DialIcon /> <span>Scene dial</span>
          </button>
        ) : null}
        {onWheel ? (
          <button type="button" className="cs-row-btn" onClick={act(onWheel)}>
            <ReelIcon /> <span>Navigation wheel</span>
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
