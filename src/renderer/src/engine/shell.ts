import type { BodyStyle, Size, Vec3 } from "./types";

// The shell is built outward from the inner box: walls first, then the body's
// cosmetic corner radius and edge profile, which only ever add material
// outside. This file holds both directions of that geometry:
//   - offsets: how far the inner box sits in from the outer faces (construction)
//   - inside*: whether a point lies in the walled, styled shell (verification)
// They are written independently so the headless check can hold one to the other.

const SQRT2 = Math.SQRT2;

function profileSize(style: BodyStyle): number {
  return style.edge === "square" ? 0 : style.profile;
}

/** Smallest inward distance from the footprint outline so a point at height h keeps the wall clear of the profile. */
function profileNeed(style: BodyStyle, w: number, h: number): number {
  const p = profileSize(style);
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

export interface Offsets {
  side: number;
  bottom: number;
  top: number;
}

export function baseOffsets(
  style: BodyStyle,
  walls: { bottom: number; top: number; side: number },
): Offsets {
  // Each edge profile carries the wall of its horizontal face, so the wall
  // thickness is continuous where the profile meets the flat top or bottom.
  const need = Math.max(
    walls.side,
    profileNeed(style, walls.bottom, walls.bottom),
    profileNeed(style, walls.top, walls.top),
  );
  return {
    side: cornerOffset(style.corner, need),
    bottom: walls.bottom,
    top: walls.top,
  };
}

/** The lid is a flat slab: plan corners only, no edge profile. */
export function lidSideOffset(style: BodyStyle, wall: number): number {
  return cornerOffset(style.corner, wall);
}

/** Openings keep clear of the rounded plan corners by this much at each end of a strip. */
export function cornerKeepOut(style: BodyStyle, side: number): number {
  return Math.max(0, style.corner - side);
}

/** Openings sit above the bottom edge profile. */
export function profileLift(style: BodyStyle, bottom: number): number {
  return Math.max(0, profileSize(style) - bottom);
}

/** Top of any opening stays this far below the top of the base, clear of the top edge profile. */
export function profileTop(style: BodyStyle): number {
  return profileSize(style);
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
  style: BodyStyle,
  d: number,
  h: number,
  w: number,
  eps: number,
): boolean {
  const p = profileSize(style);
  if (p <= 0) return true;
  if (style.edge === "chamfer") return d + h >= p + w * SQRT2 - eps;
  if (d >= p || h >= p || w >= p) return true;
  return Math.hypot(p - d, p - h) <= p - w + eps;
}

/** Is this point inside the base shell's inner solid (outer styled solid less its walls)? */
export function insideBase(
  pt: Vec3,
  outer: Size,
  style: BodyStyle,
  walls: { bottom: number; top: number; side: number },
  eps = 1e-6,
): boolean {
  const d = planDistance(pt.x, pt.y, outer.x, outer.y, style.corner);
  if (d < walls.side - eps) return false;
  const hb = pt.z;
  const ht = outer.z - pt.z;
  if (hb < walls.bottom - eps || ht < walls.top - eps) return false;
  return (
    profileOk(style, d, hb, walls.bottom, eps) &&
    profileOk(style, d, ht, walls.top, eps)
  );
}

/** Is this point inside the lid's inner solid? The lid spans z0 to z0 + lidZ. */
export function insideLid(
  pt: Vec3,
  outer: Size,
  z0: number,
  lidZ: number,
  style: BodyStyle,
  wall: number,
  eps = 1e-6,
): boolean {
  const d = planDistance(pt.x, pt.y, outer.x, outer.y, style.corner);
  if (d < wall - eps) return false;
  return pt.z >= z0 + wall - eps && pt.z <= z0 + lidZ - wall + eps;
}

/** Flat part of an outer face, where openings may go: [u range, z range]. */
export function flatFace(
  side: "left" | "right" | "rear" | "front",
  outer: Size,
  style: BodyStyle,
): { u: [number, number]; z: [number, number] } {
  const p = profileSize(style);
  const len = side === "left" || side === "right" ? outer.y : outer.x;
  return { u: [style.corner, len - style.corner], z: [p, outer.z - p] };
}
