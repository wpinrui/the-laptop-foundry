# Handoff: Preset decals for the Marks stage

## Overview
30 original preset decals the player can drop onto the lid, palm rest, bottom or bezel without importing a file, plus the Marks stage browser that offers them. A preset mark behaves exactly like an imported SVG mark: it takes a colour, a process (etched, printed, embossed), a size and a position.

## About the files
`Marks Presets.dc.html` is a design reference in HTML (open it in a browser next to `support.js`; it loads `builder-laptop.js` and `decals.js`). Recreate the screens in the game's own UI; do not ship the HTML. The SVGs in `decals/` are production assets.

## Fidelity
High fidelity. Colours, type, spacing and states are final and match the builder handoff (`design_handoff_builder`, screen `2a-marks`). The 3D renders are the builder's reference laptop, not the game renderer.

## Decal rules (all 30 files follow them)
- One `<path fill-rule="evenodd">` per file inside a tight `viewBox`. No text, images, styles, scripts, gradients, masks or external refs.
- One ink. Internal detail is a cut-out; the game tints the silhouette with the player's colour.
- Lettering is outlined from a squared block font (cap height 6 units, strokes 1 unit). `decal-gen.js` is the generator if a decal needs editing: `buildDecals()` returns the same data as `decals.js`.
- Strokes and gaps are at least 1/40 of the decal height, so detail stays open at 8 mm on the palm rest; company marks and fun stickers are built for 30 to 60 mm.
- Every design is original. Certification and regulatory marks are generic pictograms and invented names; none imitates a real certification, standard or brand.
- Size in the manifest is the default height in mm. Width follows the viewBox ratio; resizing is always proportional.

## The flow
1. Marks stage, any surface tab (Lid, Palm rest, Bottom, Bezel). The mark list along the bottom ends with three dashed tiles: Import SVG, Add text, Presets.
2. **Presets** opens the browser in the left column (screen 3a). The tile turns solid accent while the browser is open.
   - Two chips: the current surface (default, selected) and **All**.
   - Presets are grouped by set, each group under a small Barlow label, five tiles per row (tile 80×64, glyph 34 px tall, name in Barlow 14 caps). The list scrolls; a 70 px fade sits at the bottom edge (and at the top once scrolled, 3f).
   - Surface filter: only presets meant for this surface. Sets with nothing for the surface are hidden.
   - All (3c): every set; sets with presets for the current surface come first; a tile meant for another surface shows that surface in Plex Mono 10 at its lower left. Any preset can go on any surface.
   - A 6 px accent square top right of a tile means that preset is already on the laptop.
   - Hover (3a): tile border, fill and glyph go accent, and a 45% ghost of the decal appears at its default size and position on the laptop.
3. Click adds the preset at its default size, centred on the surface's default spot (lid: centre line at 30% down; palm: 80% down, left or right of the pad; bottom: centre; bezel: chin centre), printed, in #EFE6DC. The browser closes and the new mark is selected (3b).
4. The mark list gains a card with a solid **DECAL** badge (Plex Mono 12, ground on #A8998A; on accent when selected) and a small silhouette of the decal top right. T and SVG cards keep their outlined badges.
5. Selected preset controls (3b, 3d, 3e) replace the text editor in the left column:
   - Header: the decal silhouette at 40 px plus its name in Barlow 700 40 px, accent underline (the text field's position).
   - Grid, same cells as the SVG mark: **Size** (mm, proportional; the corner squares on the laptop resize too), **Colour** (swatch plus hex, or `Body` when it matches the chassis colour), **Position** (mm from the surface centre; a snapped axis reads in accent).
   - **Process**: three preview tiles on the surface colour. Etched: lighter, satin, slight bevel. Printed: flat ink. Embossed: raised, lit top left, shadow bottom right. Selected tile has a doubled accent border and accent label.
   - On the laptop: accent frame with corner squares, a move arrow per axis, dashed snapping centre lines.
6. Bottom tab turns the laptop over (3e): lid closed underneath, rubber feet and vents visible, so underside marks can be placed around them.

## Screens (screenshots/)
- 01-browse-lid.png: 3a, browser on the lid, filtered, Orbit hovered with its ghost.
- 02-added-lid.png: 3b, Orbit added and selected, etched.
- 03-browse-all-palm.png: 3c, palm rest, All, placed presets dotted.
- 04-palm-selected.png: 3d, Tuned Audio selected, printed in the accent.
- 05-bottom-selected.png: 3e, underside with rating plate embossed, plus recycle, bin, conformity and serial marks.
- 06-lid-stickers.png: 3f, lid scrolled to Fun, stripes, flame and stars next to an imported SVG.
- 07-decal-sheet.png: every decal large, then at 8 mm actual size (at 96 dpi) in cream and accent.

## Tokens
Ground #14100d, text #efe6dc, muted #a8998a, dim #6f655b, accent oklch(0.76 0.16 55) (#f0913d on the laptop), accent tint rgba(240,145,61,0.12), line rgba(239,230,220,0.14), strong line rgba(239,230,220,0.22). Barlow Condensed 600/700 caps for labels, names and buttons; IBM Plex Mono for values, badges and file names; IBM Plex Sans for body.

## Rendering notes (see presetCanvas in builder-laptop.js)
- Fill the path with the player's colour using the evenodd rule, scaled so the viewBox height equals the size in mm.
- Etched: ink colour, roughness 0.5, metalness 0.3, a little emission so it reads as a lighter cut.
- Printed: ink colour, roughness 0.62, no metal.
- Embossed: chassis material plus a bump map from a blurred copy of the silhouette; the colour defaults to the body colour.

## Manifest
Size is the default height; width is derived from the viewBox. Eras are suggestions only; every preset is available in every year.

| File | Name | Set | Surface | Size (mm) | Width (mm) | Suits |
|---|---|---|---|---|---|---|
| decals/a1-prism.svg | Prism | Company marks | Lid | 40 | 46.2 | 2016, 2026 |
| decals/a2-orbit.svg | Orbit | Company marks | Lid | 40 | 40.0 | 2016 |
| decals/a3-corner.svg | Corner | Company marks | Lid | 36 | 36.0 | 2026 |
| decals/a4-crest.svg | Crest | Company marks | Lid | 44 | 33.8 | 2006 |
| decals/a5-wingbadge.svg | Wingbadge | Company marks | Lid | 20 | 62.5 | 2006 |
| decals/a6-twin-v.svg | Twin V | Company marks | Lid | 32 | 47.2 | 2016 |
| decals/a7-hexbolt.svg | Hexbolt | Company marks | Lid | 40 | 46.2 | 2006 |
| decals/b1-havoc.svg | Havoc | Line badges | Lid | 8 | 35.2 | 2006, 2016 |
| decals/b2-ledger.svg | Ledger | Line badges | Palm rest | 5 | 20.0 | 2016, 2026 |
| decals/b3-studio.svg | Studio | Line badges | Palm rest | 5 | 17.1 | 2026 |
| decals/b4-flux.svg | Flux | Line badges | Bezel | 3.5 | 17.2 | 2026 |
| decals/b5-titan.svg | Titan | Line badges | Bezel | 4 | 10.1 | 2006 |
| decals/c1-helix-cpu.svg | Helix CPU | Certification and feature | Palm rest | 14 | 14.0 | 2006, 2016 |
| decals/c2-gpu-fan.svg | GPU Fan | Certification and feature | Palm rest | 10 | 19.2 | 2006, 2016 |
| decals/c3-eco-leaf.svg | Eco Leaf | Certification and feature | Palm rest | 12 | 12.0 | 2016, 2026 |
| decals/c4-rugged.svg | Rugged | Certification and feature | Palm rest | 14 | 14.0 | 2006 |
| decals/c5-tuned-audio.svg | Tuned Audio | Certification and feature | Palm rest | 12 | 12.0 | 2006, 2016 |
| decals/c6-vivid-display.svg | Vivid Display | Certification and feature | Palm rest | 14 | 14.5 | 2016 |
| decals/d1-conformity.svg | Conformity | Regulatory and underside | Bottom | 8 | 8.0 | 2006, 2016, 2026 |
| decals/d2-recycle-loop.svg | Recycle Loop | Regulatory and underside | Bottom | 9 | 8.2 | 2006, 2016, 2026 |
| decals/d3-no-bin.svg | No Bin | Regulatory and underside | Bottom | 10 | 8.5 | 2006, 2016, 2026 |
| decals/d4-polarity.svg | Polarity | Regulatory and underside | Bottom | 6 | 18.7 | 2006, 2016, 2026 |
| decals/d5-rating-plate.svg | Rating Plate | Regulatory and underside | Bottom | 20 | 28.5 | 2006, 2016, 2026 |
| decals/d6-serial-tag.svg | Serial Tag | Regulatory and underside | Bottom | 10 | 22.4 | 2006, 2016, 2026 |
| decals/e1-twin-stripe.svg | Twin Stripe | Fun and personal | Lid | 160 | 34.0 | 2006 |
| decals/e2-flame.svg | Flame | Fun and personal | Lid | 50 | 40.4 | 2006 |
| decals/e3-star-trio.svg | Star Trio | Fun and personal | Lid | 40 | 53.6 | 2016 |
| decals/e4-checker-flag.svg | Checker Flag | Fun and personal | Lid | 36 | 30.6 | 2006 |
| decals/e5-bolt-robot.svg | Bolt the Robot | Fun and personal | Lid | 40 | 44.4 | 2016, 2026 |
| decals/e6-kiln-cat.svg | Kiln the Cat | Fun and personal | Lid | 40 | 44.0 | 2026 |

## Files
- `decals/`: the 30 SVGs.
- `decals.js`: the same data as JSON (id, name, set, surface, size, eras, viewBox, path) for the mockup and the renderer.
- `decal-gen.js`: generator source for the SVGs.
- `Marks Presets.dc.html`, `builder-laptop.js`, `support.js`: the mockup. `builder-laptop.js` adds `presets="surface:id:x:y:size:color:process,..."`, `select="preset:N"`, `flip` and `view="bottom"` to the builder laptop.
- `screenshots/`.
