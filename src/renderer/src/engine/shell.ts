import type { BodyStyle, EdgeKind, PerimSides, ResolvedPerim, ResolvedStyle, Scaled, Side, Size, Vec3 } from "./types";

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

/** A side multiplier the player may set, in range. */
export const SIDE_RANGE: [number, number] = [0, 1.5];

/** The body's own side multipliers with the player's over them, each in range. */
export function perimSides(own: PerimSides, player?: Partial<PerimSides>): PerimSides {
  const pick = (k: keyof PerimSides) => {
    const p = player?.[k];
    return typeof p === "number" && Number.isFinite(p) ? clamp(p, SIDE_RANGE[0], SIDE_RANGE[1]) : own[k];
  };
  return { f: pick("f"), s: pick("s"), r: pick("r") };
}

/**
 * Every shape parameter in mm at this size, with the signature slider at `sig`
 * (0 to 1). `lidZ` caps the shelf's rise; `sides` are the player's side
 * multipliers on a perimeter body. The cross-limits keep the shell valid
 * everywhere in the size range.
 */
export function resolveStyle(
  style: BodyStyle,
  size: Size,
  sig = 0.5,
  lidZ = Infinity,
  sides?: Partial<PerimSides>,
  curved = false,
): ResolvedStyle {
  const t = clamp(sig, 0, 1);
  const v = (p: Scaled | undefined) => scaled(p, size, t);
  const Z = size.z;
  const taper = style.taper
    ? {
        front: lerp(style.taper.front[0], style.taper.front[1], t),
        minFront: style.taper.minFront,
        run: style.taper.run,
        linear: !!style.taper.linear,
        curved: !!style.taper.curve && curved,
      }
    : null;
  let pm: ResolvedPerim | null = null;
  if (style.perim) {
    const pp = style.perim;
    const own = (d: Scaled | "h", h: number) => (d === "h" ? h : v(d));
    let hT = Math.min(v(pp.top.h), Z / 2);
    let hB: number;
    if (pp.bot.h === "edge") {
      const e = pp.edge ?? { k: 0.4, min: 4 };
      hB = Math.max(0, Z - Math.min(Z, Math.max(e.min, e.k * Z)));
    } else if (pp.bot.h === "full") hB = Z - hT;
    else hB = Math.min(v(pp.bot.h), Z - hT);
    hT = Math.max(0, Math.min(hT, Z - hB));
    const m = perimSides(pp.sides, sides);
    // The runs leave a flat face top and bottom however far the player sets the sides.
    const run = (d: number) =>
      Math.min(d, (0.8 * size.y) / Math.max(1e-6, m.f + m.r), (0.8 * size.x) / Math.max(1e-6, 2 * m.s));
    pm = {
      tk: pp.top.kind,
      hT,
      dT: run(own(pp.top.d, hT)),
      bk: pp.bot.kind,
      hB,
      dB: run(own(pp.bot.d, hB)),
      m,
      tune: !!pp.tune,
    };
  }
  const r: ResolvedStyle = {
    edge: style.edge,
    cornerKind: style.cornerKind ?? "round",
    hinge: style.hinge,
    latch: style.latch,
    signature: style.signature,
    sig: t,
    sigMm: 0,
    corner: Math.min(v(style.corner), Math.min(size.x, size.y) / 4),
    profile: 0,
    taper,
    pm,
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
    slant: pm?.dB ?? 0,
    round: pm?.dB ?? 0,
    wrap: pm?.dB ?? 0,
    edge: pm?.dB ?? 0,
    facet: r.corner,
  }[r.signature];
  return r;
}

/** How much thinner the front is than the rear at thickness Z. */
export function taperDepth(style: ResolvedStyle, Z: number): number {
  const tp = style.taper;
  if (!tp) return 0;
  return Z - Math.min(Z, Math.max(tp.minFront, tp.front * Z));
}

/** Share of the taper's rise still to come at a share u of its run from the front. */
export function taperLeft(tp: NonNullable<ResolvedStyle["taper"]>, u: number): number {
  const a = clamp(u, 0, 1);
  if (tp.curved) return 1 - Math.sqrt(Math.max(0, 1 - (1 - a) ** 2));
  return 1 - (tp.linear ? a : a * a * (3 - 2 * a));
}

/** Rise of the outer bottom at depth y, from the taper. */
function taperRise(style: ResolvedStyle, outer: Size, y: number): number {
  const T = taperDepth(style, outer.z);
  if (T <= 0 || !style.taper) return 0;
  return T * taperLeft(style.taper, y / (style.taper.run * outer.y));
}

// ------------------------------------------------------------ perimeter profile
// A perimeter body sweeps one edge profile round its plan: at each height the
// outer skin is the plan outline inset on each side by that side's profile.
// Rings of the outline stacked in z build the surface (shellGeometry), and the
// same rings decide what lies inside: the room over a point of the floor is
// the height span over which the point stays a wall inside every ring.

const G: Record<EdgeKind, (u: number) => number> = {
  linear: (u) => u,
  chamfer: (u) => u,
  round: (u) => 1 - Math.sqrt(Math.max(0, 1 - u * u)),
  curve: (u) => 1 - Math.sqrt(Math.max(0, 1 - u)),
};

/** The inverse of G: how far up a zone its skin is in by a share v of the run. */
const GI: Record<EdgeKind, (v: number) => number> = {
  linear: (v) => v,
  chamfer: (v) => v,
  round: (v) => Math.sqrt(Math.max(0, 1 - (1 - v) ** 2)),
  curve: (v) => 1 - (1 - v) ** 2,
};

/**
 * Heights for the rings of a perimeter body: each side's zone ends, and steps
 * through each zone even in height and even in run, so every kind of edge
 * reads smooth.
 */
export function perimLevels(pm: ResolvedPerim, Z: number): number[] {
  const set = new Set<number>([0, Z]);
  const n = 12;
  for (const m of [pm.m.f, pm.m.s, pm.m.r]) {
    const s = perimZones(pm, m);
    for (let i = 0; i <= n; i++) {
      const a = i / n;
      if (s.hB > 0 && s.dB > 0) set.add(s.hB * (1 - GI[pm.bk](a))).add(s.hB * a);
      if (s.hT > 0 && s.dT > 0) set.add(Z - s.hT + s.hT * GI[pm.tk](a)).add(Z - s.hT + s.hT * a);
    }
    set.add(s.hB).add(Z - s.hT);
  }
  return [...new Set([...set].map((z) => Math.round(Math.min(Z, Math.max(0, z)) * 1000) / 1000))].sort((a, b) => a - b);
}

/** One side's zones: the multiplier scales each run, and each height up to 1. */
export function perimZones(pm: ResolvedPerim, m: number): { hB: number; dB: number; hT: number; dT: number } {
  const k = clamp(m, 0, 1);
  const d = Math.max(0, m);
  return { hB: pm.hB * k, dB: pm.dB * d, hT: pm.hT * k, dT: pm.dT * d };
}

/** How far the outer skin sits in from the plan outline at height z, on a side with multiplier m. */
export function perimInset(pm: ResolvedPerim, Z: number, z: number, m: number): number {
  const s = perimZones(pm, m);
  let d = 0;
  if (s.hB > 0 && z < s.hB) d = s.dB * G[pm.bk](clamp((s.hB - z) / s.hB, 0, 1));
  if (s.hT > 0 && z > Z - s.hT) d = Math.max(d, s.dT * G[pm.tk](clamp((z - Z + s.hT) / s.hT, 0, 1)));
  return d;
}

/** Insets of the plan outline at height z: left, right, front and rear (b). */
export interface Insets {
  l: number;
  r: number;
  f: number;
  b: number;
}

export function perimInsets(pm: ResolvedPerim, Z: number, z: number): Insets {
  const s = perimInset(pm, Z, z, pm.m.s);
  return { l: s, r: s, f: perimInset(pm, Z, z, pm.m.f), b: perimInset(pm, Z, z, pm.m.r) };
}

/** The multiplier on one outer side. */
export function sideMult(pm: ResolvedPerim, side: Side): number {
  return side === "front" ? pm.m.f : side === "rear" ? pm.m.r : pm.m.s;
}

/** Heights between which every side's wall is vertical: over all sides, the highest bottom zone and the lowest top. */
export function perimBand(pm: ResolvedPerim, Z: number): [number, number] {
  const ms = [pm.m.f, pm.m.s, pm.m.r];
  const lo = Math.max(...ms.map((m) => perimZones(pm, m).hB));
  const hi = Math.min(...ms.map((m) => Z - perimZones(pm, m).hT));
  return [lo, Math.max(lo, hi)];
}

/** Radius (or chamfer leg) of one plan corner between sides inset by a and b. */
export function ringCorner(rc: number, a: number, b: number, X: number, Y: number, I: Insets): number {
  return Math.max(0, Math.min(rc - Math.min(a, b), (X - I.l - I.r) / 2, (Y - I.f - I.b) / 2));
}

/**
 * Whether (x, y) lies inside the plan outline inset by `I`, and at least `w`
 * in from it. Corners are rounded, or cut flat when `chamfer`, by the plan
 * corner less the smaller inset either side of them.
 */
export function inRing(
  x: number,
  y: number,
  X: number,
  Y: number,
  rc: number,
  chamfer: boolean,
  I: Insets,
  w: number,
  eps = 0,
): boolean {
  if (x < I.l + w - eps || x > X - I.r - w + eps || y < I.f + w - eps || y > Y - I.b - w + eps) return false;
  const corner = (px: number, py: number, rr: number) => {
    if (rr <= 0) return true;
    if (chamfer) return px + py >= rr + w * SQRT2 - eps;
    if (px >= rr || py >= rr) return true;
    return Math.hypot(rr - px, rr - py) <= rr - w + eps;
  };
  const left = x - I.l;
  const right = X - I.r - x;
  const front = y - I.f;
  const rear = Y - I.b - y;
  return (
    corner(left, front, ringCorner(rc, I.l, I.f, X, Y, I)) &&
    corner(right, front, ringCorner(rc, I.r, I.f, X, Y, I)) &&
    corner(left, rear, ringCorner(rc, I.l, I.b, X, Y, I)) &&
    corner(right, rear, ringCorner(rc, I.r, I.b, X, Y, I))
  );
}

/** Bisection steps for a height on a perimeter body: under 0.01 mm over the thickest body. */
const PERIM_STEPS = 13;

/** Each side's zones and the vertical band of a perimeter body, per resolved body and thickness. */
interface PerimCache {
  Z: number;
  s: { hB: number; dB: number; hT: number; dT: number };
  f: { hB: number; dB: number; hT: number; dT: number };
  r: { hB: number; dB: number; hT: number; dT: number };
  band: [number, number];
}
const perimCache = new WeakMap<ResolvedPerim, PerimCache>();
function perimCached(pm: ResolvedPerim, Z: number): PerimCache {
  let c = perimCache.get(pm);
  if (!c || c.Z !== Z) {
    c = { Z, s: perimZones(pm, pm.m.s), f: perimZones(pm, pm.m.f), r: perimZones(pm, pm.m.r), band: perimBand(pm, Z) };
    perimCache.set(pm, c);
  }
  return c;
}

/**
 * Lowest and highest heights at which (x, y) stays inside the skin, `w` in
 * from it in plan, or null where it never does. Rings widen up through the
 * bottom zone and narrow up through the top one. Off the plan corners each
 * side's inset alone bounds the span, and its edge profile inverts exactly
 * (GI); where a corner bounds it instead, each end is a bisection.
 */
export function perimSpan(
  style: ResolvedStyle,
  outer: Size,
  x: number,
  y: number,
  w: number,
): [number, number] | null {
  const pm = style.pm;
  const Z = outer.z;
  if (!pm) return [0, Z];
  const pc = perimCached(pm, Z);
  const g = G[pm.bk];
  const gt = G[pm.tk];
  const ins = (s: PerimCache["s"], z: number) => {
    let d = 0;
    if (s.hB > 0 && z < s.hB) d = s.dB * g(clamp((s.hB - z) / s.hB, 0, 1));
    if (s.hT > 0 && z > Z - s.hT) d = Math.max(d, s.dT * gt(clamp((z - Z + s.hT) / s.hT, 0, 1)));
    return d;
  };
  const I: Insets = { l: 0, r: 0, f: 0, b: 0 };
  const chamfer = style.cornerKind === "chamfer";
  const inside = (z: number, eps = 0) => {
    const sd = ins(pc.s, z);
    I.l = sd;
    I.r = sd;
    I.f = ins(pc.f, z);
    I.b = ins(pc.r, z);
    return inRing(x, y, outer.x, outer.y, style.corner, chamfer, I, w, eps);
  };
  const [m0, m1] = pc.band;
  if (!inside(m0)) return null;
  let a0 = 0;
  let b0 = Z;
  const bound = (d: number, s: PerimCache["s"]) => {
    if (s.hB > 0 && s.dB > d) a0 = Math.max(a0, s.hB * (1 - GI[pm.bk](Math.max(0, d) / s.dB)));
    if (s.hT > 0 && s.dT > d) b0 = Math.min(b0, Z - s.hT + s.hT * GI[pm.tk](Math.max(0, d) / s.dT));
  };
  bound(x - w, pc.s);
  bound(outer.x - x - w, pc.s);
  bound(y - w, pc.f);
  bound(outer.y - y - w, pc.r);
  let lo = 0;
  if (a0 <= m0 && inside(a0, 1e-9)) lo = a0;
  else if (!inside(0)) {
    let a = a0 <= m0 ? a0 : 0;
    let b = m0;
    for (let i = 0; i < PERIM_STEPS; i++) {
      const c = (a + b) / 2;
      if (inside(c)) b = c;
      else a = c;
    }
    lo = b;
  }
  let hi = Z;
  if (b0 >= m1 && inside(b0, 1e-9)) hi = b0;
  else if (!inside(Z)) {
    let a = m1;
    let b = b0 >= m1 ? b0 : Z;
    for (let i = 0; i < PERIM_STEPS; i++) {
      const c = (a + b) / 2;
      if (inside(c)) a = c;
      else b = c;
    }
    hi = a;
  }
  return [lo, hi];
}

/** Outer bottom and top of the base over a plan point: the section, and on a perimeter body its edge profile too (the flat band where the skin never covers the point). */
export function outerSpanAt(style: ResolvedStyle, outer: Size, x: number, y: number): [number, number] {
  if (!style.pm) return outerSection(style, outer, y) ?? [0, outer.z];
  return perimSpan(style, outer, x, y, 0) ?? perimBand(style.pm, outer.z);
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

/** Side offset that keeps an inner box corner at inward distance `need` inside a rounded footprint corner, or a cut one of leg r. */
function cornerOffset(r: number, need: number, chamfer = false): number {
  if (chamfer) return Math.max(need, (r + need * SQRT2) / 2);
  if (r <= 0 || need >= r) return need;
  return r - (r - need) / SQRT2;
}

/** How far up its bottom zone a perimeter body's inner box starts: the floor rises over the rest of the edge profile. */
const PERIM_FLOOR = 0.5;

/**
 * Side offset on a perimeter body. The inner box's corners stay a side wall
 * inside the top face, so the deck parts flush with it and the floor parts
 * under the top wall keep inside the top edge profile on every side. The
 * bottom edge profile is shared: the box starts where the skin is halfway up
 * each side's bottom zone, and over the rest the floor rises (floorBand), so
 * a long bevel costs some plan and some thickness.
 */
function perimOffset(style: ResolvedStyle, pm: ResolvedPerim, walls: { bottom: number; side: number }): number {
  const w = walls.side;
  const floor = Math.max(
    0,
    ...[pm.m.f, pm.m.s, pm.m.r].map((m) => {
      const hb = perimZones(pm, m).hB;
      return hb > walls.bottom ? perimInset(pm, Infinity, walls.bottom + PERIM_FLOOR * (hb - walls.bottom), m) : 0;
    }),
  );
  const s = perimZones(pm, pm.m.s).dT;
  const ends = [perimZones(pm, pm.m.f).dT, perimZones(pm, pm.m.r).dT];
  const ok = (v: number) =>
    ends.every((b) => {
      const rr = Math.max(0, style.corner - Math.min(s, b));
      const px = v - s;
      const py = v - b;
      if (px < w || py < w) return false;
      if (rr <= 0) return true;
      if (style.cornerKind === "chamfer") return px + py >= rr + w * SQRT2;
      return px >= rr || py >= rr || Math.hypot(rr - px, rr - py) <= rr - w;
    });
  let lo = w + floor;
  if (ok(lo)) return lo;
  let hi = w + Math.max(s, ...ends) + style.corner + 1;
  for (let i = 0; i < 20; i++) {
    const c = (lo + hi) / 2;
    if (ok(c)) hi = c;
    else lo = c;
  }
  return hi;
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
  if (style.pm) return { side: perimOffset(style, style.pm, walls), bottom: walls.bottom, top: walls.top };
  // Each edge profile carries the wall of its horizontal face, so the wall
  // thickness is continuous where the profile meets the flat top or bottom.
  const need = Math.max(
    walls.side,
    profileNeed(style, walls.bottom, walls.bottom),
    profileNeed(style, walls.top, walls.top),
  );
  // Corner bumpers are bolted in through the corners; an undercut takes its inset all round.
  return {
    side: cornerOffset(Math.max(style.corner, bumperBlock(style)), need, style.cornerKind === "chamfer") + style.ui,
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
 * solver's to add). `wall` is the bottom wall. On a perimeter body the room
 * also changes across the width, so it is taken at `x` (the centre line when
 * absent): a wall inside the skin at every height, in plan and up and down.
 */
export function floorBand(
  style: ResolvedStyle,
  outer: Size,
  off: Offsets,
  wall: number,
  y: number,
  x = outer.x / 2,
): [number, number] | null {
  const { y: Y, z: Z } = outer;
  if (y < off.side - 1e-9 || y > Y - rearInset(style, off, wall) + 1e-9) return null;
  if (style.pm) {
    if (x < off.side - 1e-9 || x > outer.x - off.side + 1e-9) return null;
    const top = off.top - style.q;
    const ws = Math.max(wall, top);
    const inner = perimSpan(style, outer, x, y, ws);
    const skin = perimSpan(style, outer, x, y, 0);
    if (!inner || !skin) return null;
    const lo = Math.max(off.bottom, inner[0], skin[0] + wall);
    const hi = Math.min(Z - off.top, inner[1], skin[1] - top);
    return hi > lo ? [lo, hi] : null;
  }
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
      // The round's upper half is the top wall, as thick as the top wall.
      const rt = Rc - (off.top - style.q);
      lo = cz - h;
      hi = Math.min(hi, cz + Math.sqrt(Math.max(0, rt * rt - (y - cy) ** 2)));
    } else if (cy - y < ri) lo = Math.min(lo, cz - Math.sqrt(ri * ri - (cy - y) ** 2));
  }
  return hi > lo ? [lo, hi] : null;
}

/**
 * The floor room over a depth span: the highest bottom and the lowest top in
 * it. Null where any of it has none. On a perimeter body, over the footprint
 * x0 to x1 as well: every ring is convex, so the worst of the room over a
 * rectangle is at one of its corners.
 */
export function spanBand(
  style: ResolvedStyle,
  outer: Size,
  off: Offsets,
  wall: number,
  y0: number,
  y1: number,
  x0?: number,
  x1?: number,
): [number, number] | null {
  let lo = -Infinity;
  let hi = Infinity;
  // Kept inside the inner plan, which the shape may have moved a little from where the parts were laid out.
  const a = off.side;
  const z = outer.y - rearInset(style, off, wall);
  if (style.pm) {
    const xs = x0 === undefined || x1 === undefined ? [outer.x / 2] : [x0, x1];
    for (const xv of xs)
      for (const yv of [y0, y1]) {
        const x = Math.min(outer.x - off.side, Math.max(off.side, xv));
        const b = floorBand(style, outer, off, wall, Math.min(z, Math.max(a, yv)), x);
        if (!b) return null;
        lo = Math.max(lo, b[0]);
        hi = Math.min(hi, b[1]);
      }
    return [lo, hi];
  }
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
  return cornerOffset(style.corner, wall, style.cornerKind === "chamfer");
}

/** Openings keep clear of the rounded plan corners, and the bumpers, by this much at each end of a strip. */
export function cornerKeepOut(style: ResolvedStyle, side: number): number {
  return Math.max(0, Math.max(style.corner, bumperBlock(style)) - side);
}

/**
 * Lowest an opening may start on an outer face, over its run y0 to y1 on a
 * side face: above the face's own bottom (a taper, lift chamfer or bevel
 * raises it at the face, more than over the inner plan) and its bottom edge
 * profile. A spine's rear is its round, which takes openings anywhere on it;
 * a perimeter body's face is flat above its bottom zone.
 */
export function faceFloor(style: ResolvedStyle, outer: Size, side: Side, y0: number, y1: number): number {
  if (style.pm) return perimZones(style.pm, sideMult(style.pm, side)).hB;
  if (side === "rear" && style.D > 0) return -Infinity;
  const n = side === "left" || side === "right" ? 8 : 0;
  let lo = -Infinity;
  for (let i = 0; i <= n; i++) {
    const y = side === "rear" ? outer.y : side === "front" ? 0 : clamp(y0 + ((y1 - y0) * i) / Math.max(1, n), 0, outer.y);
    const sec = outerSection(style, outer, y);
    if (sec) lo = Math.max(lo, sec[0]);
  }
  return lo + Math.max(style.profile, style.uh);
}

/**
 * Openings sit above the bottom edge profile and any undercut. On a perimeter
 * body each side has its own: its wall is vertical only above its bottom zone.
 * Without a side, the highest of them.
 */
export function profileLift(style: ResolvedStyle, bottom: number, side?: Side): number {
  const pm = style.pm;
  if (pm) {
    const sides: Side[] = side ? [side] : ["front", "left", "rear"];
    return Math.max(0, Math.max(...sides.map((s) => perimZones(pm, sideMult(pm, s)).hB)) - bottom);
  }
  return Math.max(0, style.q + Math.max(style.profile, style.uh) - bottom);
}

/** Top of any opening stays this far below the top of the base, clear of the top edge profile (on a perimeter body, that side's). */
export function profileTop(style: ResolvedStyle, side?: Side): number {
  const pm = style.pm;
  if (pm) {
    const sides: Side[] = side ? [side] : ["front", "left", "rear"];
    return Math.max(...sides.map((s) => perimZones(pm, sideMult(pm, s)).hT));
  }
  return style.profile + style.q;
}

// ------------------------------------------------------------ verification

/** Inward distance from the outline of a rounded-rectangle footprint, or one with its corners cut by a leg of r. Negative outside. */
export function planDistance(
  x: number,
  y: number,
  X: number,
  Y: number,
  r: number,
  chamfer = false,
): number {
  const straight = Math.min(x, X - x, y, Y - y);
  if (r <= 0) return straight;
  if (chamfer) {
    const px = Math.min(x, X - x);
    const py = Math.min(y, Y - y);
    return Math.min(straight, (px + py - r) / SQRT2);
  }
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
  const pm = style.pm;
  if (pm) {
    // A side wall inside the ring at the point's height, and the skin still there a wall below and above it.
    const Z = outer.z;
    if (pt.z < walls.bottom - eps || pt.z > Z - walls.top + eps) return false;
    const ch = style.cornerKind === "chamfer";
    const at = (z: number, w: number) =>
      inRing(pt.x, pt.y, outer.x, outer.y, style.corner, ch, perimInsets(pm, Z, z), w, eps);
    return at(pt.z, walls.side) && at(pt.z - walls.bottom, 0) && at(pt.z + walls.top, 0);
  }
  const d = planDistance(pt.x, pt.y, outer.x, outer.y, style.corner, style.cornerKind === "chamfer");
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
  const d = planDistance(pt.x, pt.y, outer.x, outer.y, style.corner, style.cornerKind === "chamfer");
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
  if (style.pm) {
    const zs = perimZones(style.pm, sideMult(style.pm, side));
    return { u: [c, len - c], z: [zs.hB, outer.z - zs.hT] };
  }
  return { u: [c, len - c], z: [style.q + Math.max(p, style.uh), outer.z - style.q - p] };
}
