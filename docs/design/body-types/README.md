# Body types: handoff

Today's three bodies differ mostly by corner radius, so picking one hardly changes the laptop. This handoff replaces them with eight bodies, each a different kind of laptop, and redesigns how the Chassis stage offers them.

- Every body scales over the same range (240–450 × 160–330 × 8–55 mm) and starts at 340 × 240 × 22 mm.
- Every shape parameter is written as a rule of the size, so each body is valid everywhere in that range.
- Several shapes change the usable space inside. Each is written up below, and the engine changes it needs are listed.

## Contents

- `README.md`: this file.
- `mockups/Chassis Stage.html`: the stage at 1440 × 810. It works: drag the sliders, hover a card to preview a body, click a card to pick it. Hover the signature slider for the section view.
- `mockups/Body Types.html`: the reference sheet. Each body has a 3/4 view, a section with its usable space, a plan, silhouettes at the min, start and max sizes, and its values resolved at those sizes.
- `screenshots/`: 01–09 are the stage, 10–15 the sheet.
- `proposed/bodies.ts`: the new `BODIES` table.
- `reference/body-kit.js`: the geometry both mockups draw from. It resolves the rules, builds the side section, gives floor room at depth y, measures usable volume, and does a crude fit. It is a working reference for the shell changes below, not engine code.

## The set

| Body | Years | Hinge | Layouts | Signature | Character |
|---|---|---|---|---|---|
| Workhorse | 2000– | Full width | A B C | Corners | Square slab. The reference inner box. |
| Pillow | 2000–2012 | Two barrels, latch | A B C | Roundness | Big plan corners, deep round edge, domed lid. |
| Spine | 2000–2011 | Spine barrel | B C | Spine | Cylindrical rear spine hangs below and tilts the deck. |
| Field | 2000– | Full width, latch | A B C | Bumpers | Rugged: walls ×1.7, corner bumpers proud of top and bottom. |
| Blade | 2008– | Drop | A B C | Taper | A true taper to a thin chamfered front. |
| Float | 2013– | Drop | A B C | Undercut | The lower half tucks in under a cove all round. |
| Shelf | 2014– | Inset | A C | Shelf | Hinge forward of a raised rear shelf for exhaust and ports. |
| Lift | 2019– | Lifting | B C | Lift | The lid's lower edge swings under the rear and raises it. |

The tray in each 0.1 year:

- **2006**: Workhorse, Pillow, Spine, Field.
- **2016**: Workhorse, Field, Blade, Float, Shelf.
- **2026**: Workhorse, Field, Blade, Float, Shelf, Lift.

Each year's line-up covers business, consumer or rugged, thin, and performance.

## Where each shape changes the space inside

"Floor room" means inner bottom to the top wall or deck layer, as `solve.ts` uses it today. The percentages are usable volume against a Workhorse of the same size, 340 × 240 × 22 mm, at the body's first 0.1 year. `sectionSvg` draws the same numbers.

- **Workhorse**: the full inner box. The corner stays at or under 5 mm, which the side wall already covers.
- **Pillow**: no gains. Two losses:
  - The 10–22 mm plan corners push the box in on every side through the existing `cornerOffset`.
  - The deep edge radius lifts ports and vents clear of it (`profileLift` / `profileTop`), so a thin Pillow runs out of wall height for ports before it runs out of room for parts.
  - The domed lid is built outward and changes nothing inside.
- **Spine**: gains below, costs in depth.
  - *Gain:* a rear-edge zone gets the spine's extra depth (`drop`) below the floor line. In layouts B and C that zone is the battery, which is where cylindrical cells go.
  - *Cost:* the deck and lid stop at the spine's axis, so the lid is `D/2` shorter than the base (D = Z + drop). A given panel needs that much more base depth.
  - The hinge mounts live in the spine, not on the floor.
- **Field**: loses on all three axes.
  - Walls are 1.7 times the era's.
  - The shell sits inside the bumpers, so it loses a quarter of the bumper at the top and at the bottom.
  - The corner keep-out grows to the bumper block (2.2 × bumper), so ports and vents keep further from the corners.
  - Roughly 70 % of a Workhorse at the start size. At 8 mm thick very little room is left, and the fit engine reports it as short.
- **Blade**: floor room falls toward the front: `h(y) = Z − T·(1 − smoothstep(y / 0.7Y))`, with `T = Z − max(5, k·Z)`.
  - The thickness the player sets is the rear, the thickest point. The slider shows the range, e.g. 8.8–15.5 mm.
  - The front zones decide the minimum thickness: layout A's battery row and whatever sits under the palm rest. The front edge never drops below 5 mm, so the taper shrinks by itself on thin builds.
- **Float**: loses at the perimeter.
  - The inner box comes in by the inset on every side, so width and depth each lose 2 × inset.
  - Ports and vents open above the undercut, so they lift to its height. On thin Floats, port height rather than parts often sets the minimum thickness.
- **Shelf**: costs in depth, gains in height at the rear.
  - *Cost:* the deck and lid end at the hinge. The lid is `Y − shelf` deep and the keyboard band moves forward, so the same screen needs more base depth. Screenshot 04 shows 13.8 mm short.
  - *Gain:* the shelf band has no deck over it and rises by `min(rise, lidZ)`. Rear fans there grow taller and rear ports get a full-height wall.
  - Rear-fan layouts only (A, C).
- **Lift**:
  - The rear-bottom edge is chamfered so the lid can swing past it: rear-edge zones lose 1.1 × lip at the bottom.
  - The rear wall is covered by the lid, so there is no rear port strip (layouts B and C only).
  - Open, the rear rises by 0.6 × lip. That is a hook for the cooling model's intake, and no fit change.

## Parametric model changes

### `types.ts`

```ts
/** A length that follows the size: k × the axis (short = min(x, y)), clamped. A [k0, k1] pair is the signature slider's range. */
export type Scaled = number | { k: number | [number, number]; of: Axis | "short"; min: Mm; max: Mm };

export interface BodyStyle {
  edge: "square" | "rounded" | "chamfer";
  corner: Scaled;
  profile: Scaled;
  wedge: Mm;                                   // kept for old data; every new body uses 0
  hinge: "full" | "barrel" | "drop" | "spine" | "inset" | "lift";
  latch: boolean;
  /** Which parameter the player's signature slider moves. */
  signature: "corner" | "profile" | "drop" | "bumper" | "taper" | "undercut" | "shelf" | "lip";
  taper?: { front: [number, number]; minFront: Mm; run: number }; // front thickness as a share of Z
  undercut?: { inset: Scaled; height: Scaled };
  spine?: { drop: Scaled };
  shelf?: { depth: Scaled; rise: Scaled };
  lift?: { lip: Scaled };
  bumper?: Scaled;
  wallScale?: number;
  crown?: Scaled;                              // lid dome, outward only
}

export interface Build { /* … */ shape?: Partial<Record<string, number>> } // signature slider per body id, 0–1, default 0.5
```

`Shell.style` becomes a `ResolvedStyle`: all millimetres, plus derived values (`T`, `D`, `Sd`, `R`, `ui`, `uh`, `lip`, `bumper`, and `Yd`, the depth where the deck and lid end).

### `shell.ts`

- `resolveStyle(style, size, shape): ResolvedStyle` is the only reader of `Scaled`. It also applies the cross-limits: profile ≤ (front Z − 2q)/2, spine D ≤ 0.3Y, shelf rise ≤ lidZ, undercut height ≤ Z/2, lip ≤ 0.6Z, bumper ≤ 0.6Z.
- `baseOffsets` adds the undercut inset to `side` and uses the bumper block as the corner radius. `bottom` and `top` gain `q` (a quarter of the bumper). Walls are multiplied by `wallScale` before any of this.
- New `floorBand(style, outer, walls, y): [lo, hi] | null` gives the room at depth y and is the exact twin of `band()` in `body-kit.js`:
  - the taper raises `lo`;
  - the shelf raises `hi` behind `Y − Sd`;
  - the spine lowers `lo` inside its circle;
  - the lift chamfer raises `lo` near the rear.
- `insideBase` checks points against `floorBand` too, so the headless test can hold the construction to the verification, as it does today.
- `profileLift` becomes `max(profile, undercut.height, q) − bottom`.

### `solve.ts`

- **Per-zone room.** Floor room is no longer `F.z − cover − floorZ0` everywhere. Each zone takes the minimum of `floorBand` over its y-span:
  - on the front edge for a taper;
  - over the whole span elsewhere.
  - For the minimum-z search, each unit needs `height + cover ≤ room(y-span; Z)`. For a taper the room is `Z · (1 − (1 − r)·s(y)) − walls`, which is monotonic in Z, so solve it per unit in closed form (piecewise at the 5 mm front floor) or bisect it.
- **Deck and lid depth.** The deck is placed in `[off.side, Yd − off.side]` and the lid plan is `Yd` deep, not `FY`. `minY` gains `FY − Yd` from both the deck and the lid terms. This is what makes Shelf and Spine cost depth.
- **Shelf band.** Floor zones on the rear edge whose y-span lies behind `Y − Sd` get no deck cover and `+R` room. `coverOver` already returns 0 there once the deck ends at `Yd`.
- **Spine.** A rear-edge zone wholly inside the spine circle gets `z0 = floorZ0 − drop'`, where drop' is the circle's clearance over the zone's span. Its units' minimum z drops by the same amount. The hinge anchor goes to the spine axis `(Y − D/2, Z − D/2)`.
- **Hinge anchor.** full/barrel: `(Y, Z)`. drop: `(Y − 0.4 lidZ, Z − 0.35 lidZ)`. inset: `(Y − Sd, Z)`. lift: `(Y − 0.2 lidZ, Z − 0.3 lip)`. The existing proof that the lid never enters the base still holds for every one: the closed lid lies wholly in front of and above each axis.
- **Ports.** `Layout.portSides` is intersected with the body. Lift drops `rear`; the `port-side` compat problem already covers a port left on a removed wall. Body `layouts` lists already exclude the layouts that break (Lift: A, Shelf: B, Spine: A).

### `shellGeometry.ts`

The ring model (a profile ring swept round a rounded-rect outline) still covers Workhorse, Pillow, Field and Float:

- **Float**: the undercut is a cove added to the bottom rings, from `(ui, 0)` to `(0, uh)`.
- **Field**: bumpers are four extra meshes.
- **Blade, Spine, Shelf, Lift**: these vary along y. Build them as the side section (`baseProfile` in `body-kit.js`), extruded across x and intersected with the plan's rounded corners. The simplest route is to sweep each ring of the plan outline with z remapped by the section at that point's y. `shellGeometry` already moves points by y for the wedge, so this generalises that `wedge()` step into `section(y, z)`.

### `fit.test.ts`: new invariants

- For every body, at the 8 corners of `LIMITS` and at START, and at signature 0, 0.5 and 1:
  - `resolveStyle` returns finite values;
  - the section is a simple polygon;
  - the floor band is non-empty somewhere;
  - every placed unit lies inside `insideBase`.
- For each body, `minimum()` is monotonic in the signature slider in the direction the table says: more taper never lowers min Z, and a deeper shelf never lowers min Y.
- The Workhorse fit is unchanged from today's, apart from its corner now following the size.

## Chassis stage

These build on the stage as it is: same column, tray, scrims and Foundry controls. The screenshots show them.

1. **Tray cards show the shape, not words.** The top line ("Chamfered edges  wedge") becomes the body's side silhouette, closed, drawn from the resolved rules at the build's current size.
   - All cards share one mm-to-px scale, with height ×2 at most so thin bodies still read.
   - The differences you choose between (taper, spine, shelf, bumpers, undercut, lid lip) are all visible in profile.
   - The selected card draws in the accent.
2. **Card aside: what switching would cost.** Each card solves the current build on that body. If it would come up short, the aside reads the largest shortfall in warning colour, e.g. `+13.8 mm`. Otherwise it is empty. Solving 6–8 bodies per change fits the "live feedback" budget (a mock of the same check runs in the prototype), but it can be deferred to stage entry and debounced.
3. **Hover previews.** Hovering a card shows that body on the plinth at the current size. Leaving restores the pick; a click commits (`toBody`, which already keeps size and fixes the layout).
4. **One signature slider per body**, directly under Thickness and labelled with what it moves: Corners, Roundness, Spine, Bumpers, Taper, Undercut, Shelf or Lift.
   - The value shows the resolved millimetres. It is 0–1 in the build (`build.shape[body]`) and lerps that parameter's `k` range, so it stays size-safe.
   - While it is hovered or dragged, the scene switches to the **section view**: the base in section (height ×2.5), usable floor room in the accent, the Workhorse inner box dashed, and the hinge axis ringed. The player sees the space the shape takes or gives.
5. **Thickness shows the range on a taper** (`8.8–15.5 mm`). The slider and its minimum tick stay on the rear value.
6. **Inside, in litres.** A read-only line under the signature slider gives usable floor volume. It is the one number that trades against the shape. Following the frontend text rule, it could go if playtests show nobody reads it.
7. **Layout chips follow the body.** They already filter by `body.layouts`; Lift, Shelf and Spine now show two.
8. **Remove the Hinge line.** The silhouette and the plinth already show the hinge, and it is not a choice.

The text rule holds: no captions on the cards, no legend in the scene, and the only new words are the slider label and one number.

## Scaling notes

- The signature range is always a `k` pair, never raw millimetres, so the slider means the same thing on an 11" and an 18" machine.
- Clamps guarantee a valid shell at the extremes. Some bodies are simply poor at their extremes, which is intended; the fit engine reports it the usual way:
  - Field at 8 mm;
  - Shelf at 160 mm deep, where the shelf clamps to 16 mm;
  - Spine at 8 mm, where the spine becomes a 12–13 mm barrel.
- Years gate bodies with `from`/`until`, as today. Moving a Pillow build to 2016 gets the existing "Body not available this year" problem.

## Migration

- `workhorse` and `pillow` keep their ids and character.
- `blade` keeps its id but becomes a true taper: the player's Z is now the rear, not the front. The GDD makes no save-compatibility promise. To be kind anyway, convert old Blade saves with `z_new = z_old + 6`.

## Open questions

- Should Field carry a durability bonus in the review? Material durability feeds it today; this would be a body term.
- Should Lift's rear rise feed intake airflow in `sim/`? The hook is there; the number is not tuned.
- The hero on the Chassis mockup is a stand-in (flat extrusion, square plan corners). The engine renders the real shell.
