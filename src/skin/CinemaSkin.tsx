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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppearanceProvider, useAppearance, type ResolvedAtmosphere, type SkinPalette } from './appearance/AppearanceContext';
import { Atmosphere } from './appearance/Atmosphere';
import { ClipPanel, EMPTY_CLIP, type Clip } from './ClipPanel';
import { DiagnosticsDialog, type DiagRow } from './DiagnosticsDialog';
import { Timeline, type ScenePreview, type ThumbnailAt, type TimelineMarker } from './dock/Timeline';
import { TimeLens } from './dock/TimeLens';
import { PlaybackPod } from './dock/PlaybackPod';
import { SeekLens } from './dock/SeekLens';
import { TailSlate } from './slate/TailSlate';
import { PhotonFrame } from './frame/PhotonFrame';
import { Lightmeter } from './frame/Lightmeter';
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
  ReturnIcon,
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
import { sceneIndexAt, type SkinScene } from './scenes';
import { SettingsPanel, type ChoiceSet, type DownloadInfo, type SettingsTab, type SkipSegment } from './SettingsPanel';
import { CaptionOverlay } from './subtitles/CaptionOverlay';
import type { AutoSync } from './subtitles/SubtitleCards';
import { SubtitleProvider, useSubtitles } from './subtitles/SubtitleContext';
import { TranscriptPanel } from './subtitles/TranscriptPanel';
import { IrisTransition } from './IrisTransition';
import { JourneyPanel, type Journey } from './JourneyPanel';
import { NavigationRail, type NavFilm, type NavTarget } from './wheel/NavigationRail';
import { loadPrefs, savePrefs, SCRIM_MODES, type ScrimMode } from './storage';
import '@fontsource-variable/space-grotesk';
import './tokens.css';
import './cinema-skin.css';
import './panels.css';
import './appearance/appearance.css';
import './polish.css';
import './instrument.css';
import './hardware.css';
import './optical.css';
import './rail.css';
import './frame/frame.css';
import './spectral.css';

export type { ScenePreview, ThumbnailAt, TimelineMarker } from './dock/Timeline';
export type { SkinScene } from './scenes';
export type { NavFilm, NavTarget } from './wheel/NavigationRail';
export type { Journey } from './JourneyPanel';

export type SkinMode = 'watch' | 'explore' | 'remember';

interface SkinContextValue {
  mode: SkinMode;
  setMode: (mode: SkinMode) => void;
  /** Polite screen-reader + visual status message. */
  announce: (message: string) => void;
  /** Layout tier derived from the player's real container width. */
  tier: Tier;
  /**
   * Turns the navigation wheel to a film, a scene or a saved moment and brings it into view: a column in Explore,
   * a drawer elsewhere, a sheet under the picture on small players. Nothing plays or seeks until the viewer
   * chooses the action in the wheel's detail card.
   */
  openNavigation: (target: NavTarget, opener?: HTMLElement | null) => void;
  /** Closes the navigation drawer (no effect in Explore, where the wheel is a column). */
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
  /** Extra content under the wheel in its rail. Optional. */
  railSlot?: ReactNode;
  /** Films for the wheel's Movies face. Omit for a single-video embed. */
  films?: NavFilm[];
  /** Which film is playing. */
  activeFilmId?: string;
  /** Switches film. Called only from the wheel's explicit Play action; an iris transition marks the change. */
  onPlayFilm?: (id: string) => void;
  /** Journey Replay: the session trail of jumps, shown beside the Time Tether. */
  journey?: Journey | null;
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
  /** The Time Tether: where the viewer was before exploring. Drawn on the timeline and in the wheel's card, one action away. */
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

type PanelName = 'settings' | 'transcript' | 'clip' | 'more' | 'journey';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

const NO_SCENES: SkinScene[] = [];
const NO_FILMS: NavFilm[] = [];

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
  films = NO_FILMS,
  activeFilmId,
  onPlayFilm,
  journey,
  mediaKey,
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
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [navTarget, setNavTarget] = useState<{ id: number; value: NavTarget } | null>(null);
  const navSeq = useRef(0);
  const drawerOpener = useRef<HTMLElement | null>(null);
  const clipRun = useRef(false); // true while "Play clip" is running without looping

  const hasNav = films.length > 0 || scenes.length > 0;
  const hasRail = hasNav || Boolean(railSlot);
  const hasModes = Boolean(hasRail || atlasSlot);
  const effectiveMode: SkinMode =
    mode === 'explore' && !hasRail ? 'watch' : mode === 'remember' && !atlasSlot ? 'watch' : mode;
  const drawerOpen = drawer && effectiveMode !== 'explore' && hasRail;
  const reduced = view.prefs.reducedMotion;

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

  /* ---- navigation drawer (Watch and My Atlas) ---- */
  const closeNavigation = useCallback(() => setDrawer(false), []);
  const drawerWasOpen = useRef(false);
  const closingTimer = useRef(0);
  const stopClosing = useRef<() => void>(() => {});
  useEffect(() => () => stopClosing.current(), []);
  // A layout effect, so the closing state lands in the same paint as the close: an ordinary effect let one frame
  // through with no drawer state, and the drawer blinked out and back before sliding away.
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (drawerOpen) {
      drawerWasOpen.current = true;
      stopClosing.current();
      setDrawerClosing(false);
      requestAnimationFrame(() => {
        // On small players the drawer is a sheet under the picture: bring it into view.
        if (rail && rail.getBoundingClientRect().top > window.innerHeight - 80) rail.scrollIntoView({ block: 'nearest' });
        // The wheel focuses the frame it was asked for; without a request, focus the frame in the gate.
        if (rail?.contains(document.activeElement)) return;
        const first = ['.wheel-item[tabindex="0"]', '.rail-tab[aria-pressed="true"]', '.cs-rail-body button'].map((q) => rail?.querySelector<HTMLElement>(q)).find(Boolean);
        first?.focus({ preventScroll: true });
      });
      const onDown = (e: PointerEvent) => {
        const t = e.target as Element | null;
        if (!t || rail?.contains(t) || t.closest('.cs-reel, .cs-panel, dialog, [data-nav-opener]')) return;
        setDrawer(false);
      };
      document.addEventListener('pointerdown', onDown, true);
      return () => document.removeEventListener('pointerdown', onDown, true);
    }
    if (drawerWasOpen.current) {
      drawerWasOpen.current = false;
      // Slide out over the picture, unless the viewer moved to Explore (the rail becomes a column at once).
      const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (effectiveMode !== 'explore' && !reduced && !still) {
        setDrawerClosing(true);
        // Finish when the slide-out has actually run to the end (a timer cut it off part-way); the timer is only a
        // fallback for a browser that never reports the animation's end.
        stopClosing.current();
        const onEnd = (e: AnimationEvent) => {
          if (e.target === rail && e.animationName === 'cs-drawer-out') done();
        };
        const stop = () => {
          window.clearTimeout(closingTimer.current);
          rail?.removeEventListener('animationend', onEnd);
        };
        const done = () => {
          stop();
          setDrawerClosing(false);
        };
        stopClosing.current = stop;
        rail?.addEventListener('animationend', onEnd);
        closingTimer.current = window.setTimeout(done, 600);
        // On small players the drawer is a sheet that closes without a slide: nothing to wait for.
        requestAnimationFrame(() => {
          if (rail && !getComputedStyle(rail).animationName.includes('cs-drawer-out')) done();
        });
      }
      // Focus returns to whatever opened it (the reel handle by default), unless the viewer has moved on.
      const active = document.activeElement;
      if (!active || active === document.body || rail?.contains(active)) {
        const back = drawerOpener.current?.isConnected && !drawerOpener.current.closest('[inert]') ? drawerOpener.current : reelRef.current;
        back?.focus({ preventScroll: true });
      }
      drawerOpener.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

  /* ---- navigation wheel ---- */
  const openNavigation = useCallback(
    (target: NavTarget, opener?: HTMLElement | null) => {
      setNavTarget({ id: ++navSeq.current, value: target });
      if (mode !== 'explore') {
        drawerOpener.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        setDrawer(true);
      } else if (look.wheelCollapsed) {
        look.setWheelCollapsed(false);
      }
    },
    [mode, look],
  );
  const filmsFace = films.length > 0 ? 'movies' : 'scenes';

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

  /** Scene previews from the dock, the lens and the Pause Canvas all go to the same instrument: the wheel. */
  const previewScene = (index: number, opener: HTMLElement | null) => openNavigation({ face: 'scenes', index }, opener);

  /** Explicit film switch from the wheel: the iris marks it, the drawer gets out of the way. */
  /* Explicit film switch (the wheel's Play, the tail slate's Play next): the iris marks it, the drawer gets out of
     the way, and the new film starts once it can play, because the viewer pressed Play. */
  const currentSrc = usePlayer((s) => s.currentSrc);
  const canPlayNow = usePlayer((s) => s.canPlay);
  const playAfterSwitch = useRef<string | null>(null);
  const playFilm = useCallback(
    (id: string) => {
      playAfterSwitch.current = currentSrc || '';
      onPlayFilm?.(id);
      setDrawer(false);
    },
    [onPlayFilm, currentSrc],
  );
  useEffect(() => {
    const from = playAfterSwitch.current;
    if (from === null || !canPlayNow || !currentSrc || currentSrc === from) return;
    playAfterSwitch.current = null;
    void store.play();
  }, [canPlayNow, currentSrc, store]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    // Dialogs (keyboard guide, player health) own their keys.
    if ((e.target as HTMLElement).closest?.('dialog')) return;
    const inPanel = (e.target as HTMLElement).closest('.cs-panel, .cs-atlas, .cs-lens');
    if ((e.key === 'x' || e.key === 'X') && playbackPaused && !inPanel && !(e.target as HTMLElement).closest('.cs-rail')) {
      e.preventDefault();
      toggleClearFrame();
    } else if (e.key === 'Escape' && drawerOpen) {
      e.preventDefault();
      setDrawer(false);
    } else if (e.key === '?') {
      e.preventDefault();
      setHelpOpen(true);
    } else if ((e.key === 't' || e.key === 'T') && !inPanel) {
      e.preventDefault();
      toggleLens(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    } else if ((e.key === 'b' || e.key === 'B') && returnAnchor && !inPanel) {
      e.preventDefault();
      returnAnchor.onReturn();
    } else if ((e.key === 'w' || e.key === 'W') && hasRail && !inPanel) {
      e.preventDefault();
      if (effectiveMode === 'explore') {
        if (look.wheelCollapsed) look.setWheelCollapsed(false);
        requestAnimationFrame(() =>
          (railRef.current?.querySelector<HTMLElement>('.wheel-item[tabindex="0"]') ?? railRef.current?.querySelector<HTMLElement>('.rail-tab'))?.focus(),
        );
      } else if (drawerOpen) setDrawer(false);
      else {
        // Focus comes back to where W was pressed; the reel handle when that was nowhere in particular.
        const here = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : reelRef.current;
        openNavigation({ face: filmsFace }, here);
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

  // The skin's own keys (X, T, B, W, C, ?) listen on the whole player, like the Video.js hotkeys. Listening on the
  // layout alone missed them whenever focus was on the player itself, which is where a click on the picture puts it.
  const layoutRef = useRef<HTMLDivElement>(null);
  const keyHandler = useRef(onKeyDown);
  keyHandler.current = onKeyDown;
  useEffect(() => {
    const root = layoutRef.current?.closest<HTMLElement>('.cs-root');
    if (!root) return;
    const listen = (e: KeyboardEvent) => keyHandler.current(e);
    root.addEventListener('keydown', listen);
    return () => root.removeEventListener('keydown', listen);
  }, []);

  const ctx = useMemo<SkinContextValue>(
    () => ({ mode: effectiveMode, setMode, announce, tier, openNavigation, closeNavigation }),
    [effectiveMode, setMode, announce, tier, openNavigation, closeNavigation],
  );

  const hasScenes = scenes.length > 0;
  const busy = Boolean(lens || drawerOpen || panel);

  /* ---- Photon Frame: playback state, the save pulse, Clear Frame ---- */
  const playbackPaused = usePlayer((s) => s.paused);
  const playbackEnded = usePlayer((s) => s.ended);
  const playback = playbackEnded ? 'ended' : playbackPaused ? 'paused' : 'playing';
  // A save from anywhere (dock, slate, My Atlas) adds a moment marker for this film: that is the confirmation.
  const momentCount = useMemo(() => (markers ?? []).filter((m) => m.kind === 'moment').length, [markers]);
  const [savedFlash, setSavedFlash] = useState(0);
  const lastMoments = useRef<{ key: string | undefined; n: number }>({ key: mediaKey, n: momentCount });
  useEffect(() => {
    const prev = lastMoments.current;
    lastMoments.current = { key: mediaKey, n: momentCount };
    if (prev.key === mediaKey && momentCount > prev.n) setSavedFlash((f) => f + 1);
  }, [momentCount, mediaKey]);
  useEffect(() => {
    if (!savedFlash) return;
    const t = window.setTimeout(() => setSavedFlash(0), 900);
    return () => window.clearTimeout(t);
  }, [savedFlash]);
  // Clear Frame: put the optional pause information away for this pause; playback controls stay where they are.
  const [frameCleared, setFrameCleared] = useState(false);
  useEffect(() => {
    if (!playbackPaused) setFrameCleared(false);
  }, [playbackPaused]);
  const toggleClearFrame = () => {
    const next = !frameCleared;
    setFrameCleared(next);
    announce(next ? 'Frame cleared. Press X to show the pause information again.' : 'Pause information shown');
    if (next) {
      // Focus never falls to the page: it goes to the pod, the primary playback control.
      requestAnimationFrame(() => {
        const a = document.activeElement;
        if (!a || a === document.body || !a.isConnected || a.closest('.cs-pause')) wrapRef.current?.querySelector<HTMLElement>('.cs-pod-play')?.focus({ preventScroll: true });
      });
    }
  };

  return (
    <SkinContext.Provider value={ctx}>
      <Container
        className={`cs-root ${className ?? ''}`}
        data-scrim={scrim}
        data-mode={effectiveMode}
        data-playback={playback}
        data-atm={look.derived.active ? 'on' : 'off'}
        data-has-rail={hasRail ? '' : undefined}
        data-rail={look.wheelCollapsed ? 'collapsed' : 'open'}
        data-drawer={drawerOpen ? 'open' : drawerClosing && effectiveMode !== 'explore' ? 'closing' : undefined}
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
        <div className="cs-layout" ref={layoutRef}>
          {hasRail ? (
            <section
              ref={railRef}
              id="cs-rail"
              className="cs-rail"
              aria-label="Navigate films and scenes"
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
                      aria-label="Close navigation"
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
                      aria-label={look.wheelCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                      data-tip={look.wheelCollapsed ? 'Expand' : 'Collapse'}
                      data-tip-align="end"
                      onClick={() => {
                        look.setWheelCollapsed(!look.wheelCollapsed);
                        announce(look.wheelCollapsed ? 'Navigation expanded' : 'Navigation collapsed');
                      }}
                    >
                      <ChevronLeftIcon />
                    </button>
                  )}
                </div>
                {/* inert removes the hidden wheel from the tab order and the accessibility tree while collapsed. */}
                <div id="cs-rail-body" className="cs-rail-body" inert={look.wheelCollapsed && !drawerOpen}>
                  {hasNav ? (
                    <NavigationRail
                      films={films}
                      activeFilmId={activeFilmId}
                      onPlayFilm={onPlayFilm ? playFilm : undefined}
                      scenes={scenes}
                      thumbnailAt={thumbnailAt}
                      onJump={(t, label) => {
                        jump(t, label);
                        // Going somewhere from the drawer: it gets out of the way, as Play does.
                        if (drawerOpen) setDrawer(false);
                      }}
                      tether={returnAnchor}
                      target={navTarget}
                    />
                  ) : null}
                  {railSlot}
                </div>
              </div>
            </section>
          ) : null}

          <div ref={wrapRef} className="cs-stagewrap" data-tier={tier}>
            <div className="cs-stage">
              {children}
              <IrisTransition trigger={mediaKey ?? ''} reduced={reduced} />
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
                // Below full size the floating pod holds the centre of a short picture and the strip would sit on it.
                suppressed={!view.prefs.pauseCanvas || busy || (layout === 'floating' && tier !== 'full')}
                cleared={frameCleared}
                onClear={toggleClearFrame}
              />
              <TailSlate
                cleared={frameCleared}
                onClear={toggleClearFrame}
                title={title}
                films={films}
                activeFilmId={activeFilmId}
                onPlayFilm={onPlayFilm ? playFilm : undefined}
                onOpenWheel={hasRail && films.length > 1 ? (el) => openNavigation({ face: 'movies' }, el) : undefined}
                thumbnailAt={thumbnailAt}
                onAnnounce={announce}
                tier={tier}
                suppressed={busy || (layout === 'floating' && tier !== 'full')}
              />
              <SeekLens />
              <CaptionOverlay />
              {hasRail && effectiveMode === 'watch' && tier !== 'micro' ? (
                <ReelHandle
                  buttonRef={reelRef}
                  open={drawerOpen}
                  onToggle={(el) => (drawerOpen ? setDrawer(false) : openNavigation({ face: filmsFace }, el))}
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
                    showRail={hasRail}
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
                      <PlaybackPod placement="stage" />
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
                    onScenes={hasScenes ? (el) => openNavigation({ face: 'scenes' }, el) : undefined}
                    navOpen={drawerOpen}
                    tether={returnAnchor}
                    journey={journey}
                    filmprintKey={mediaKey}
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

            <Lightmeter mediaKey={mediaKey} />

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
            {journey && journey.stops.length > 1 ? (
              <JourneyPanel open={panel === 'journey'} onClose={closePanel} returnFocusTo={panelOpener} journey={journey} thumbnailAt={thumbnailAt} />
            ) : null}
            <MorePanel
              open={panel === 'more'}
              onClose={closePanel}
              returnFocusTo={panelOpener}
              tier={tier}
              onSaveMoment={onSaveMoment}
              onClip={() => openPanel('clip', panelOpener)}
              onLens={() => toggleLens(panelOpener)}
              onDial={hasScenes ? () => openNavigation({ face: 'scenes' }, panelOpener) : undefined}
              onWheel={hasRail && effectiveMode !== 'explore' ? () => openNavigation({ face: filmsFace }, panelOpener) : undefined}
              onJourney={journey && journey.stops.length > 1 ? () => openPanel('journey', panelOpener) : undefined}
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

        <PhotonFrame flash={savedFlash} />

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

/** Live needle for the Scenes button: where the playhead sits in the runtime, in 5-degree steps. */
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
  onSimple: (name: 'clip' | 'transcript' | 'more' | 'journey', opener: HTMLElement) => void;
  lensOpen: boolean;
  onLens: (opener: HTMLElement) => void;
  lens: ReactNode;
  /** Opens the navigation wheel on its Scenes face. */
  onScenes?: (opener: HTMLElement) => void;
  navOpen: boolean;
  tether?: { time: number; onReturn: () => void } | null;
  journey?: Journey | null;
  filmprintKey?: string;
}

/**
 * The control dock, organised as an instrument: Primary (transport), Timeline (filmprint, time, tether), Tools,
 * Sound and Viewing. What does not fit at the current width moves into More; play, seek, time, sound and
 * fullscreen never do.
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
  onScenes,
  navOpen,
  tether,
  journey,
  filmprintKey,
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
  const hasJourney = Boolean(journey && journey.stops.length > 1);

  const timeline = (
    <div className="cs-tl-row">
      <Timeline
        markers={markers}
        clip={clip}
        scenes={scenes}
        thumbnailAt={thumbnailAt}
        scenePreview={scenePreview}
        lensOpen={lensOpen}
        tether={tether?.time ?? null}
        filmprintKey={filmprintKey}
      />
      {!tiny ? (
        <button
          type="button"
          className="cs-tl-expand"
          aria-expanded={lensOpen}
          aria-haspopup="dialog"
          aria-label="Expand the filmstrip (Time Lens)"
          data-tip="Expand filmstrip (T)"
          data-tip-align="end"
          onClick={(e) => onLens(e.currentTarget)}
        >
          <LensIcon />
        </button>
      ) : null}
    </div>
  );

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
            <PlaybackPod placement="dock" />
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
          {tether ? (
            <button
              type="button"
              className="cs-tether-chip"
              onClick={tether.onReturn}
              aria-label={`Return to where you were, ${formatTime(tether.time)} (B)`}
              data-tip="Back to where you were (B)"
            >
              <ReturnIcon />
              <span>{formatTime(tether.time)}</span>
            </button>
          ) : null}
          {hasJourney && !tiny ? (
            <button
              type="button"
              className="cs-btn cs-journey-btn"
              data-panel-toggle
              aria-expanded={panel === 'journey'}
              aria-haspopup="dialog"
              aria-label={`Journey: ${journey!.stops.length} places this session`}
              data-tip="Journey"
              onClick={(e) => onSimple('journey', e.currentTarget)}
            >
              <span className="cs-journey-dots" aria-hidden="true">
                {journey!.stops.slice(-5).map((_, i) => (
                  <span key={i} />
                ))}
              </span>
            </button>
          ) : null}
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
            {hasScenes && onScenes ? (
              <button
                type="button"
                className="cs-btn"
                data-nav-opener
                aria-expanded={navOpen}
                aria-controls="cs-rail"
                aria-label="Scenes on the navigation wheel"
                data-tip="Scenes"
                onClick={(e) => onScenes(e.currentTarget)}
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
  onJourney,
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
  onJourney?: () => void;
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
          <LensIcon /> <span>Time Lens (filmstrip)</span>
        </button>
        {onWheel ? (
          <button type="button" className="cs-row-btn" onClick={act(onWheel)}>
            <ReelIcon /> <span>Navigate: films and scenes</span>
          </button>
        ) : onDial ? (
          <button type="button" className="cs-row-btn" onClick={act(onDial)}>
            <DialIcon /> <span>Navigate: scenes</span>
          </button>
        ) : null}
        {onJourney ? (
          <button type="button" className="cs-row-btn" onClick={act(onJourney)}>
            <ReturnIcon /> <span>Journey</span>
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
