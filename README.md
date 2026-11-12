Most video players make it easy to watch a film, but not to explore its scenes, save a moment, and find your way back without losing your place.

# XENON

**A custom Video.js v10 skin for watching, exploring, and remembering video.**

XENON started with a simple question: what if the player could help you move through a story instead of only moving through a timeline?

It still has the controls you'd expect—play, pause, seek, volume, captions, and fullscreen. But it also has a curved film wheel for browsing movies and sections, a way to return after jumping ahead, and a personal collection of moments worth keeping. Its appearance changes with the film, without changing the video itself.

**[Try XENON live](https://xenon-ruddy.vercel.app/#/)** · [Open the player](https://xenon-ruddy.vercel.app/#/watch/sintel) · [Skin only](https://xenon-ruddy.vercel.app/#/skin) · [Skin Studio](https://xenon-ruddy.vercel.app/#/studio)


<img width="1246" height="737" alt="image" src="https://github.com/user-attachments/assets/b72e393e-3853-4afc-8ca6-605511be7d57" />


## See what makes it different

If you're reviewing XENON, this is a good way to try it:

1. **Play a film.** Start with *Sintel*, *Tears of Steel*, or *Big Buck Bunny*. All three are open-licensed Blender Foundation shorts.
2. **Open Explore.** Turn the curved Movies/Scenes wheel with your mouse, touch, or arrow keys. Browsing doesn't interrupt the video. Choose **Play** to change films or **Jump** to move to a section.
3. **Jump, then come back.** XENON leaves a **Time Tether** at the position you left. Use it to return. **Journey** keeps a short history of the places you explored during the session.
4. **Pause and save a moment.** A small Film Slate shows the current title, section, time, and time remaining. Save the moment, then open **My Atlas** to revisit it or add a note.
5. **Switch films.** Watch the surrounding colours, gradients, wheel, controls, and frame change to suit the selected movie. The actual footage stays untouched.
6. **Try it without a mouse.** Press `?` inside the player for shortcuts. Open the **XENON Test Lab** below the demo player to check phone sizes, bright footage, and high-contrast settings.

The **Skin only** page is important too: it shows XENON as a standalone player, without the movie library, Atlas, or demo testing tools.

## The design

I wanted the player to feel like a piece of cinema equipment, but not at the expense of the film. The video stays centre stage; the extra tools only appear when they help.

**The curved Navigation Wheel** is the main visual idea. Movie and section thumbnails travel around an arc, with the selected frame brought into focus. The wheel supports scrolling, dragging, and keyboard navigation. On narrower players it becomes a simpler swipeable layout. The current movie keeps playing while you browse.

**The Precision Playback Pod** puts rewind 10 seconds, play/pause, and forward 10 seconds into one control. The underlying actions use Video.js components, not a second player hidden underneath the design.

**The Photon Frame** adds a thin optical border and small corner markers. It reacts differently when playing, paused, exploring, or saving a moment, then becomes quieter in fullscreen. The **Film Slate** appears on pause instead of covering the screen with a big information overlay. It can be moved, dismissed, or turned off. An end-of-film slate offers the next movie, but never autoplays it without a choice.

**The movie sets the mood.** XENON uses a four-colour spectral palette for each demo film:

| Film | Visual direction | Colours |
| --- | --- | --- |
| *Sintel* | Ember Twilight | Plum, copper, warm ember |
| *Tears of Steel* | Arctic Cyan | Navy, steel blue, cyan |
| *Big Buck Bunny* | Woodland Gold | Forest green, bronze, soft sunlight |

These colours flow through the surrounding page, wheel, dock, panels, and frame. Appearance settings let viewers choose their own colours, a fixed theme, opacity, blur, and gradient intensity. Contrast safeguards keep the text readable. **No atmosphere filter is applied to the video itself.**

The branded interface uses **Space Grotesk** throughout, with tabular numbers for stable timecodes. Subtitles have their own font and appearance options so people can read them comfortably.

## What you can do with XENON

### Navigate without losing your place

- **Movies / Scenes wheel:** Browse films or sections of the current video. A selection is only a preview until you choose an action. When actual chapter metadata exists, XENON can show it; the three demo movies currently use clearly labelled, evenly timed **sections**, not invented scene titles.
- **Time Lens:** Open a filmstrip of thumbnails and timecodes, adjust the target precisely, and choose **Jump** when you're ready. If thumbnail images aren't available, it still works as a timecode-based tool.
- **Filmprint timeline:** The seek bar includes scene cuts, saved moments, a return marker, and colours sampled from available frame images. It remains a real Video.js seek slider.
- **Time Tether:** After a deliberate jump, get back to where you were with one action (`B`).
- **Journey:** Go back through the places you visited during that viewing session. This is separate from bookmarks.
- **Resume and sharing:** Playback positions are remembered per movie. A shared URL can point to a specific time, or to a selected clip range.

### Keep the moments that matter

**My Atlas** stores moments locally in your browser. Save the current position or the last 10 seconds, give a moment a name or note, and return to it later. Saved entries can include a still and section information when the media source provides them. You can import and export your collection as JSON.

There are no accounts, no cloud database, and no Supabase dependency. Your Atlas and viewing preferences are stored with `localStorage` in that browser; they do **not** sync across devices.

### Control playback and captions

XENON includes the essentials—play/pause, seeking, time, volume/mute, and fullscreen—along with a few useful extras:

- **Playback layouts:** Floating, Compact, and Expanded control docks. Less-used actions move into a More menu on smaller players.
- **Playback speed and source options:** Speed controls, available quality choices, and alternative video hosts where the selected film actually offers them. Changing a source or file quality is designed to keep your position.
- **Subtitles:** Choose available tracks, upload `.srt` or `.vtt`, or paste subtitle text. Adjust timing and subtitle appearance. The active track also has a searchable, timestamped transcript.
- **Clip range:** Set a start and end, loop or play the range, and share its timestamps. **This does not export an edited video file.**
- **Picture-in-Picture, audio tracks, casting, and download:** Shown only where the browser, source, and film licence support them.
- **Playback recovery:** The demo has a stall guard that can try another available copy of the same film rather than leaving the viewer stuck on a stream that never progresses.

The settings panels don't invent a 4K option, an audio language, or a server that the current source can't actually supply.

### Make the player your own

**Appearance Studio** has adaptive and fixed themes, spectral-gradient presets, custom colours, panel styles, artwork blur, transparency, ambient lighting, and saved presets. **Accessibility** offers Standard, High Contrast, Large Controls, and Reduced Motion profiles. These are browser-local settings.

A separate **Skin Studio** lets someone preview the reusable skin at different widths and copy a small CSS configuration. It is a showcase tool, not something an embedded XENON player needs to carry around.

## Built for more than a mouse

Keyboard access was part of the player from the start, including its custom navigation. Focus remains visible, dialogs can be closed with Escape, and animated elements respect reduced-motion settings. Essential controls stay available as the player's **container** gets smaller—not just when the whole browser window shrinks.

| Key | What it does |
| --- | --- |
| `Space` / `K` | Play or pause |
| `←` / `J`, `→` / `L` | Rewind or advance 10 seconds outside the focused wheel |
| `M`, `↑` / `↓` | Mute; adjust volume |
| `F` | Fullscreen |
| `C` | Toggle captions when a track exists |
| `W` | Open/focus the Movies/Scenes wheel |
| `T` | Open Time Lens |
| `B` | Return along the Time Tether |
| `X` | Hide or show optional pause information |
| `?` | Open the full keyboard guide |
| `Esc` | Close an open panel or dialog |

Inside the wheel, arrow keys navigate frames instead of seeking; `Enter` moves to the selected frame's Play or Jump action. Keyboard focus is returned when panels close.

The demo's **XENON Test Lab** sits *below* the player and can be expanded to try Desktop, Tablet, Phone, and Tiny sizes. Its White Wash, Dark Footage, and High Contrast tests change only the testing layer over the video—not the actual controls. The reusable skin is kept separate from those demo tools.

## Real Video.js v10, not a mock player

XENON uses **`@videojs/react` 10.3.0** with Video.js v10 player and control components. Its custom interface wraps those components and reads their playback state. There is no older Video.js v8 `videojs()` setup hidden in the project.

The skin lives in `src/skin/` and can be used with a single video; the movie wheel, Atlas, and demo website are optional additions.

```tsx
import { Video, VideoPlayer } from '@videojs/react/video';
import { CinemaSkin } from './skin';

<VideoPlayer>
  <CinemaSkin title="My film">
    <Video src="/film.mp4" playsInline />
  </CinemaSkin>
</VideoPlayer>
```

**Stack:** React, TypeScript, Vite, CSS, Video.js v10, Vercel, and GitHub. The demo uses Mux for *Sintel* and open-file sources for the other films. No user login or backend database is required.

### Demo films and credits

The included movies are Blender Foundation open movies distributed under **[Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/)**:

- [*Sintel* (2010) — Durian Open Movie Project](https://commons.wikimedia.org/wiki/File:Sintel_movie_4K.webm)
- [*Tears of Steel* (2012) — Mango Open Movie Project](https://commons.wikimedia.org/wiki/File:Tears_of_Steel_in_4k_-_Official_Blender_Foundation_release.webm)
- [*Big Buck Bunny* (2008) — Peach Open Movie Project](https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm)

Video files and time-based stills are fetched from the configured video hosts or Wikimedia Commons, with attribution shown in the demo. *Sintel* also has a configured **Mux public playback ID** in `src/data/catalog.ts` and plays through Video.js's Mux integration. Alternative hosts are configured for supported films. Media availability still depends on those third-party services.

Artwork from Netflix and other commercial films that appeared in early design references is **not** included in the demo.

## Run it locally

You'll need **Node.js 20 or newer**; Node 22 LTS is a good choice.

```bash
npm install
npm run dev
```

Vite will print the local address (usually `http://localhost:5173`). Other commands:

```bash
npm run typecheck   # TypeScript
npm run build       # Production build (includes typecheck)
npm test            # Vitest component/unit tests
npm run e2e -- http://localhost:5173 ./e2e-shots
```

The browser test script uses Playwright with an installed **Chrome or Edge**. Start the development server before running it. The repository also includes automated axe checks, but automated accessibility results are not a substitute for a manual keyboard, screen-reader, mobile touch, and fullscreen review.

### Project map

| Location | What's inside |
| --- | --- |
| `src/skin/` | Reusable XENON skin, controls, Navigation Wheel, subtitles, appearance, Photon Frame, Lightmeter, Film Slate, settings |
| `src/features/` | Moment Atlas |
| `src/data/` | Demo catalogue, available sources, browser-local data |
| `src/pages/` | Home, player, standalone skin preview, Test Lab, Skin Studio, playback fallback logic |
| `scripts/e2e.mjs` and `tests/` | Browser checks and unit/component tests |
| `submission/` | Submission visual and screenshots |

### Deploy to Vercel

Push this project to GitHub, import it into Vercel as a **Vite** project, and use `npm run build` with `dist` as the output directory. Hash-based routes mean the demo doesn't require server-side routing rules.

For *Sintel*, the public Mux playback ID is configured in `src/data/catalog.ts`. You can override it with `VITE_SINTEL_MUX_PLAYBACK_ID`. Do not put private Mux API credentials in the frontend.

## What XENON doesn't claim to do

I want the demo to be clear about its limits as well as its features:

- The bundled films don't provide authored chapters; the player uses labelled time sections instead. Supplying chapter metadata enables real chapter names.
- Subtitle auto-sync needs an external alignment service and isn't bundled. Watch Party and an audio spectrum visualizer aren't implemented.
- A clip range is not a downloadable edited video; it stores or shares timestamps.
- Some controls appear only when the browser or source supports them. Video thumbnails and frame-based lighting can also be limited by third-party availability or cross-origin restrictions; XENON provides fallbacks rather than fake readings.
- The repository includes automated tests, but this README rewrite has **not** independently rerun the full browser suite. Fullscreen, real-device touch, and screen-reader behaviour should be verified manually before submission. See [`ACCESSIBILITY_CHECKLIST.md`](ACCESSIBILITY_CHECKLIST.md) for test notes.

**XENON's goal is simple:** keep the film at the centre, while giving viewers better ways to explore it, remember it, and get back to watching.
