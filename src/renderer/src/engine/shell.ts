import type { BodyStyle, ResolvedStyle, Scaled, Size, Vec3 } from "./types";

// The shell is built outward from the inner box: walls first, then the body's
// corner radius and edge profile, which only ever add material outside. Some
// bodies also shape the section along the depth (a taper, a rear spine, a
// raised shelf, a lift chamfer), which changes the room inside at each depth.
// This file holds both directions of that geometry:
//   - offsets and floorBand: where the inner room lies (construction)
//   - inside*: whether a point lies in the walled, styled shell (verification)
// They are written independently so the headless check can hold one to the other.
//
// resolveStyle is the only reader of a body's Scaled rules: everything
// downstream works in millimetres.

const SQRT2 = Math.SQRT2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function scaled(v: Scaled | undefined, size: Size, t: number): number {
  if (v === undefined) return 0;
  if (typeof v === "number") return v;
  const k = Array.isArray(v.k) ? lerp(v.k[0], v.k[1], t) : v.k;
  const ref = v.of === "short" ? Math.min(size.x, size.y) : size[v.of];
  return clamp(k * ref, v.min, v.max);
}

/**
 * Every shape parameter in mm at this size, with the signature slider at `sig`
 * (0 to 1). `lidZ` caps the shelf's rise. The cross-limits keep the shell valid
 * everywhere in the size range.
 */
export function resolveStyle(style: BodyStyle, size: Size, sig = 0.5, lidZ = Infinity): ResolvedStyle {
  const t = clamp(sig, 0, 1);
  const v = (p: Scaled | undefined) => scaled(p, size, t);
  const Z = size.z;
  const taper = style.taper
    ? { front: lerp(style.taper.front[0], style.taper.front[1], t), minFront: style.taper.minFront, run: style.taper.run }
    : null;
  const r: ResolvedStyle = {
    edge: style.edge,
    hinge: style.hinge,
    latch: style.latch,
    signature: style.signature,
    sig: t,
    sigMm: 0,
    corner: Math.min(v(style.corner), Math.min(size.x, size.y) / 4),
    profile: 0,
    taper,
    ui: style.undercut ? v(style.undercut.inset) : 0,
    uh: style.undercut ? Math.min(v(style.undercut.height), Z * 0.5) : 0,
    drop: 0,
    D: 0,
    Sd: style.shelf ? v(style.shelf.depth) : 0,
    R: style.shelf ? Math.min(v(style.shelf.rise), lidZ) : 0,
    lip: style.lift ? Math.min(v(style.lift.lip), Z * 0.6) : 0,
    bevel: null,
    bumper: style.bumper ? Math.min(v(style.bumper), Z * 0.6) : 0,
    q: 0,
    wallScale: style.wallScale ?? 1,
    crown: v(style.crown),
  };
  r.q = r.bumper / 4;
  if (style.spine) {
    r.drop = Math.max(0, Math.min(v(style.spine.drop), size.y * 0.3 - Z));
    r.D = Z + r.drop;
  }
  const front = Z - taperDepth(r, Z);
  r.profile = style.edge === "square" ? 0 : Math.max(0, Math.min(v(style.profile), (front - 2 * r.q) / 2 - 0.3));
  r.sigMm = {
    corner: r.corner,
    profile: r.profile,
    drop: r.drop,
    bumper: r.bumper,
    taper: taperDepth(r, Z),
    undercut: r.ui,
    shelf: r.Sd,
    lip: r.lip,
  }[r.signature];
  return r;
}

/** How much thinner the front is than the rear at thickness Z. */
export function taperDepth(style: ResolvedStyle, Z: number): number {
  const tp = style.taper;
  if (!tp) return 0;
  return Z - Math.min(Z, Math.max(tp.minFront, tp.front * Z));
}

/** Rise of the outer bottom at depth y, from the taper. */
function taperRise(style: ResolvedStyle, outer: Size, y: number): number {
  const T = taperDepth(style, outer.z);
  if (T <= 0 || !style.taper) return 0;
  const u = clamp(y / (style.taper.run * outer.y), 0, 1);
  return T * (1 - u * u * (3 - 2 * u));
}

/** Rise of the outer bottom at depth y over the rear bevel. */
function bevelRise(bevel: { rise: number; run: number }, Y: number, y: number): number {
  return (bevel.rise * clamp(y - (Y - bevel.run), 0, bevel.run)) / bevel.run;
}

/** Where the lift chamfer starts, from the rear. */
export const LIFT_RUN = 1.1;
/** How far the shelf's ramp runs, as a share of its rise. */
const SHELF_RAMP = 0.8;

/**
 * Outer bottom and top of the base at depth y on its centre line, before the
 * edge profile: the flat box [q, Z - q] reshaped by the taper, spine, shelf and
 * lift chamfer. Null behind the spine.
 */
export function outerSection(style: ResolvedStyle, outer: Size, y: number): [number, number] | null {
  const { y: Y, z: Z } = outer;
  let lo = style.q + taperRise(style, outer, y);
  let hi = Z - style.q;
  if (style.Sd > 0 && style.R > 0) hi += style.R * clamp((y - (Y - style.Sd)) / (SHELF_RAMP * style.R), 0, 1);
  if (style.lip > 0) lo = Math.max(lo, (y - (Y - LIFT_RUN * style.lip)) / LIFT_RUN);
  if (style.bevel) lo = Math.max(lo, style.q + bevelRise(style.bevel, Y, y));
  if (style.D > 0) {
    const Rc = style.D / 2;
    const cy = Y - Rc;
    const cz = Z - Rc;
    if (y >= cy) {
      const h = Math.sqrt(Math.max(0, Rc * Rc - (y - cy) ** 2));
      lo = cz - h;
      hi = cz + h;
    } else if (cy - y < Rc) lo = Math.min(lo, cz - Math.sqrt(Rc * Rc - (cy - y) ** 2));
  }
  return hi >= lo ? [lo, hi] : null;
}

/** Smallest inward distance from the footprint outline so a point at height h keeps the wall clear of the profile. */
function profileNeed(style: ResolvedStyle, w: number, h: number): number {
  const p = style.profile;
  if (p <= 0) return w;
  if (style.edge === "chamfer") return Math.max(w, p + w * SQRT2 - h);
  if (h >= p || w >= p) return w;
  const rhs = (p - w) ** 2 - (p - h) ** 2;
  if (rhs < 0) return p;
  return Math.max(w, p - Math.sqrt(rhs));
}

/** Side offset that keeps an inner box corner at inward distance `need` inside a rounded footprint corner. */
function cornerOffset(r: number, need: number): number {
  if (r <= 0 || need >= r) return need;
  return r - (r - need) / SQRT2;
}

/** Plan size of a corner bumper block. */
export function bumperBlock(style: ResolvedStyle): number {
  return style.bumper * 2.2;
}

export interface Offsets {
  side: number;
  bottom: number;
  top: number;
}

/** Walls as built: the era's times the body's wall scale. */
export function scaleWalls<W extends Record<string, number>>(style: ResolvedStyle, walls: W): W {
  const out = { ...walls };
  for (const k of Object.keys(out) as (keyof W)[]) out[k] = (out[k] * style.wallScale) as W[keyof W];
  return out;
}

export function baseOffsets(
  style: ResolvedStyle,
  walls: { bottom: number; top: number; side: number },
): Offsets {
  // Each edge profile carries the wall of its horizontal face, so the wall
  // thickness is continuous where the profile meets the flat top or bottom.
  const need = Math.max(
    walls.side,
    profileNeed(style, walls.bottom, walls.bottom),
    profileNeed(style, walls.top, walls.top),
  );
  // Corner bumpers are bolted in through the corners; an undercut takes its inset all round.
  return {
    side: cornerOffset(Math.max(style.corner, bumperBlock(style)), need) + style.ui,
    bottom: walls.bottom + style.q,
    top: walls.top + style.q,
  };
}

/** How far in from the rear outer face the floor's plan ends: the spine rounds the rear off. */
export function rearInset(style: ResolvedStyle, off: Offsets, wall: number): number {
  if (style.D <= 0) return off.side;
  const Rc = style.D / 2;
  return Math.max(off.side, Rc - 0.5 * (Rc - wall));
}

/**
 * Room inside the base at depth y: [inner bottom, inner top], or null outside
 * the inner plan. The inner top is under the top wall (the deck layer is the
 * solver's to add). `wall` is the bottom wall.
 */
export function floorBand(
  style: ResolvedStyle,
  outer: Size,
  off: Offsets,
  wall: number,
  y: number,
): [number, number] | null {
  const { y: Y, z: Z } = outer;
  if (y < off.side - 1e-9 || y > Y - rearInset(style, off, wall) + 1e-9) return null;
  let lo = off.bottom + taperRise(style, outer, y);
  let hi = Z - off.top;
  if (style.Sd > 0 && style.R > 0) hi += style.R * clamp((y - (Y - style.Sd)) / (SHELF_RAMP * style.R), 0, 1);
  if (style.lip > 0) lo = Math.max(lo, (y - (Y - LIFT_RUN * style.lip)) / LIFT_RUN + wall * SQRT2);
  if (style.bevel) {
    // The inner face runs parallel to the bevel, a wall's thickness in.
    const { rise, run } = style.bevel;
    lo = Math.max(lo, off.bottom + (rise * (y - (Y - run))) / run + wall * (Math.hypot(rise, run) / run - 1));
  }
  if (style.D > 0) {
    const Rc = style.D / 2;
    const ri = Rc - wall;
    const cy = Y - Rc;
    const cz = Z - Rc;
    if (y > cy) {
      const h = Math.sqrt(Math.max(0, ri * ri - (y - cy) ** 2));
      lo = cz - h;
      hi = Math.min(hi, cz + h);
    } else if (cy - y < ri) lo = Math.min(lo, cz - Math.sqrt(ri * ri - (cy - y) ** 2));
  }
  return hi > lo ? [lo, hi] : null;
}

/** The floor room over a depth span: the highest bottom and the lowest top in it. Null where any of it has none. */
export function spanBand(
  style: ResolvedStyle,
  outer: Size,
  off: Offsets,
  wall: number,
  y0: number,
  y1: number,
): [number, number] | null {
  let lo = -Infinity;
  let hi = Infinity;
  // Kept inside the inner plan, which the shape may have moved a little from where the parts were laid out.
  const a = off.side;
  const z = outer.y - rearInset(style, off, wall);
  const n = Math.min(12, Math.max(2, Math.ceil((y1 - y0) / 4)));
  for (let i = 0; i <= n; i++) {
    const y = Math.min(z, Math.max(a, y0 + ((y1 - y0) * i) / n));
    const b = floorBand(style, outer, off, wall, y);
    if (!b) return null;
    lo = Math.max(lo, b[0]);
    hi = Math.min(hi, b[1]);
  }
  return [lo, hi];
}

/**
 * The lid's hinge axis in base space (y, z). The closed lid lies wholly in
 * front of the axis and above it (at or above the level of its bottom face
 * less nothing), and the base wholly in front of it or inside its own round,
 * so the lid, turning about it, never enters the base up to fully flat:
 *   full, barrel: the rear top edge.
 *   drop: behind the rear face, a little below the top: the lid's edge drops as it opens.
 *   lift: the same, lower: the lid's edge swings well down behind the rear.
 *   inset: forward of the shelf, raised half the lid and the shelf's rise, so the
 *          open lid clears the shelf and lies flat on it.
 *   spine: the spine's axis: the lid rides round it.
 */
export function hingeAxis(style: ResolvedStyle, outer: Size, lidZ: number): { y: number; z: number } {
  const { y: Y, z: Z } = outer;
  switch (style.hinge) {
    case "drop":
      return { y: Y, z: Z - 0.35 * lidZ };
    case "lift":
      return { y: Y, z: Z - 0.5 * style.lip };
    case "inset":
      return { y: Y - style.Sd, z: Z + (lidZ + style.R) / 2 };
    case "spine":
      return { y: Y - style.D / 2, z: Z - style.D / 2 };
    default:
      return { y: Y, z: Z };
  }
}

/** Where the lid ends, from the front: at the axis when it is inset, else the rear. */
export function lidDepth(style: ResolvedStyle, outer: Size, lidZ: number): number {
  return Math.min(outer.y, hingeAxis(style, outer, lidZ).y);
}

/** How much of the depth at the rear the deck gives up: to the spine, or to the shelf and the hinge barrel in front of it. */
export function deckLoss(style: ResolvedStyle, lidZ: number): number {
  if (style.hinge === "spine") return style.D / 2;
  if (style.hinge === "inset") return style.Sd + (lidZ + style.R) / 2;
  return 0;
}

/** The lid is a flat slab: plan corners only, no edge profile. */
export function lidSideOffset(style: ResolvedStyle, wall: number): number {
  return cornerOffset(style.corner, wall);
}

/** Openings keep clear of the rounded plan corners, and the bumpers, by this much at each end of a strip. */
export function cornerKeepOut(style: ResolvedStyle, side: number): number {
  return Math.max(0, Math.max(style.corner, bumperBlock(style)) - side);
}

/** Openings sit above the bottom edge profile and any undercut. */
export function profileLift(style: ResolvedStyle, bottom: number): number {
  return Math.max(0, style.q + Math.max(style.profile, style.uh) - bottom);
}

/** Top of any opening stays this far below the top of the base, clear of the top edge profile. */
export function profileTop(style: ResolvedStyle): number {
  return style.profile + style.q;
}

// ------------------------------------------------------------ verification

/** Inward distance from the outline of a rounded-rectangle footprint. Negative outside. */
export function planDistance(
  x: number,
  y: number,
  X: number,
  Y: number,
  r: number,
): number {
  const straight = Math.min(x, X - x, y, Y - y);
  if (r <= 0) return straight;
  const cx = x < r ? r : x > X - r ? X - r : x;
  const cy = y < r ? r : y > Y - r ? Y - r : y;
  if (cx === x || cy === y) return straight;
  return r - Math.hypot(x - cx, y - cy);
}

function profileOk(
  style: ResolvedStyle,
  d: number,
  h: number,
  w: number,
  eps: number,
): boolean {
  const p = style.profile;
  if (p <= 0) return true;
  if (style.edge === "chamfer") return d + h >= p + w * SQRT2 - eps;
  if (d >= p || h >= p || w >= p) return true;
  return Math.hypot(p - d, p - h) <= p - w + eps;
}

/** Is this point inside the base shell's inner solid (outer styled solid less its walls)? */
export function insideBase(
  pt: Vec3,
  outer: Size,
  style: ResolvedStyle,
  walls: { bottom: number; top: number; side: number },
  eps = 1e-6,
): boolean {
  const d = planDistance(pt.x, pt.y, outer.x, outer.y, style.corner);
  if (d < walls.side + style.ui - eps) return false;
  const sec = outerSection(style, outer, pt.y);
  if (!sec) return false;
  const hb = pt.z - sec[0];
  const ht = sec[1] - pt.z;
  if (hb < walls.bottom - eps || ht < walls.top - eps) return false;
  return (
    profileOk(style, d - style.ui, hb, walls.bottom, eps) &&
    profileOk(style, d, ht, walls.top, eps)
  );
}

/**
 * Is this point inside the lid's inner solid? The lid spans z0 (its front face
 * when closed) to z0 + lidZ. `front` is 0 when cover glass forms the front face.
 */
export function insideLid(
  pt: Vec3,
  outer: Size,
  z0: number,
  lidZ: number,
  style: ResolvedStyle,
  wall: number,
  front = wall,
  eps = 1e-6,
): boolean {
  const d = planDistance(pt.x, pt.y, outer.x, outer.y, style.corner);
  if (d < wall - eps) return false;
  return pt.z >= z0 + front - eps && pt.z <= z0 + lidZ - wall + eps;
}

/** Flat part of an outer face, where openings may go: [u range, z range]. */
export function flatFace(
  side: "left" | "right" | "rear" | "front",
  outer: Size,
  style: ResolvedStyle,
): { u: [number, number]; z: [number, number] } {
  const p = style.profile;
  const len = side === "left" || side === "right" ? outer.y : outer.x;
  const c = Math.max(style.corner, bumperBlock(style));
  return { u: [c, len - c], z: [style.q + Math.max(p, style.uh), outer.z - style.q - p] };
}
