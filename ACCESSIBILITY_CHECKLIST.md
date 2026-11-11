# Accessibility checklist

Nothing below has been run yet. "Designed" means the code is written to meet it; "Untested" means no evidence either way. Fill in results as you test.

## Automated

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |
| axe-core 4.10.2 in the dev page: Home, Skin-only, Player Watch, Keyboard dialog | 0 violations |
| axe: Player Explore, Scenes, My Atlas, Player health, Settings, Subtitles (all sections open), Transcript, Clip | 0 violations. An earlier `color-contrast` flag on the unselected "Watch" button was a stalled CSS transition in the hidden test pane; it disappears with transitions disabled. `heading-order` and a non-focusable scroll region were real and are fixed. |
| Fullscreen | **Wiring verified, result not verified.** In the built-in pane `requestFullscreen()` hangs; in the automation-controlled Chrome window Chrome rejects it even for `document.documentElement` ("Permissions check failed"). With the call intercepted, pressing `F` did call `requestFullscreen` on the `.cs-root` container. The fullscreen layout CSS (`:fullscreen` rules) has therefore never been seen. Test by hand in a normal browser window. |
| Lighthouse accessibility | Not run |

## Manual keyboard (no mouse)

| Journey step | Designed | Result |
| --- | --- | --- |
| Tab into player, Space/K play and pause | Hotkey on container | Untested |
| Seek with slider arrows; ←/→ ±10 s elsewhere | Official TimeSlider + Hotkey | Untested |
| Mute (M), volume (↑/↓ or slider) | Hotkey, VolumeSlider | Untested |
| Captions (C) when a track exists; speed menu | CaptionsButton hidden when no tracks | Untested (bundled films have no captions) |
| Fullscreen (F) and exit (Esc) | Hotkey + FullscreenButton | Untested |
| Explore: Movies/Scenes tabs, arrow through wheel, Enter selects | Native key listener stops propagation so arrows do not seek | Untested |
| Select another film; select a scene; Return Anchor button | Buttons in top toolbar | Untested |
| Save moment, open My Atlas, jump, rename, remove | Real buttons and labelled input | Untested |
| Scrim button, `?` dialog, Player health dialog; Esc closes; focus returns | Native `<dialog>` + manual focus return | Untested |
| No keyboard trap anywhere | — | Untested |

## Screen reader (NVDA / VoiceOver)

Not tested. Designed: labelled buttons and sliders, `aria-pressed` on mode and filter toggles, `aria-current` on the active wheel item with spoken "Playing" / "Now", polite live region for skin messages, Video.js `StatusAnnouncer` for playback changes.

## Visual

| Check | Status |
| --- | --- |
| Focus ring (3px citron + dark halo) visible over bright and dark footage | Designed, untested |
| Controls legible over bright footage (gradient scrims, High contrast scrim) | Designed, untested |
| Touch targets ≥ 44 px | Designed (`--cs-target`), untested |
| `prefers-reduced-motion`: no dial turn, card movement, or spinner animation | Designed, untested |
| `forced-colors` | Basic rules only, untested |
| 320 / 390 / 768 / 1280 / 1440 px layouts | Untested |

## Known limitations

- The seek bar has no hover preview.
- Controls auto-hide when idle; they stay while anything inside has keyboard focus or a menu is open.
- Wheel drag is pointer-only by design; the keyboard path is the arrow keys.
- Player health is a set of live readings, not a WCAG audit.

## New panels (Settings, Subtitles, Transcript, Clip)

Verified in a browser: open/close with Escape and focus returns to the opener; Space on a focused chip activates it without pausing; `C` toggles captions; clip start/end accept `m:ss` with Enter and reject bad input with an alert; labels survive narrow layouts (text is visually hidden, not removed). Not verified: NVDA/VoiceOver output, touch drag, Tab-order walkthrough by a person, panels in fullscreen.

## Appearance studio and collapsible wheel

Verified in a browser (Sintel, Tears of Steel, Big Buck Bunny): atmosphere off by default with no extra layers; live switching of artwork, palette and credit per film; contrast solver (bright yellow background raises the scrim to 0.75 and holds 7:1 in High contrast; a dark `#222266` accent is lightened to 4.6:1); preset save/apply and persistence across reload; custom image upload; wheel collapse by keyboard (focus stays on the toggle, collapsed wheel has no tab stops, state persisted); phone width has no overflow and collapses vertically; axe reports 0 violations on the studio. Not verified: `prefers-reduced-motion` was not run (the CSS disables the collapse, fade-in and dial transitions); transitions could not be watched because the test pane stalls them; the studio in fullscreen; screen reader output.

## Redesign pass: settings control centre, profiles, tiers, test bench

Verified in a browser (Chromium pane, dev server):
- Space Grotesk loads from the bundle; tabular numerals confirmed (equal digit widths).
- Test bench: Desktop 927 px, Tablet 766 px, Phone 388 px, Tiny 298 px measured on the real container; the same `<video>` element kept playing through every size and footage change; the footage overlay is inside the video layer with `pointer-events: none`, controls above it, no filter on the video; High Contrast Test did not change saved preferences.
- Layout tiers: full, tiny (More menu) and micro (time, mute, More, fullscreen) all keep the essential controls; no horizontal overflow; More menu rows are 48 px and stay inside the viewport.
- Settings: tabs navigable with arrow keys; search works and clears when the panel closes; profiles (Standard, High contrast, Large controls, Reduced motion) apply, can be customised, persist across reload, and Restore defaults works.
- Keyboard: Escape closes panels even when focus has drifted, and focus returns to the opener; shortcut dialog traps focus and returns it; wheel arrows still do not seek or change volume.
- axe-core 4.10.2: 0 violations on Watch, Explore, tiny size, Wash to White, High Contrast Test, phone Atlas, every Settings tab (default and High contrast), search results and both dialogs. Two real findings were fixed along the way (a nested `aside` landmark, and High contrast losing to theme surfaces).
- Adaptive themes: Sintel, Tears of Steel and Big Buck Bunny each retint the wheel, header, dock, panels, dialogs and cards live.

Not verified: real touch devices, fullscreen, screen-reader output, the OS-level reduced-motion setting (the in-app Reduce motion option was tested), the loading and error states (not forced), and animations as seen by eye (the test pane stalls transitions).
