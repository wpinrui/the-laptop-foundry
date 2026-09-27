import { bumperBlock, outerSection, perimZones, sideMult } from "./shell";
import { profileRings } from "./shellGeometry";
import type {
  Build,
  GrillFit,
  GrillStyle,
  Opening,
  OptionValue,
  ResolvedStyle,
  Side,
  Size,
} from "./types";

// The fan grill: where the fans' air leaves the base. Stock keeps an open vent
// over each fin stack. None closes the wall, so the air finds its way out of
// the seams. Uniform runs one slotted grill along the whole vent wall, centred
// up it; Bottom does the same anchored to the bottom edge, and on the rear it
// may wrap under onto a bevel cut along the rear bottom edge, at an angle from
// the underside (90 is the rear face itself). The grill changes the fans'
// airflow a little, by how much open area it leaves in front of the fins.
// Stored on the cooling part's options; absent means Stock.

export const GRILL_STYLES: GrillStyle[] = [
  "stock",
  "none",
  "uniform",
  "bottom",
];
/** Least and default grill height, mm. */
export const GRILL_MIN = 2;
export const GRILL_DEFAULT = 6;
/** Wrap angle from the underside, degrees. */
export const WRAP_MIN = 20;
export const WRAP_MAX = 90;
export const WRAP_DEFAULT = 45;
/** Tallest grill a player may ask for, mm; the walls hold it lower. */
const GRILL_CAP = 60;
/** A bevel rises at most this share of the rear face. */
const BEVEL_SHARE = 0.45;
/** Grills keep this far inside the flat face, mm. */
const MARGIN = 0.4;
/** Grills keep this far from the ends of the flat face and from ports, mm. */
const END_GAP = 1.5;
const PORT_GAP = 2;
/** Grill area off the fin stacks counts this much toward the airflow. */
const OFF_FINS = 0.3;

export interface Grill {
  style: GrillStyle;
  height: number;
  wrap: boolean;
  angle: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The player's grill, defaults filled in. */
export function grillOf(build: Build): Grill {
  const o = build.parts.cooling?.[0]?.opts ?? {};
  const style = GRILL_STYLES.includes(o.grill as GrillStyle)
    ? (o.grill as GrillStyle)
    : "stock";
  const h =
    typeof o.grillH === "number" && Number.isFinite(o.grillH)
      ? clamp(o.grillH, GRILL_MIN, GRILL_CAP)
      : GRILL_DEFAULT;
  const a =
    typeof o.grillAngle === "number" && Number.isFinite(o.grillAngle)
      ? clamp(o.grillAngle, WRAP_MIN, WRAP_MAX)
      : WRAP_DEFAULT;
  return { style, height: h, wrap: o.grillWrap === "on", angle: a };
}

/** The build with its grill changed; defaults are left out of the options. */
export function withGrill(build: Build, patch: Partial<Grill>): Build {
  const list = [...(build.parts.cooling ?? [])];
  const bp = list[0];
  if (!bp) return build;
  const g = { ...grillOf(build), ...patch };
  const {
    grill: _s,
    grillH: _h,
    grillWrap: _w,
    grillAngle: _a,
    ...rest
  } = bp.opts ?? {};
  const opts: Record<string, OptionValue> = { ...rest };
  if (g.style !== "stock") opts.grill = g.style;
  if (g.height !== GRILL_DEFAULT) opts.grillH = Math.round(g.height * 10) / 10;
  if (g.wrap) opts.grillWrap = "on";
  if (g.angle !== WRAP_DEFAULT) opts.grillAngle = Math.round(g.angle);
  list[0] = Object.keys(opts).length > 0 ? { ...bp, opts } : { part: bp.part };
  return { ...build, parts: { ...build.parts, cooling: list } };
}

/** Whether a cooling option is a grill setting in range. */
export function grillOptionOk(key: string, value: OptionValue): boolean {
  if (key === "grill") return GRILL_STYLES.includes(value as GrillStyle);
  if (key === "grillWrap") return value === "on";
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (key === "grillH") return value >= GRILL_MIN && value <= GRILL_CAP;
  if (key === "grillAngle") return value >= WRAP_MIN && value <= WRAP_MAX;
  return false;
}

/** Outer bottom and top of the rear face, or null where the body rounds it off. */
function rearFace(style: ResolvedStyle, outer: Size): [number, number] | null {
  const sec = outerSection(style, outer, outer.y);
  return sec && sec[1] - sec[0] > 1e-6 ? sec : null;
}

/**
 * Whether the body can take a bevel along its rear bottom edge: not round a
 * spine, nor under a lift hinge's own chamfer, and only with the fans venting
 * out of the rear.
 */
export function wrapFits(
  style: ResolvedStyle,
  outer: Size,
  ventSides: Side[],
): boolean {
  // A perimeter body's rear is already bevelled or rounded under it.
  if (style.D > 0 || style.lip > 0 || style.pm) return false;
  if (ventSides.length === 0 || ventSides.some((s) => s !== "rear"))
    return false;
  const face = rearFace(style, outer);
  return !!face && BEVEL_SHARE * (face[1] - face[0]) >= GRILL_MIN;
}

/** The rear bevel a wrapped grill cuts, or null when it does not wrap. */
export function grillBevel(
  grill: Grill,
  style: ResolvedStyle,
  outer: Size,
  ventSides: Side[],
): { rise: number; run: number } | null {
  if (grill.style !== "bottom" || !grill.wrap || grill.angle >= WRAP_MAX - 0.5)
    return null;
  if (!wrapFits(style, outer, ventSides)) return null;
  const face = rearFace(style, outer);
  if (!face) return null;
  const rise = Math.min(grill.height, BEVEL_SHARE * (face[1] - face[0]));
  const run = Math.min(
    rise / Math.tan((grill.angle * Math.PI) / 180),
    0.25 * outer.y,
  );
  return { rise, run };
}

/** Flat part of one side's outer face at u along it, as z, or null. */
function faceAt(
  style: ResolvedStyle,
  outer: Size,
  side: Side,
  u: number,
): [number, number] | null {
  if (style.pm) {
    // The side's flat band between its bottom and top edge zones.
    const zs = perimZones(style.pm, sideMult(style.pm, side));
    const lo = zs.hB + MARGIN;
    const hi = outer.z - zs.hT - MARGIN;
    return hi > lo ? [lo, hi] : null;
  }
  const y =
    side === "rear" ? outer.y : side === "front" ? 0 : clamp(u, 0, outer.y);
  const sec = outerSection(style, outer, y);
  if (!sec) return null;
  const k = (sec[1] - sec[0]) / outer.z;
  const lo = sec[0] + Math.max(style.profile, style.uh) * k + MARGIN;
  const hi = sec[1] - style.profile * k - MARGIN;
  return hi > lo ? [lo, hi] : null;
}

function subtract(
  spans: [number, number][],
  cut: [number, number],
): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of spans) {
    if (cut[1] <= a || cut[0] >= b) out.push([a, b]);
    else {
      if (cut[0] > a) out.push([a, cut[0]]);
      if (cut[1] < b) out.push([cut[1], b]);
    }
  }
  return out;
}

const overlap = (a: [number, number], b: [number, number]) =>
  Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));

/** Slot width and pitch by era: coarse moulded slots early, fine ones later. */
function slotsFor(year: number): { width: number; pitch: number } {
  return year < 2012 ? { width: 1.6, pitch: 3 } : { width: 1.1, pitch: 2 };
}

/** The outer surface over the rear bevel on the centre line, (y, z), from under the base up to the rear face. */
function bevelPath(
  style: ResolvedStyle,
  outer: Size,
  run: number,
): [number, number][] {
  const { y: Y, z: Z } = outer;
  const { rings, nb } = profileRings(style, Z, true, 8);
  const edge = rings.slice(0, nb);
  const at = (d: number, rz: number): [number, number] => {
    const y = Y - d;
    const sec = outerSection(style, outer, y) ?? [0, Z];
    return [y, sec[0] + (rz / Z) * (sec[1] - sec[0])];
  };
  const pts: [number, number][] = [];
  const d0 = edge[0]?.d ?? 0;
  for (let d = run; d > d0 + 1e-6; d -= 0.5) pts.push(at(d, 0));
  for (const r of edge) pts.push(at(r.d, r.z));
  // Trimmed back from both ends.
  const len = (a: [number, number], b: [number, number]) =>
    Math.hypot(b[0] - a[0], b[1] - a[1]);
  const trim = (p: [number, number][], by: number) => {
    let left = by;
    while (p.length > 1) {
      const l = len(p[0], p[1]);
      if (l > left) {
        const t = left / l;
        p[0] = [
          p[0][0] + (p[1][0] - p[0][0]) * t,
          p[0][1] + (p[1][1] - p[0][1]) * t,
        ];
        break;
      }
      left -= l;
      p.shift();
    }
    return p;
  };
  const out = trim(trim(pts, END_GAP).reverse(), END_GAP).reverse();
  return out.length > 1 ? out : [];
}

function pathLength(p: [number, number][]): number {
  let l = 0;
  for (let i = 1; i < p.length; i++)
    l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return l;
}

/**
 * The shell's openings with the fans' vents drawn as the player's grill, and
 * the grill as solved. Ports and bays are left as they are.
 */
export function grillCutouts(
  openings: Opening[],
  grill: Grill,
  outer: Size,
  style: ResolvedStyle,
  year: number,
): { cutouts: Opening[]; fit: GrillFit } {
  const vents = openings.filter((o) => o.kind === "vent");
  const sides = [...new Set(vents.map((v) => v.side))];
  const stockArea = vents.reduce(
    (s, v) => s + (v.u[1] - v.u[0]) * (v.z[1] - v.z[0]),
    0,
  );
  const slots = slotsFor(year);
  const faces = new Map<Side, [number, number] | null>();
  const centre = (side: Side) => {
    const vs = vents.filter((v) => v.side === side);
    return (
      vs.reduce((s, v) => s + (v.u[0] + v.u[1]) / 2, 0) / Math.max(1, vs.length)
    );
  };
  for (const side of sides)
    faces.set(side, faceAt(style, outer, side, centre(side)));
  const heights = sides.map((s) => {
    const f = faces.get(s);
    return f ? f[1] - f[0] : 0;
  });
  const maxH = heights.length > 0 ? Math.min(...heights) : 0;
  const faceOk = sides.length > 0 && maxH >= GRILL_MIN;
  const wrapOk = wrapFits(style, outer, sides);
  const fit: GrillFit = {
    style: grill.style,
    faceOk,
    wrapOk,
    maxH,
    open: 1,
    angle: 0,
  };
  const others = openings.filter((o) => o.kind !== "vent");
  if (grill.style === "stock" || sides.length === 0)
    return { cutouts: openings, fit };
  if (grill.style === "none")
    return { cutouts: others, fit: { ...fit, open: 0 } };
  if (!faceOk) return { cutouts: openings, fit: { ...fit, style: "stock" } };

  const grills: Opening[] = [];
  let eff = 0;
  const onFins = (side: Side, u: [number, number], z: [number, number]) =>
    vents
      .filter((v) => v.side === side)
      .reduce((s, v) => s + overlap(u, v.u) * overlap(z, v.z), 0);
  if (style.bevel) {
    // Wrapped under: the grill lies on the rear bevel, across the rear.
    const path = bevelPath(style, outer, style.bevel.run);
    const flat = [
      Math.max(style.corner, bumperBlock(style)),
      outer.x - Math.max(style.corner, bumperBlock(style)),
    ];
    const u: [number, number] = [flat[0] + END_GAP, flat[1] - END_GAP];
    const L = pathLength(path);
    if (path.length > 1 && L > 0.5 && u[1] - u[0] > 4) {
      const zs = path.map((p) => p[1]);
      grills.push({
        id: "grill:rear:bevel",
        kind: "vent",
        side: "rear",
        u,
        z: [Math.min(...zs), Math.max(...zs)],
        slots,
        bevel: path,
      });
      const on = vents.reduce((s, v) => s + overlap(u, v.u), 0);
      const angle =
        (Math.atan2(style.bevel.rise, style.bevel.run) * 180) / Math.PI;
      eff +=
        (on * L + OFF_FINS * (u[1] - u[0] - on) * L) *
        (0.45 + 0.5 * Math.sin((angle * Math.PI) / 180));
      fit.angle = grill.angle;
    }
  } else {
    for (const side of sides) {
      const f = faces.get(side);
      if (!f) continue;
      const h = clamp(grill.height, GRILL_MIN, f[1] - f[0]);
      const mid = (f[0] + f[1]) / 2;
      const z: [number, number] =
        grill.style === "uniform"
          ? [mid - h / 2, mid + h / 2]
          : [f[0], f[0] + h];
      const across = side === "left" || side === "right";
      const len = across ? outer.y : outer.x;
      const c = Math.max(style.corner, bumperBlock(style));
      let lo = c + END_GAP;
      let hi = len - c - END_GAP;
      if (across) {
        // Along a side the section changes with the depth: the grill runs as
        // far either way from the fans as the flat face still holds it.
        const holds = (u: number) => {
          const g = faceAt(style, outer, side, u);
          return !!g && g[0] <= z[0] + 1e-6 && g[1] >= z[1] - 1e-6;
        };
        const c0 = centre(side);
        let a = c0;
        while (a - 1 >= lo && holds(a - 1)) a -= 1;
        let b = c0;
        while (b + 1 <= hi && holds(b + 1)) b += 1;
        lo = Math.max(lo, a);
        hi = Math.min(hi, b);
      }
      let spans: [number, number][] = hi > lo ? [[lo, hi]] : [];
      for (const o of others)
        if (
          o.side === side &&
          overlap(o.z, [z[0] - PORT_GAP, z[1] + PORT_GAP]) > 0
        )
          spans = subtract(spans, [o.u[0] - PORT_GAP, o.u[1] + PORT_GAP]);
      spans.forEach((u, i) => {
        if (u[1] - u[0] < 4) return;
        grills.push({
          id: `grill:${side}:${i}`,
          kind: "vent",
          side,
          u,
          z,
          slots,
        });
        const area = (u[1] - u[0]) * (z[1] - z[0]);
        const on = onFins(side, u, z);
        eff += on + OFF_FINS * (area - on);
      });
    }
  }
  return {
    cutouts: [...others, ...grills],
    fit: { ...fit, open: stockArea > 0 ? eff / stockArea : 1 },
  };
}

/**
 * What the grill does to the fans: a share of their cooling and a change in
 * their noise at full speed, dB. Closing the wall costs most; a grill gives or
 * takes a few percent by its open area over the fins, and one wrapped under
 * loses a little to the air it blows at the desk.
 */
export function grillAir(g: GrillFit | undefined): {
  cool: number;
  db: number;
} {
  if (!g || g.style === "stock") return { cool: 1, db: 0 };
  if (g.style === "none") return { cool: 0.93, db: 1 };
  const r = Math.max(0.05, g.open);
  let cool = clamp(1 + 0.05 * Math.log2(r), 0.94, 1.04);
  if (g.angle > 0) cool *= 1 - 0.02 * Math.cos((g.angle * Math.PI) / 180);
  return { cool, db: clamp(-Math.log2(r), -0.5, 1.5) };
}
