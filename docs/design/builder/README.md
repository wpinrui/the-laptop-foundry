# Handoff: Builder redesign (Foundry)

## Overview
A full rework of the laptop builder (`src/renderer/src/builder/`). Use turn 2 (section `2a`) of `Builder.dc.html`. It is a fixed line of stages that starts with the year, puts price last, and shows stats only once the laptop is valid. It adds a lot of new customisation:
- any colour anywhere;
- a freely specified screen;
- ports, keyboard, trackpad and webcam placed by dragging on the 3D laptop;
- keycap shape, colours and legends;
- SVG and text marks on the lid, palm rest, bottom and bezel.

Turn 1 (`1a`, `1b`, `1c`) holds the three earlier explorations and is for reference only.

## About the design files
The files here are **design references made in HTML**. They are static mockups showing layout, content and intent, not production code. Rebuild them in the existing app (React, three.js through `viewer/Scene.tsx`, CSS tokens in `styles/tokens.css`, Foundry styles in `foundry/foundry.css`), following its patterns. `builder-laptop.js` is a stand-in renderer for the mockups; the real laptop is the game's `Model` built by `solve()`.

## Fidelity
**High fidelity for look and layout.** Colours, type, spacing and composition are final and match the Foundry menus. Part names, prices, stats and rival data are **placeholders**.

## Global layout (1440 × 810 design pixels, scaled with `--u` like `.fd`)
- **Scene:** the full-bleed 3D laptop on the Foundry plinth: warm key light, cool rim light and a warm pool light. The camera framing changes per stage (see each screen). The laptop sits right of centre with a `setViewOffset` shift of about 0.15 to 0.24 of the width.
- **Scrim:** a left-to-right gradient, `rgba(20,16,13,.97)` at 0%, `.84` at about 35%, and fully transparent at 56%. The Inside stage runs to 66%. Stages with a tray add a bottom gradient 220 px tall, `rgba(20,16,13,.94)` at 45% fading to 0.
- **Stage bar:** top left, at left 48 and top 36. Barlow Condensed 600, 18 px, capitals, letter-spacing 0.08em, 28 px gap. The stages are Year, Chassis, Screen, Inside, Surface, Keys, Finish, Marks and Price.
  - Done stages are `#efe6dc`.
  - The current stage is in the accent colour, with a 2 px accent underline and 6 px padding below.
  - Stages still ahead are `#6f655b`.
  - Every stage stays clickable.
- **Top right, at right 48 and top 40:**
  - Before the laptop is valid, it shows the missing count, e.g. `3 missing`, in IBM Plex Mono 15 in the warning colour.
  - After power on, it shows the stat strip in IBM Plex Mono 15, muted `#a8998a` with values in `#efe6dc`: weight in kg, battery in h:mm, the performance score, and surface temperature in °C. A value in a warning range turns the warning colour.
  - There is **no power control** anywhere.
- **Left column:** at left 104. It starts 104 to 110 px from the top, is 360 to 440 wide, and uses a 22 px vertical gap. It holds all the controls for the stage.
- **Bottom row:** at left 104, right 56 and bottom 48, spread to both ends.
  - Left side: the **tray**, a row of cards with a 10 px gap.
  - Right side: **Back**, in Barlow Condensed 600 24 capitals in the muted colour, then **Next**, the primary button.

## Components
- **Primary button:** accent background, text in the ground colour `#14100d`. Barlow Condensed 700, 24 px, capitals, letter-spacing 0.04em, padding 16 × 40, square corners.
- **Field label:** Barlow Condensed 600, 16 px, capitals, letter-spacing 0.14em, muted `#a8998a`.
- **Value:** IBM Plex Mono 15 in `#efe6dc`. A big value is Plex Mono 24 to 34, with its unit in muted 14 to 16.
- **Slider:** a 2 px track at `rgba(239,230,220,.14)` with the filled part in the accent colour, and a 14 × 14 square accent thumb.
- **Chip, used for options:**
  - Padding 8 × 12, a 1 px border at `rgba(239,230,220,.22)`, in IBM Plex Mono 15 or Barlow Condensed 600 17 capitals.
  - Selected: accent border and text, background wash `rgba(240,145,61,.12)`.
  - Warning: border and text in the warning colour.
  - Custom entry: a dashed border with placeholder underscores (`__:__`, `____ × ____`).
- **Tray card:**
  - 100 px tall and 112 to 190 wide, padding 13, 1 px border at `rgba(239,230,220,.14)`.
  - Top: a preview (swatch, shape or port silhouette) or one line of spec in Mono 12 to 13 muted.
  - Bottom row: the name in Barlow Condensed 600 19 capitals, and a count or price in Mono 13 muted.
  - Selected: accent border and wash. Unavailable: 45% opacity.
- **List row, used for Inside slots and Finish pieces:** Barlow Condensed 600 24 to 26 capitals, padding 9 × 14. Selected is the wash with accent text; a missing part is in the warning colour.
- **3D selection** (see `builder-laptop.js`):
  - An accent outline around the selected item, plus corner resize squares where it can be resized.
  - A dashed centre line for items locked to the centre.
  - **One double-headed drag arrow for each direction it can move.** Each arrow has a 1.1 mm thick shaft, cones 4.2 mm long, and a centre dot. The arrow being dragged is drawn in `#fff1e0`. Arrows ignore depth so they always draw on top.
  - You drag the arrows, never the item itself.

## Screens
1. **Year (`2a-year`):** the only choice in the brief. 2006, 2016 and 2026 in Barlow Condensed 700 112 px, line-height 0.92. Muted, except the selected year, which is in the accent colour with a 14 px accent square after it. Next or Back, then onward. The laptop is idle with its screen off.
2. **Screen (`2a-screen`):** a front view of the screen, showing a test grid.
   - Diagonal slider, in inches to one decimal.
   - Ratio chips: 16:9, 16:10, 3:2, 4:3 and a custom one.
   - Resolution rows (the standard ones for the ratio), each with its ppi, plus a custom row.
   - Refresh chips: 60, 90, 120, 144, 165, 240 and a custom one.
   - Tray: panel types IPS, OLED and Mini LED. TN is greyed out outside 2006 to 2016.
   - The bezel slider moved into the Chassis stage.
   - **Rule:** a combination nobody made that year is allowed and becomes a custom panel. The chip turns the warning colour and a line appears: "240 Hz at 2560 × 1600: custom panel  +$184  launch +4 months". Only things impossible in any year, such as OLED in 2006, are greyed out.
3. **Inside (`2a-inside`):** see-through X-ray view, **with the camera close on the selected part**. The view is `cpu`: target at (0.01 W, 0.55 H, −0.26 D), az −0.55, el 0.82, distance 0.85 × max(W, D). The scrim runs to 66%.
   - The column is two lists side by side:
     - Slots (230 wide): Processor, Graphics, Memory, Storage, Battery, Cooling, Wireless, Speakers.
     - The options for the selected slot, one row each: name, spec line, price. Options that don't fit (for example, too hot for the cooling) are at 45% opacity with the reason in the warning colour.
   - Under the options: the power limit slider for the chosen chip.
   - In the 3D view:
     - the selected part is drawn in the accent colour with light edges;
     - an empty slot shows a warning-coloured outline where the part goes;
     - everything else is dim.
4. **Power on (`2a-power`):** not a stage and has no buttons. It plays **by itself** over Inside the moment the last required part goes in.
   - The screen boots, the keyboard backlight comes on, and a warm glow comes from the screen.
   - The name shows in Barlow Condensed 700 80, with six big stats: Weight, Thickness, Battery, Performance, Surface temp, Fan noise.
   - After about 3 s, or on any click, the stats shrink into the top right strip and you are back on Inside.
   - It plays only the first time, or again after the laptop becomes invalid and then valid again.
5. **Surface, trackpad (`2a-surface`):** view from above the keyboard deck.
   - The column lists Keyboard, Trackpad, Webcam and Ports (with a count) in Barlow Condensed 32. The selected one is in the accent colour.
   - Trackpad controls: Width and Depth sliders, From keyboard in mm, and a "Centred" indicator.
   - Keyboard and trackpad are **always centred left to right**, so each has a single front to back arrow.
   - Webcam has a single left to right arrow along the top bezel.
   - Tray: trackpad types.
6. **Surface, ports (`2a-ports`):** side view, lid shut. The selected port is outlined.
   - It has **two arrows**: front to back along the side, and up and down the wall.
   - The height range is the wall height minus the top and bottom shells and the port's own height. If there is no room, the port stays centred and the up and down arrow is hidden.
   - Column: port name and spec; Side chips Left, Right and Rear; From rear, Gap to next, and From bottom with its allowed range; Duplicate and Remove.
   - Tray: port types, each with a silhouette and the count fitted. Drag one onto a side, or click it to add.
7. **Keys (`2a-keys`):** close view of the keyboard.
   - Group chips: Letters, Modifiers, Accent (Esc and Enter), Legend.
   - A full colour picker (a colour square and a hue strip) with a hex value and a finish label, plus recent swatches. **Any colour is allowed.**
   - Tray: key shapes Square, Rounded and Round; legend fonts (Plex Sans, Space Mono, Rubik and more); legend alignment (centre, top left, bottom left).
   - Legend case (as is, all capitals, all lower case) and legend size are extra controls. The stand-in renderer supports them (`legend-case`, `legend-size`).
8. **Finish (`2a-finish`):** hero view, turned slightly.
   - Pieces Lid, Deck, Bottom and Bezel, each with a hex value and a swatch.
   - For the selected piece: Material, Finish, and what it adds in grams and dollars.
   - Tray: materials, each listing the finishes it offers.
   - Colour is free-form, using the same picker as Keys.
9. **Marks (`2a-marks`):** view of the back of the lid.
   - Tabs: Lid, Palm rest, Bottom, Bezel.
   - For the selected text layer:
     - the text itself, in its own font and tracking, on an accent underline;
     - font chips;
     - a grid of properties: Size in mm, Tracking, Weight, Colour, Process (etched, printed, embossed), and Position.
   - Tray: the layers (SVG and text) and two dashed cards, **Import SVG** and **Add text**.
   - A selected mark has left to right and up and down arrows, plus corner resize squares.
   - Centre lines are dashed and the mark snaps to them.
10. **Price (`2a-price`):** hero view.
    - The name in Barlow Condensed 700 48, then the price in IBM Plex Mono 88 in the accent colour.
    - A price slider with a tick at the cost, and Cost, Margin and % below it.
    - The three nearest rivals, each with weight and price.
    - The main button is **Get reviewed**, where Next would be, with Back beside it.

## Interactions and behaviour
- Next and Back step through the stages. The stage bar jumps to any stage.
- Price stays reachable, but its column is empty and Get reviewed is disabled until the laptop is valid.
- Stats exist only after power on. Before that, the top right shows only the missing count.
- The screen spec is free-form, but the standard ratios and resolutions come first. Pricing and the launch delay come from the engine.
- Year limits apply only where the technology really differed (OLED, high refresh, thin bezels, TN, Mylar trackpads). Colours, fonts and marks are open in every year.
- Every change autosaves, as in the current `Builder.tsx` (400 ms debounce, and an immediate save when leaving). A reviewed laptop is locked.
- **Arrows:** point at an arrow to highlight it, and press and drag to move along that direction only. Movement is limited to the allowed range and snaps to centre lines and neighbouring ports.
- Transitions: 200 ms ease-out like `.fd-in` on column changes. The camera eases to each stage's view over about 600 ms.

## State (additions to `Build`)
- `screen: { diag, ratio: [w,h], res: [w,h], hz, panel, bezel }`, replacing the fixed panel picks.
- `layout: { kb: { y }, pad: { w, d, y }, cam: { x }, ports: [{ part, side, along, height }] }`, positions in mm.
- `keys: { shape, colours: { letters, mods, accent }, legend: { font, colour, align, case, size, weight } }`
- `finish[piece].colour` becomes any hex value instead of a colour id.
- `marks: [{ surface, kind: 'svg'|'text', svg?, text?, font, size, tracking, weight, colour, process, x, y }]`
- UI-only state: `stage`, `selected`, `dragAxis`, and whether the power on moment has already played.

## Design tokens
- Ground `#14100d`; deep ground `#0e0b09`; text `#efe6dc`; muted `#a8998a`; stages still ahead `#6f655b`.
- Accent `oklch(0.76 0.16 55)`, about `#f0913d`; accent wash `rgba(240,145,61,.12)`.
- Warning `oklch(0.82 0.14 85)`.
- Lines `rgba(239,230,220,.14)`; chip borders `rgba(239,230,220,.22)`; row dividers `rgba(239,230,220,.08)`.
- Fonts:
  - Barlow Condensed 600 and 700 for entries, names and buttons, always capitals.
  - IBM Plex Sans for body text.
  - IBM Plex Mono for values.
  - Extra legend and mark fonts: Space Mono, Rubik.
- Corners are square throughout, with no shadows except the glow on the boot screen.
- Copy rules: no headings, hints or meta text; no middots or em dashes.

## Files
- `screenshots/`: each turn 2 screen at 1440 × 810, numbered in flow order (01 year to 10 price).
- `Builder.dc.html`: the mockups. Turn 2 (`2a-*`) is the spec; turn 1 is reference only.
- `builder-laptop.js`: the stand-in 3D laptop. It covers the stage camera views, the X-ray and part closeup, keycaps and legends, decals, port placement, and the selection outline, arrows and handles. Read it for the arrow geometry and the view presets (`VIEWS`).
- `support.js`: the runtime for the `.dc.html` file.
