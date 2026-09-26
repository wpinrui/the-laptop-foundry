# Handoff: the laptop OS (2006, 2016, 2026)

## Overview
The fictional operating system that runs on the player's laptop. It is shown:
- in the cafe (`src/renderer/src/cafe/CafeScreen.tsx`, which replaces the `.desk` placeholder);
- during the builder's power on moment (the boot screen);
- on the menu lock screen;
- in the review photos `desk/screen` and `sysinfo`.

The era comes from `eraOf(build.year)`. Each era looks like Windows of its time: 2006 classic blue (the bright blue and green desktop of the early 2000s), 2016 glass, 2026 dark (rounded and translucent, borrowing the flat era's big battery readout and accent bars). It uses no Windows name, logo, wallpaper or sounds; the start mark is an original rounded square with a diamond.

## About the design files
`Laptop OS.dc.html` is an **HTML design reference**, not production code. Rebuild it in the existing React code (`CafeScreen.tsx`, `cafe.css`, and tokens in `styles/tokens.css`).

`os-art.js` draws the Kilnbench still life and one Ashfall frame. It is a stand-in for the canvases in `Kiln` and `Ash`: keep their loops and port the drawing.

## Fidelity
High fidelity for look and layout. Hardware names, scores, times and dates are placeholders.

## Wallpaper
Every desktop and lock screen uses `wallpaper.jpg`, which is the user's photo `marek-piwnicki-q7BizVv2jXg-unsplash.jpg` (Marek Piwnicki, Unsplash License).
- It is included here as `wallpaper.jpg` (2576 × 1449).
- Ship it in `resources/`, sized to cover.
- Credit it in the game credits: "Wallpaper photo by Marek Piwnicki on Unsplash".

## Screens (per era, ids `06-*`, `16-*`, `26-*`)
| id | Screen | Notes |
|---|---|---|
| boot | Boot | Plays during the builder's power on. First the maker's name (the player's company, from the builder's marks) on black for 1.5 s, then the OS loader. 2006: the mark and an italic wordmark over a trough with three blue blocks sliding through. 2016: a glossy blue orb with a ring of dots. 2026: the name with an arc spinner. |
| lock | Lock | 2006: a welcome screen with dark blue bands top and bottom, a white line above and an orange line below, a centre divider, the mark and wordmark on the left, and a user tile (a wallpaper crop) with a password field on the right; a red power button bottom left. 2016: a deep blue login with a glass user tile, the name and a password field, and a red round power button. 2026: the wallpaper under a dark scrim, with the time centred at the top at 136 px semibold and the date above it. Battery in a corner. |
| desktop | Desktop | Icons top left: Kilnbench, Ashfall, Notebookcheck, System. Then the taskbar. |
| tray | Power profile and sound | Opens from the battery icon. 2006: a popup with a blue header showing the battery state, High, Medium and Low as radio buttons on the cream dialog colour, and a volume slider. 2016: a white flyout with a glossy header, radio buttons and a volume bar. 2026: a dark panel with a big percentage and time left, a Low, Medium, High segmented control and a volume slider. |
| kiln-run | Kilnbench rendering | Tiles fill in from the centre; brackets mark the tiles still rendering (2006: 2, 2016: 4, 2026: 8). The score slot shows the percentage, with a thin progress bar. The button reads Stop. |
| kiln-done | Kilnbench score | The score in pts. The ranking puts this laptop among the rivals, with its bar in orange. |
| ash | Ashfall running | A toolbar with the edition picker and the preset (Low, Medium, High, Ultra). The fps counter is the only monospace text: 2006 yellow digits, 2016 green text on a black box, 2026 a translucent card with a frame-time history. |
| ash-no | Ashfall refused | The game window stays black, with an OS message box on top: "{edition} needs a graphics processor with {feature}. This laptop's {gpu} does not have it." and an OK button. |
| web | Notebookcheck | Browser chrome only. The page inside is the site, already designed in the review handoff. 2006: a cream toolbar with round green back and forward buttons, then an Address row with a Go button. 2016: round blue back and forward buttons, an address bar, a search box and a tab strip. 2026: dark tabs and a pill-shaped address field. The sound icon is shown muted here. |
| sys | System information | 2006: a System Properties dialog with General, Hardware and Power tabs (the selected tab has an orange top line) and group boxes. 2016: a control panel page with a pale blue side pane and blue section headings. 2026: dark settings with a side list (accent bar on the selected item) and cards. The groups are Laptop, Processor, Graphics, Memory, Storage, Display and Battery. |
| low | Low battery | At 10% the tray battery turns red, and a notice appears for 6 s. 2006: a pale yellow balloon pointing at the tray. 2016: a white balloon. 2026: a dark toast with a red tile. |
| charge | Charging | A bolt appears over the battery icon, and the flyout shows the time to full. |
| empty | Battery empty | The screen goes black. When the laptop is unplugged at 0%, an empty battery outline shows for 2 s, then nothing. Plugging in goes back to boot. |
| 43 | 4:3 | The same layout at 1024 × 768, to show how it reflows. |

## Layout and scaling
- Design size: 1440 × 810 logical px, which is a 16:9 screen at about 125% scaling. Treat everything as logical px, and set `scale = clamp(1, screenHeight / 810, 2)`, rounded to 1, 1.25, 1.5, 1.75 or 2. Real sizes:
  - 1024 × 768: scale 1, so it looks the same as 1440 × 810 with less width.
  - 1920 × 1080: scale 1.25.
  - 2560 × 1600: scale 2.
  - 3840 × 2400: scale 2, capped. Sizes are logical px throughout, so no step needs special handling.
- Taskbar: full width, fixed height (2006: 36, 2016: 40, 2026: 52).
  - In 2026 the icons are centred; in the other eras they start at the left.
- Desktop icons: a column at left 14, top 14. Wrap to a new column if they run out of height.
- Windows open centred, keeping 20 px from the edges and clear of the taskbar. They are sized to the free space and capped:
  - Kilnbench: 1220 × 650.
  - Ashfall and the browser: nearly full screen.
  - System: 840 × 640 in 2006, 1080 × 670 in 2016, 1100 × 690 in 2026.
- 4:3 and 3:2 screens use the same rules, so windows get narrower and the Kilnbench left panel stays 340 wide.
- **Readable in a review photo:** body text is at least 13 logical px, and the window titles and the Kilnbench score are sized so they still read when the screen is about 600 px wide in a photo.

## Tokens
- **2006 classic blue**
  - Font: Tahoma style; the mockup uses Noto Sans, 12 px.
  - Taskbar: 36 px, a blue gradient from #3a82f0 through #245edb to #1c49b3, with a 1 px #0d3bb1 top edge.
  - Start button: 112 × 36, green gradient from #5fc35a through #2f962b to #26791f, 14 px right corners, the mark plus "start" in bold italic 19 px with a dark text shadow.
  - Task buttons: 160 × 28, 3 px corners, light blue gloss; the active one is darker (#1e4fb8 to #2861d6) and inset.
  - Tray: a lighter blue gradient (#1a8ee6 to #1263bd) with a dark left edge and a white inner highlight.
  - Windows: a #0831d9 frame 3 px wide with 8 px top corners. The 30 px title bar is a blue gradient from #0a5ae8 through #3b8df9 and #1f5fe4 to #1a4cc4, with bold white 13 px title text and a dark shadow. An unfocused window turns pale blue (#7a96df).
  - Caption buttons: 21 × 21, 3 px corners, a white 1 px border; minimise and maximise are blue, close is orange red (#e88a6c to #c0381a).
  - Dialog colour: #ece9d8; panel borders #919b9c and #aca899; group box titles #0046d5.
  - Buttons: 24 px, 3 px corners, a #003c74 border, white to #d6d0c5 gradient; the default button has a blue inner ring.
  - Accent: #2a5fd4.
- **2016 glass**
  - Font: Segoe UI style; the mockup uses Open Sans, 13 px.
  - Taskbar: 40 px, a gradient from rgba(60,72,84,.72) to rgba(0,0,0,.92), a 1 px top highlight at rgba(255,255,255,.28), blurred behind. A show desktop strip at the far right.
  - Start orb: 46 px, a radial gradient from #d6f3ff through #4aa3e6 and #1b5aa8 to #0a2448, with a gloss on the top half.
  - Window frame: a gradient from rgba(185,209,234,.72) to rgba(150,180,210,.6), blurred behind, with a 1 px outline at rgba(0,0,0,.72), a 1 px inner white line at 55%, and 8 px top corners.
    - The title text has a white glow.
    - The close button is 46 × 19, a gradient from #f0a891 through #d65a3b to #b3260b.
  - Buttons: a two-part grey gloss with a 1 px #707070 border and 3 px corners.
  - Accent: #2d6fc4.
- **2026 dark**
  - Font: Segoe UI Variable style; the mockup uses Figtree, 14 px.
  - Taskbar: 52 px, rgba(24,24,28,.84) with blur 30 px, centred icons, a 1 px top line at rgba(255,255,255,.08). The active app has a 10% white tile and a 16 × 3 accent pill; a running app has a 6 × 3 grey pill.
  - Windows: #1f1f23 with a #19191d 40 px title bar, 8 px corners, a 1 px border at rgba(255,255,255,.1), and shadow `0 18px 50px rgba(0,0,0,.5)`.
  - Cards: #26262b. Text #f2f2f5, muted #a9abb3, lines rgba(255,255,255,.08).
  - Quick settings and toasts: rgba(34,34,39,.92) with blur 40 px and 10 px corners.
  - Accent: #6aa8ff, with dark text (#0b1a33) on accent fills.
- **Kilnbench** (its own look in every era):
  - Dark panel #1c1c20 to #1f2023; accent orange #f08a3c.
  - The empty render area is a checkerboard in 2006 and flat in 2016 and 2026.
  - The own bar is orange and the rival bars are grey.
- **fps font:** Consolas style; the mockup uses Source Code Pro. It is used only for the fps readout.
- **Icons:** drawn in code (see `icon()` in the mockup source). 2006 is bevelled and saturated, 2016 has a gloss, 2026 has rounded soft gradients. None copy a real product icon.

## Data mapping
| Element | Source |
|---|---|
| Era, clock date | `eraOf(build.year)`; the clock shows the real local time with the build year. |
| Maker on the boot screen, user name on the lock screen | the company name (for the 2006 wordmark, the builder's lid text layer) |
| Battery level | `pct = wh / battery.wh`, as today; red below 15%. |
| Charging bolt, time to full | `plugged`; time = `(battery.wh - wh) / (battery.wh / 120)` in game seconds, shown in real minutes. |
| Time left | `wh / draw` for the current profile and load, divided by `BATTERY_SPEED`. |
| Power profile control | `PROFILES` filtered by `m.profiles[id].enabled`; High, Medium, Low; sets `profile`. |
| Sound icon and slider | `sound` and `onSound`; muted shows the crossed speaker. The slider sets the fan volume multiplier. |
| Kilnbench edition | `KILNBENCH`; the name is `benchR.bench.name`. |
| Kilnbench progress and score | `kiln.progress` and `kiln.result`, as today; ranking = `RIVALS` multi scores for that edition, plus this laptop. |
| Kilnbench refused | when `benchR.bench.multi === null`, the score slot reads Unsupported and Run is disabled. |
| Ashfall edition, preset | `GAME_EDITIONS` and `gameYear`; the preset picks `ash.runs` by `preset` (only High is used today; add the others). |
| fps | the measured frame rate from `Ash`, as today. |
| Ashfall refused | when there is no run for the preset; the feature is the refusal reason from `results()` (add it if missing); the GPU is the build's graphics name. |
| Browser | `ReviewIndex` and `ReviewSite`, as today; back uses `history`; the address is `notebookcheck.net/{model-slug}-review`. |
| System information | Processor: name, cores, threads, and live clock `tl.cpu` against the maximum. Graphics: name, memory, live clock. Memory, storage and display from the build (`panelOf`). Battery: `battery.wh`, level, state. |
| Low battery notice | once, when `pct` first drops below 10 while unplugged. |
| Screen off | `off`, as today. |

## Behaviour
- Clicking an icon opens its app; one app at a time, as today. The window's close button returns to the desktop.
- A click anywhere else closes the tray flyout.
- The review photo `desk/screen` uses the `ash` state (or `kiln-done` for benchmark shots), and the `sysinfo` photo uses `sys`. Both render at `look.width` × `look.height`.
- Power on in the builder shows `boot` for about 3 s, then the desktop.

## Files
- `Laptop OS.dc.html`: all the mockups. Column 2a is 2006, 2b is 2016, 2c is 2026.
- `screenshots/`: every screen at 1440 × 810 (the 4:3 one at 1080 × 810), named `{era}-{id}.png`, e.g. `06-desktop.png`.
- `os-art.js`: the Kilnbench and Ashfall drawings.
- `wallpaper.jpg`: the desktop and lock screen wallpaper.
- `support.js`: the runtime for the mockup file.
