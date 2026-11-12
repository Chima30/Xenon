# Untitled / Cinema Interface

A Video.js v10 custom skin (React, TypeScript, Vite, CSS) built around one idea: **watch a story, explore its scenes, return to your place, remember what mattered.** The project has no name yet; "Untitled / Cinema Interface" is a placeholder.

> **Status:** `npm run typecheck` and `npm run build` pass. A manual browser pass (Chromium-based pane, dev server) confirmed: real playback of Wikimedia-hosted films, Explore wheel with keyboard browsing (arrows do not seek or change volume) and Enter-to-load, scene jump + Return Anchor, save moment + persistence across reload, resume toast, `?` dialog, Player health, settings menu, and a 375px layout with no horizontal overflow. **Not yet done:** axe, screen reader, touch drag, fullscreen, Safari/Firefox, 320px, forced-colors. See [Known gaps](#known-gaps).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
```

Node 20+ (22 LTS recommended).

## What is in here

| Path | What |
| --- | --- |
| `src/skin/` | **The reusable skin.** `CinemaSkin`, keyboard-shortcut dialog, player-health dialog, icons, CSS. Imports nothing from the demo. |
| `src/features/` | Optional slots: `NavigationWheel` / `NavigationRail` (Movies + Scenes) and `MomentAtlas`. |
| `src/data/` | Demo catalog and localStorage stores (moments, resume positions, My List). |
| `src/pages/` | Home (dark teal), Player (skin + all features), Skin-only workbench. |

The skin needs one video and nothing else:

```tsx
import { Video, VideoPlayer } from '@videojs/react/video';
import { CinemaSkin } from './skin';

<VideoPlayer>
  <CinemaSkin title="My film">
    <Video src="/film.mp4" playsInline />
  </CinemaSkin>
</VideoPlayer>
```

`railSlot`, `atlasSlot`, `topActions`, `markers`, `onSaveMoment` and `diagnosticsRows` are optional. Without slots the Watch/Explore/My Atlas switch is not rendered.

## Video.js v10 usage

Official `@videojs/react@10.3.0`: `VideoPlayer` (preset `createPlayer` with `videoFeatures`), `Container`, `Controls`, `TimeSlider`, `VolumeSlider`, `PlayButton`, `SeekButton`, `MuteButton`, `CaptionsButton`, `PiPButton`, `FullscreenButton`, `Menu` with the captions and playback-rate radio groups, `Hotkey`, `Gesture`, `StatusAnnouncer`, `ErrorDialog`, and `usePlayer` / `useMedia`. There is no v8 `videojs()` call anywhere.

## Features implemented

- **Watch / Explore / My Atlas** modes. Switching never restarts playback or changes `currentTime`.
- **Wheel**: Movies and Scenes on one wheel. CSS-positioned arc with a turning tick dial; becomes a snap carousel when the player is narrower than 760px. Arrow keys, Home/End, PageUp/Down browse (the wheel owns those keys while focused); Enter/Space/click selects; mouse wheel and drag turn it. Browsing only highlights.
- **Scenes** are *timed sections*, because none of the bundled films publish chapters. They are labelled "Section n", never as story scenes. If a film's `chapters` array is filled in, real chapter titles are used.
- **Return Anchor** and **Journey Trail** for intentional jumps (scene, saved moment); reset when the film changes.
- **My Atlas**: save the current moment, save "the last 10 s", rename, jump, delete, export/import JSON. Stored per film in `localStorage` (`cinema-skin:v1:*`), validated on read.
- **Resume**: positions saved every 5 s; switching to a film (or reloading it) resumes after metadata loads. Deep link: `#/watch/<id>?t=<seconds>`; the share button copies one.
- **Scrim**: Default / High contrast / Theater, persisted.
- **Keyboard dialog** (`?`) and **Player health** dialog built on native `<dialog>` (focus trap, Escape, focus return). Health shows live player readings with Pass / Needs review / Unavailable, and explicitly does not claim WCAG compliance.
- Buffering, ended/replay, and playback-error states (the error dialog's Close dismisses it).

### Design system, settings control centre and responsive tiers

- **One typeface.** Space Grotesk (variable, self-hosted through `@fontsource-variable/space-grotesk`, SIL OFL, no font request to a third party) is the only branded UI font, with a system-font fallback stack. `src/skin/tokens.css` defines the scale: sizes from 12px up, four weights, tracking for display titles and for small uppercase section labels, a 4px spacing scale, a radius scale, and control heights. Timecodes, offsets and counters use tabular numerals so they never shift. Subtitle typography is separate (Settings → Subtitles → Subtitle appearance: size, typeface, colour, background, position, edge).
- **Settings control centre** (the gear, or the CC and palette buttons): Playback, Subtitles, Appearance, Accessibility and Advanced tabs (arrow keys, Home and End move between them), plus a search box that finds any setting by name or category. Cards appear only when the current video can really offer them (no fake qualities, audio tracks or servers); a single-quality source shows an honest note instead. Advanced holds playback diagnostics, the shortcut guide and a reset for appearance, accessibility and dock settings.
- **Accessibility profiles:** Standard, High contrast, Large controls and Reduced motion, each adjustable afterwards (the profile then reads "Custom"). Saved in `localStorage`. The operating system's reduced-motion setting is also respected. Selected states always carry a check mark or weight as well as a colour.
- **Layout tiers from the player's real container width** (not the window): full (680px and up), compact (440 and up, icon-only dock), tiny (340 and up, secondary actions in a More menu) and micro (under 340: the dock keeps time, mute, More and fullscreen). Play/pause, seek, time, volume or mute, and fullscreen exist at every tier. Panels sit under the video on small players so they never run off screen.
- **Test bench (demo site only, `src/pages/TestBench.tsx`).** Desktop / Tablet / Phone / Tiny presets change the real width of the player's container (no transforms), and a Footage Test selector (Default, Wash to White, Dark Footage, High Contrast Test) places a layer over the video only, beneath captions and controls. Neither control remounts or restarts the video. The reusable skin knows nothing about the bench; it only exposes two generic props, `videoOverlay` and `forceHighContrast`.

### Adaptive Movie Atmosphere (optional, off by default)

Open the palette button in the header. With the switch off the skin looks exactly as before; nothing is applied. Turned on, the surroundings (wheel panel, header, control bar, letterbox areas) pick up the selected film's artwork:

- **Background**: the film's licensed still frame, a solid colour, or your own image (resized to 1280px JPEG and stored in this browser only).
- **Controls**: artwork opacity, blur, ambient light, accent colour (citron, from the artwork, lavender, teal, rose, or a custom hex), text contrast (normal or high), and a Glass / Solid / Clear style for the header buttons, the wheel and side panels, and the control bar.
- **Contrast safety**: colours are read from the artwork in the browser, but never applied blindly. The surface tint is a darkened copy; a readability scrim is sized so body text reaches 4.5:1 (7:1 in High contrast) however bright the artwork or high the opacity; accents are lightened until they reach 4.5:1 against the panels and fall back to the default if they cannot. The studio shows the measured numbers.
- **Presets**: save, apply and delete named presets (they do not include a custom image). Everything is in `localStorage`; no backend.
- **The video is never filtered.** Blur, tint and opacity apply only to background layers behind the layout; the video stage is merely transparent where no video pixels exist.
- Changing film updates the artwork, palette, credit line and title live, no reload.
- If a host blocks pixel access, a safe default palette is used and the studio says so.

The wheel panel also collapses (chevron button, Enter/Space). Collapsed, it is marked `inert` so it leaves the tab order; the choice is remembered. On phones it collapses vertically.

### Settings, subtitles and clips

Floating, non-modal panels (Escape closes, focus returns to the button, outside press closes; on phones they sit under the video):

- **Settings**: cards for Quality, Speed (0.5–2×), Audio, Subtitles, Server, Skip and Download. **A card appears only when its data is real.** Quality lists the separate files a film really has (Commons: 240p, 480p, 1080p; no 4K is offered because no 4K rendition is served) or adaptive renditions when an HLS/Mux source exposes them; changing it reloads the file and returns to the same second. Server shows only when a film has two real hosts (Sintel and Big Buck Bunny: Wikimedia Commons and the Internet Archive). Audio appears only with two or more tracks. Skip buttons need `segments` data (none of the bundled films have any, so none are shown). Download is offered only for films whose licence allows it.
- **Subtitles**: captions are drawn by the skin. Sources: tracks inside the video, uploaded `.srt`/`.vtt` files (parsed in the browser), and pasted text. Per-film storage in `localStorage`. Language names via `Intl.DisplayNames`; a flag emoji only when the code carries a region (for example `pt-BR`). Timing offset ±30 s. Appearance: size, colour, background opacity, position, text edge, with preview. Auto-sync is **not** offered unless the host passes an `autoSync` function backed by a real alignment service; none is bundled.
- **Transcript**: searchable, timestamped list of the active track; Enter or click seeks; follows playback.
- **Clip**: mark start/end (typed `m:ss` or "set to now"), loop it, play it once, copy the times, or copy a share link (`#/watch/<id>?t=<start>&e=<end>`). It marks a range; it does **not** cut or export a video file.
- **Cast** appears only when the browser reports remote playback as available. No Watch Party: there is no synchronised multi-user backend.
- `C` toggles captions (restoring the last track).

## Keyboard

`Space`/`K` play, `←`/`J` and `→`/`L` ±10 s, `↑`/`↓` volume, `M` mute, `C` captions (when a track exists), `F` fullscreen, `I` picture-in-picture (when supported), `?` shortcuts, `Esc` closes things. In the wheel the arrows browse instead.

## Media and credits

All demo films are open Blender Foundation movies, **CC BY 3.0**, served as VP9 transcodes from Wikimedia Commons (verified reachable with CORS headers at authoring time):

- *Sintel* (2010), *Tears of Steel* (2012), *Big Buck Bunny* (2008).
- Still frames in the wheel, atlas and hero are generated on demand by Commons from the same files. If a frame fails to load, a timecode card is shown instead.

Netflix artwork from the design references is not used anywhere.

### Mux

Sintel's primary source is a Mux asset, played with the official `MuxVideo` component from `@videojs/react` (not Mux Player), so the Video.js v10 skin, hotkeys, wheel and panels all apply to it. The **public** playback ID is in `src/data/catalog.ts` (`SINTEL_MUX_PLAYBACK_ID`) and can be overridden with `VITE_SINTEL_MUX_PLAYBACK_ID`. Playback IDs are not secrets; no Mux API credentials or signing keys are used or needed in the client.

- Settings → Server lists Mux first, then Wikimedia Commons and the Internet Archive, so there are always real fallbacks. Switching server keeps your position.
- Settings → Quality shows the stream's real HLS renditions (Auto and each rendition Mux made), via Video.js' quality feature.
- Mux's auto-generated English captions load as a subtitle track, appear in the Subtitles menu and Transcript, and are drawn by the skin like any other track. Their cues stream in as the video loads, so the transcript fills as you watch.
- The other two films stay on their open-file sources.

## Deploy (Vercel)

1. Push to GitHub.
2. Import the repo in Vercel; framework preset **Vite**; build `npm run build`; output `dist`.
3. No environment variables are needed; the public Mux playback ID is built in (optionally override it with `VITE_SINTEL_MUX_PLAYBACK_ID`).

Hash routing means no rewrite rules are needed.

## Known gaps

Not implemented: audio visualizer (reported as Unavailable in Player health), seek-bar hover thumbnails (Time Lens), watch-footprint ranges, scene threads, automatic subtitle sync (needs a service), Watch Party. Untested with real data: skip segments, audio-track switching, native `<track>` subtitles, adaptive HLS/Mux quality, and Cast, because no bundled film provides them. Not verified: everything at runtime. Specific risks to check first:

1. `npm run typecheck`: prop types for Video.js render-prop components and `MuxVideo`'s `source` were written from the docs, not from compiler feedback.
2. The settings menu (captions + speed) and its popup placement inside fullscreen.
3. Whether the player's `Hotkey` listeners are fully shadowed by the wheel's key handling.
4. Layout at 320px, 390px, 768px; wheel proportions at 1024–1440px.
5. Commons frame thumbnails can return HTTP 429 when generated in bursts.

See `ACCESSIBILITY_CHECKLIST.md` for what still needs automated and manual testing.

## Final refinement (design/xenon-final-refinement)

- **Adaptive Movie Atmosphere** now starts from each film's signature palette (`Film.palette`), so the accent, surfaces, dock, wheel and focus colours change with the film even before artwork is read. Viewer choices in Appearance still win.
- **Navigation Wheel**: frames ride a real circle around a hub lens with a position readout; a fixed viewfinder gate marks what Enter will select. Movies and Scenes are two faces of the same instrument: switching folds one face into the hub and unfolds the other. Phones get a swipe carousel with the same keyboard model.
- **Time Portal**: selecting a scene (or previewing a saved moment) opens a preview with the film's own still, timing and notes. Playback keeps running; **Jump here** seeks and leaves a Return Anchor, **Keep watching** or Esc closes, and focus returns to where it came from.
- **Timeline preview**: hovering the seek bar shows a real still near that second and the scene name. Scene boundaries are drawn as cuts on the bar.
- **My Atlas**: a strip of frames with names, notes, Play and Preview actions, and a runtime map.
- **Skin Studio** (`#/studio`, demo only): live presets, colours, radius, panel opacity and blur, font and control size, player width, and copyable CSS.

### Public CSS custom properties

| Property | Purpose |
| --- | --- |
| `--media-accent-color` | Accent for selection, progress and focus |
| `--media-accent-text-color` | Text and icons placed on the accent |
| `--media-border-radius` | Outer radius; inner radii scale from it |
| `--media-font-family` | Typeface (Space Grotesk by default) |
| `--xenon-surface-color` | Base colour every surface is mixed from |
| `--xenon-panel-opacity` | 0 to 1, opacity of panels and the dock |
| `--xenon-panel-blur` | Backdrop blur behind panels |
| `--xenon-control-size` | Minimum control size (never below 44px) |

### Tests

```bash
npm test
```

Vitest + Testing Library (jsdom): the wheel's keyboard model and Movies/Scenes transform, the Time Portal, film palettes and contrast, moment storage, layout tiers, and the real Video.js skin (mode switching, status announcer, settings Escape and focus return).
