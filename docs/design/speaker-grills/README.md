# Handoff: speaker grills

Speakers are placed inside the laptop (Inside stage, Speakers slot: Place, Turn, Arrange), but nothing on the shell shows where the sound leaves. This adds a speaker grill the player sets on the Speakers slot, drawn in code on the shell, scaled to the body and laid on its surfaces.

## What is in this folder

- `mockup/Speaker Grills.dc.html`: open it in a browser (keep `grills.js` and `support.js` beside it). Section A is the Inside stage with the Speakers slot open, live and clickable. B to E are renders made from the same rules. Year, body and keyboard columns are Tweaks.
- `mockup/grills.js`: the reference implementation of every rule below (patterns, fit, stock, drawing). It uses simplified bodies, so treat it as the spec, not code to copy. The real engine should use `outerSection`, `outerSpanAt`, `perimZones` and `faceAt` from `shell.ts` and `grill.ts`.
- `screenshots/`:
  - `01a-builder-2006-front.png` and `01b-builder-2006-deck.png`: the builder.
  - `02-patterns.png`: the patterns at three hole sizes, and the smallest dot in each era.
  - `03-eras.png`: the stock grill in 2006, 2016 and 2026.
  - `04-bodies.png`: every body with its deck and front grill.
  - `05-scaling.png`: edge cases.

## What the player gets

On the Speakers slot, above Compact (the same place the fan grill sits on Cooling):

- **Grill**, chips: `NONE`, `DECK`, `FRONT`.
  - Front is only offered up to 2012 (`FRONT_UNTIL`). After that the chip is not rendered at all, the same way a part that does not exist in a year is not listed.
  - A place that does not fit this body is shown disabled.
  - No chip is ever an "Auto" chip. An untouched build shows its stock choice as selected.
- **Pattern**, chips: `DOTS`, `SLOTS`, `BARS`, `HEX`. Each chip has a 26 by 14 swatch before its name. A pattern whose smallest hole cannot fit two across the grill is disabled.
- **Hole size**, a `SliderField` in mm with `digits={1}`, `step={0.1}`. Its range comes from the pattern, the era and the grill's short side.
- Pattern and Hole size are hidden while Grill is None.
- Per GDD's frontend text rule there are no captions, hints or reasons. A dimmed chip is the whole message, as on `GrillField`.

## Stored options

These go on the speakers part's opts (`build.parts.speakers[0].opts`), mirroring `grillOf` and `withGrill` in `engine/grill.ts`. Absent means stock, and defaults are left out.

- `spkGrill`: `"none" | "deck" | "front"`
- `spkPattern`: `"dots" | "slots" | "bars" | "hex"`
- `spkHole`: number, mm, one decimal

Add `speakerGrillOf(build)`, `withSpeakerGrill(build, patch)` and `speakerGrillOptionOk(key, value)` (the last for `validate.ts`, as `grillOptionOk` is). `withPart` should keep these opts when the player swaps speaker parts, the way it keeps `fan` on cooling.

## Constants (mm unless noted)

| Name | Value | Meaning |
|---|---|---|
| `FRONT_UNTIL` | 2012 | Last year the front grill is offered |
| `MARGIN` | 0.4 | Inset inside the flat face (same as grill.ts) |
| `END_GAP` | 1.5 | Off the ends of the flat face (same as grill.ts) |
| `EDGE_GAP` | 4 | Deck grill off the deck's flat edge |
| `KEY_GAP` | 4 | Deck grill off the keyboard |
| `DECK_MIN_W` | 8 | Narrowest deck panel |
| `DECK_MAX_W` | 34 | Widest deck panel; a wider gutter centres it |
| `FRONT_MIN` | 4 | Shortest front band that takes a grill |
| `FRONT_MAX_H` | 7 | Tallest front grill |
| Front length | 0.13 × width, 32 to 52 | Each front panel |
| `PORT_GAP` | 2 | Off ports (reuse grill.ts) |

Era rules (by year):

| Years | Smallest hole | Smallest web | Finish |
|---|---|---|---|
| to 2010 | 0.8 | 0.8 | Moulded: the holes sit in a recessed panel 1.2 mm larger all round |
| 2011 to 2018 | 0.5 | 0.6 | Machined: flush, no panel |
| 2019 on | 0.3 | 0.4 | Machined: flush, no panel |

Pattern ranges before the era clamp:

| Pattern | Hole range (mm) |
|---|---|
| Dots | 0.3 to 2.5 |
| Slots | 0.6 to 2.0 |
| Bars | 0.6 to 2.0 |
| Hex | 1.0 to 3.0 |

## Hole geometry

The web is `max(eraWeb, 0.6 × hole)` and the pitch is `hole + web`, so a bigger hole keeps roughly the same open area (see `02-patterns.png`). The grill is S across its short side and L along its long side. It is laid out centred, with holes kept wholly inside (`holesFor` in grills.js):

- **Dots**: circles of diameter `hole` on a triangular lattice. Rows are `pitch × √3 / 2` apart along L and alternate n and n − 1 holes across S, so the grid staggers and stays centred.
- **Hex**: the same lattice, with hexagons `hole` across the flats and flats facing across S.
- **Slots**: stadiums `hole` wide and `max(3 × hole, 2.4)` long, capped to the width, running across S. Rows are `pitch` apart and alternate n and n − 1 holes.
- **Bars**: one stadium per row, the full width of S, rows `pitch` apart.

The largest hole is the biggest in the pattern's range that still fits two holes across: `2 × hole + 3 × web ≤ S`. If even the smallest hole fails this, the pattern is disabled. Open area is total hole area over `S × L`.

## Where the grill goes

Both places always draw a mirrored pair, left and right. A mono speaker plays through one of them; nobody sees the difference.

### Deck, beside the keyboard

- The keyboard rect is the deck plan's keyboard zone.
- The gutter is `kbLeft - topInset - EDGE_GAP - KEY_GAP`. Here `topInset` is the edge profile on a styled body, or the side's top-zone inset on a perimeter body.
- The panel width is `min(gutter, DECK_MAX_W)`, centred in the gutter. The panel runs the keyboard's depth, clipped to the flat deck.
  - The flat deck ends before a shelf, a spine or a lift chamfer. `MeshData.deck.outline` and Decor's `flat` test already describe it.
  - Clipped holes are dropped whole, never cut.
- Deck fits when the panel is at least `DECK_MIN_W` wide.
  - Fails: 19 columns in a 340 mm body (the keyboard is wider than the body; see `05-scaling.png`).
  - Passes: every body at the start size with 15 columns.
- Each hole sits on the deck's surface at its own depth (`outerSection(style, outer, y)[1]`, or `outerSpanAt` on perimeter bodies). This keeps it right on any section that changes along the depth.

### Front wall

- The grill sits on the front wall's flat band. That is where the wall stands vertical, between the bottom edge zone (profile, undercut, taper floor, or the perimeter bottom zone) and the top one. This is `faceAt(style, outer, "front", u)` in grill.ts, which is the same test the fan grill uses.
- The grill height is `min(band, FRONT_MAX_H)`, centred on the band, which is roughly where the top and bottom cases meet.
- Along x it keeps `END_GAP` off the plan corner, bumper blocks and perimeter corner insets (reuse the `perimInsets` and `ringCorner` loop from `grillCutouts`). It also subtracts front ports with `PORT_GAP`.
- Each panel's centre is over its speaker group when the speakers are in a front zone. The mock uses a fixed place near each corner, and the engine should centre on the placed `spk` units' x.
- Front fits when the year allows it, the band is at least `FRONT_MIN`, and the span holds a panel.
  - Fails: a Pillow at 10 mm, where the round edge leaves 3.2 mm.
  - Fails: Wedge fronts near the razor end of the signature slider.
  - Passes: Teardrop and Capsule, on their thin edge bands.

### Stock and fallback

- Stock by era:
  - To 2010: Front if it fits, else Deck. Slots at 1.2 mm.
  - 2011 to 2018: Deck. Dots at 1.0 mm.
  - 2019 on: Deck. Dots at 0.5 mm.
  - If nothing fits: None (the sound leaves through the bottom).
- The player's choice wins while it fits. When a resize makes it not fit, the grill shows stock, the same way `grillCutouts` falls back to stock when `faceOk` is false. The stored option is kept, so growing the body back restores it.
- An out-of-range hole is clamped for drawing but not rewritten.

## Engine output

Add to `fit.shell` a `speakerGrill: SpeakerGrillFit`:

```ts
interface SpeakerGrillFit {
  place: "none" | "deck" | "front";        // as drawn
  fits: { deck: boolean; front: boolean };  // for the chips
  frontOffered: boolean;                     // year <= FRONT_UNTIL
  pattern: SpeakerPattern;
  hole: number;
  range: Record<SpeakerPattern, { min: number; max: number; ok: boolean }>;
  web: number;
  open: number;                              // share of the grill area
  panels: { surface: "deck" | "front"; cx: number; cy: number; cz: number; s: number; l: number }[];
}
```

Keep it out of `cutouts`. The fan grill's openings are vents with airflow maths behind them, while these panels only need drawing.

## Viewer

Add `viewer/speakerGrill.ts`, modelled on `viewer/grill.ts`.

- Build every hole as a flat polygon in the opening colour (`--color-opening`). Merge the polygons into one `BufferGeometry` for the base and use `polygonOffset` (factor -3) rather than a large lift.
  - Deck holes lie on the top surface.
  - Front holes lie on the plane y = 0 inside the band.
- Draw the 2006 recessed panel under the holes: a rounded rect 1.2 mm larger all round, corner radius 2.5, in the deck finish darkened to about 62%. It needs a token, such as `--grill-panel-shade`.
- Budget: the worst case is 2026, 0.3 mm dots on a 34 by 118 mm panel, about 8,000 holes a side. As polygons that is about 130k triangles.
  - Draw holes under 0.6 mm as a canvas texture on the face instead, as `Decor.tsx` does for marks. It has one pixel per 0.05 mm and alpha where the holes are, which avoids aliasing too.
  - Above 0.6 mm, use geometry, or one `InstancedMesh` per pattern.
- The keyboard well and trackpad are unchanged.

## Builder

- Add `SpeakerGrillField` beside `GrillField` in `builder/FanField.tsx`, or in its own file. Render it in `InsideColumn` when `current.cat === "speakers"` and the part is present, before the Compact slider.
- Chip markup:
  - Place chips are `<Chip caps on disabled>`.
  - Pattern chips are `<Chip caps>` with a small swatch before the name. Use the `bd-visual` class the Keys stage already uses. Draw the swatch with the same `holesFor`, as an inline SVG from the engine function, not a picture file.
- **The view.** The Inside stage draws x-ray with `hideDeck`, so a deck grill is invisible there.
  - While the pointer is on or dragging a grill field, preview the outside view framed on the grill. Use the same pattern as the Chassis stage's section preview (`onHover` on `SliderField`, a preview state in `Builder.tsx`).
  - Deck is framed from three quarters above on the left panel. Front is framed low from the front.
  - The mock animates the swing over about 450 ms.

## Audio (proposal, tune in play)

Mirror `grillAir` with a `grillSound(fit)` returning a loudness factor for the speakers' output:

- None: 0.9 (bottom-firing into the desk).
- Deck: `clamp(1 + 0.04 × log2(open / 0.25), 0.95, 1.03)`.
- Front: the Deck value × 0.98.

Open area in the mock runs about 17% to 57%. This is only a suggestion; skip it if audio is not modelled yet.

## Assumptions to veto

- (a) The grill fields live on the Speakers slot in Inside, not on the Surface stage.
- (b) Front is only offered up to 2012; later builds get Deck or None.
- (c) Both deck panels are identical and mirrored, even for mono speakers.
- (d) Patterns and hole sizes are open in every year, but the era sets the smallest hole and web, so 2006 cannot have 0.3 mm dots.
- (e) The grill costs nothing; the mock's speaker prices are placeholders.

## Screen map

| Mock | Repo files it follows |
|---|---|
| Section A, builder | `builder/Stages.tsx` (InsideColumn), `builder/FanField.tsx` (GrillField), `builder/ui.tsx`, `builder/Parts.tsx`, `builder/builder.css`, `styles/tokens.css` |
| Sections B to E, renders | `engine/grill.ts`, `engine/shell.ts`, `engine/shellGeometry.ts`, `engine/content/bodies.ts`, `engine/content/layouts.ts`, `engine/content/peripherals.ts`, `viewer/grill.ts`, `viewer/Decor.tsx` |
