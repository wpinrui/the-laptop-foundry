# New bodies: handoff

Eight bodies added to the set, plus the geometry and stage changes they need. Everything else is unchanged from the previous handoff.

## Contents

- `bodies-new.ts`: the eight new `BODIES` entries (append to `bodies.ts`).
- `reference/body-kit.js`: the updated geometry reference. New: `insetAt`, `outerAt`, `pmLevels`, `roundRect4`, perimeter branches in `baseProfile`, `band`, `sideOffset`, `volume`, `fits`, `planSvg`, and a lofted hero.
- `screenshots/`: 3/4 view of each new body at 340 × 240 × 22 mm.

## The new bodies

| Body | Years | Hinge | Layouts | Signature | Character |
|---|---|---|---|---|---|
| Wedge | 2003–2016 | Full width | B C | Wedge | One flat underside plane, thick rear to thin front. |
| Slant | 2009– | Drop | A B C | End slant | Front and rear faces raked back underneath; sides square. |
| Capsule | 2012– | Full width | A B C | End radius | Ends roll over top and bottom, up to a half-round. |
| Teardrop | 2006–2017 | Drop | B C | Taper + per side | Convex curved underside to a thin edge all round. |
| Ultra | 2015– | Drop | A B C | Taper + per side | Straight bevel under every edge. |
| Knife | 2018– | Drop | A B C | Taper + per side | Top chamfer and lower bevel meet at an edge line. |
| Facet | 2019– | Drop | A B C | Facet + per side | Chamfered plan corners, bevel under every edge. |
| Aero | 2021– | Drop | A B C | Base radius | Uniform flat ultralight, big corners. |

Trays now: 2006 +Wedge, Teardrop. 2016 +Wedge, Slant, Capsule, Teardrop, Ultra. 2026 +Slant, Capsule, Ultra, Knife, Facet, Aero.

## Model changes

### Wedge

Uses the existing `taper` with `linear: true` and `run: 0.85`: `h(y) = Z − T × (1 − y / 0.85Y)`, front never below 6 mm.

### Perimeter bodies (Slant, Capsule, Teardrop, Ultra, Knife, Facet, Aero)

```ts
type EdgeKind = "linear" | "chamfer" | "round" | "curve";
interface BodyStyle {
  // …existing
  edge: "square" | "rounded" | "chamfer" | "perim";
  cornerKind?: "round" | "chamfer";            // Facet
  perim?: {
    top: { kind: EdgeKind; h: Scaled; d: Scaled | "h" };
    bot: { kind: EdgeKind; h: Scaled | "edge" | "full"; d: Scaled | "h" };
    edge?: { k: number; min: Mm };             // for bot.h = "edge"
    sides: { f: number; s: number; r: number }; // default inset multipliers, 0–1.5
  };
  signature: /* …existing */ | "wrap" | "slant" | "round" | "edge" | "facet";
}
interface Build { /* … */ sides?: Partial<Record<string, { f: number; s: number; r: number }>> }
```

- One edge profile swept round the plan. `insetAt(z, m)` gives how far the skin sits in from the outline at height z; the bottom zone (height `hB`, run `dB`) and top zone (`hT`, `dT`) each follow their kind. `curve` is convex and meets the flat bottom tangentially (Teardrop).
- `bot.h = "edge"` means `hB = Z − max(edge.min, edge.k × Z)`: the visible edge band `e` follows the thickness and never drops below `edge.min`. The body reads thin all round while full thickness sits a few cm in.
- Each side's insets scale by its multiplier. The player sets front, sides and rear on Teardrop, Ultra, Knife, Facet and Aero.

Space inside:

- Floor room at each end follows `outerAt(yy, m)`; the middle is the full box.
- The side inset at half height adds to the inner-box side offset (the width cost). Sides at 0 give it back.
- Ports need a vertical band of wall: `Z − hB − hT ≥ port + 0.6`. On tapered bodies the edge band, not the parts, usually sets the minimum thickness.
- Facet's cut corners count as a radius of 0.7 × facet in `cornerOffset`.

`shellGeometry`: the existing ring model with a per-side, per-height inset. Each ring is the plan outline offset by `insetAt(z)` on each side (`roundRect4`). Facet cuts the corners flat instead of arcing them. The lid follows the same plan outline.

## Chassis stage

- **Taper by side.** On the per-side bodies, three compact sliders (Front, Sides, Rear, 0–1.5) sit under the signature slider and show the resolved run in mm. Hovering or dragging them switches to the section view, like the signature slider.
- **Thickness reads `e–Z`** on perimeter bodies (edge band to full thickness).
- **Tray scrolls.** Up to 12 bodies per year: the tray scrolls horizontally (wheel maps to horizontal), fades at the right edge, and keeps the picked card in view.
