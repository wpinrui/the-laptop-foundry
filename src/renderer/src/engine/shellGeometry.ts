import { type Insets, LIFT_RUN, outerSection, perimInsets, perimLevels, perimZones, ringCorner, sideMult } from "./shell";
import type { ResolvedStyle, Side, Size } from "./types";

// Engine-owned shell surface. Plain arrays, no rendering dependency: the
// viewer wraps them in whatever geometry type it uses. Same styling model as
// shell.ts: a rounded-rectangle footprint (plan corner radius) swept by a ring
// profile (the top and bottom perimeter edges rounded or chamfered, or an
// undercut cove at the bottom). Bodies whose section changes along the depth
// (taper, spine, shelf, lift chamfer, a domed lid) remap each ring point's
// height into the section at that point's depth, so the footprint's straight
// sides are cut at a row of depths shared by every ring. A perimeter body
// stacks rings of its plan outline, each inset per side by the edge profile at
// that ring's height.

export interface Wall {
  side: Side;
  /**
   * Corners run bottom start, bottom end, top end, top start, counter-clockwise
   * seen from outside.
   */
  corners: [number, number, number][];
  /** The wall's bottom and top edges from its start to its end, as (along the side, z). */
  bottom: [number, number][];
  top: [number, number][];
}

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
  /** Points in each ring loop; the loops come first in `positions`, bottom ring first. */
  n: number;
  /** Index ranges [start, end) in `indices`: the bottom face and the top face. The rest are the sides. */
  bottom: [number, number];
  top: [number, number];
  /** The top face's flat front part, at z (outline counter-clockwise from above), and where the rest of the top face lies in `indices`. */
  deck: { outline: [number, number][]; z: number; rest: [number, number] };
  /**
   * The flat wall of each side asked to be left open, which the viewer builds
   * itself with its holes cut through.
   */
  walls: Wall[];
}

interface Ring {
  /** Inward distance from the footprint outline. */
  d: number;
  /** Nominal height in [0, Z], remapped into the section at each depth. */
  z: number;
}

export function profileRings(style: ResolvedStyle, Z: number, profile: boolean, segments: number): { rings: Ring[]; nb: number } {
  const p = profile && style.edge !== "square" ? Math.min(style.profile, Z / 2) : 0;
  const edge = (): Ring[] => {
    const out: Ring[] = [];
    if (p <= 0) out.push({ d: 0, z: 0 });
    else if (style.edge === "chamfer") out.push({ d: p, z: 0 }, { d: 0, z: p });
    else
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * (Math.PI / 2);
        out.push({ d: p - p * Math.sin(a), z: p - p * Math.cos(a) });
      }
    return out;
  };
  const top = [...edge()].reverse().map((r) => ({ d: r.d, z: Z - r.z }));
  let bottom = edge();
  if (profile && style.ui > 0 && style.uh > 0) {
    // The undercut: a cove from the tucked-in bottom up to the full outline.
    bottom = [];
    const k = Math.max(4, segments);
    for (let i = 0; i <= k; i++) {
      const a = (i / k) * (Math.PI / 2);
      bottom.push({ d: style.ui * Math.cos(a), z: Math.min(style.uh, Z / 2) * Math.sin(a) });
    }
  }
  return { rings: [...bottom, ...top], nb: bottom.length };
}

/** Depths at which the straight sides are cut, so the section can change along them. */
function depthCuts(style: ResolvedStyle, size: Size, profile: boolean): number[] {
  const Y = size.y;
  const keys: number[] = [];
  if (profile) {
    if (style.taper) keys.push(style.taper.run * Y);
    if (style.Sd > 0 && style.R > 0) keys.push(Y - style.Sd, Y - style.Sd + 0.8 * style.R);
    if (style.D > 0) {
      // Round the spine, closest where it turns fastest.
      const Rc = style.D / 2;
      for (let i = 0; i <= 32; i++) keys.push(Y - Rc + Rc * Math.cos((Math.PI * i) / 32));
    }
    if (style.lip > 0) keys.push(Y - LIFT_RUN * style.lip);
    if (style.bevel) keys.push(Y - style.bevel.run);
  }
  const varies = keys.length > 0 || (!profile && style.crown > 0);
  if (!varies) return [];
  const step = Y / 48;
  for (let y = step; y < Y - step / 2; y += step) keys.push(y);
  return [...new Set(keys.map((v) => Math.round(v * 1000) / 1000))].filter((v) => v > 0 && v < Y).sort((a, b) => a - b);
}

/**
 * One ring's footprint outline inset on each side by I, counter-clockwise
 * from above: the right side front to rear, then the left side rear to front.
 * The left and right insets are equal, so the halves mirror: point k on the
 * right and point (last - k) on the left share a depth. Each corner is rounded
 * by the plan corner less the smaller inset either side of it, or cut flat.
 */
export function outline(
  X: number,
  Y: number,
  r: number,
  I: Insets,
  segments: number,
  cuts: number[],
  chamfer = false,
): [number, number][] {
  const corner = (a: number, b: number) => ringCorner(r, a, b, X, Y, I);
  const fr = corner(I.r, I.f);
  const br = corner(I.r, I.b);
  const bl = corner(I.l, I.b);
  const fl = corner(I.l, I.f);
  const arc = (cx: number, cy: number, rc: number, start: number, out: [number, number][]) => {
    const a0 = (start * Math.PI) / 180;
    const a1 = ((start + 90) * Math.PI) / 180;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      if (chamfer)
        out.push([
          cx + rc * (Math.cos(a0) + (Math.cos(a1) - Math.cos(a0)) * t),
          cy + rc * (Math.sin(a0) + (Math.sin(a1) - Math.sin(a0)) * t),
        ]);
      else {
        const a = a0 + (a1 - a0) * t;
        out.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]);
      }
    }
  };
  const right: [number, number][] = [];
  arc(X - I.r - fr, I.f + fr, fr, -90, right);
  for (const y of cuts) right.push([X - I.r, Math.min(Y - I.b - br, Math.max(I.f + fr, y))]);
  arc(X - I.r - br, Y - I.b - br, br, 0, right);
  const left: [number, number][] = [];
  arc(I.l + bl, Y - I.b - bl, bl, 90, left);
  for (const y of [...cuts].reverse()) left.push([I.l, Math.min(Y - I.b - bl, Math.max(I.f + fl, y))]);
  arc(I.l + fl, I.f + fl, fl, 180, left);
  return [...right, ...left];
}

const even = (d: number): Insets => ({ l: d, r: d, f: d, b: d });

/**
 * Closed outer surface of a styled slab from (0, 0, 0) to size, its section
 * shaped along the depth. With `profile` false the top and bottom edges stay
 * square and the section is the lid's: flat, domed on top by `style.crown`.
 */
export function shellSurface(
  size: Size,
  style: ResolvedStyle,
  profile = true,
  segments = 8,
  /** Sides whose flat wall is left out, for the caller to build with holes. */
  open: Side[] = [],
): MeshData {
  const Z = size.z;
  const ch = style.cornerKind === "chamfer";
  const pm = profile ? style.pm : null;
  const { rings, nb } = profileRings(style, Z, profile, segments);
  const cuts = pm ? [] : depthCuts(style, size, profile);
  const section = (y: number): [number, number] => {
    if (!profile) return [0, Z + style.crown * Math.sin((Math.PI * Math.min(Math.max(y, 0), size.y)) / size.y)];
    return outerSection(style, size, y) ?? [0, Z];
  };
  const levels = pm ? perimLevels(pm, Z) : [];
  const loops = pm
    ? levels.map((z) =>
        outline(size.x, size.y, style.corner, perimInsets(pm, Z, z), segments, cuts, ch).map(
          ([x, y]): [number, number, number] => [x, y, z],
        ),
      )
    : rings.map((ring) =>
        outline(size.x, size.y, style.corner, even(ring.d), segments, cuts, ch).map(([x, y]): [number, number, number] => {
          const [lo, hi] = section(y);
          return [x, y, lo + (ring.z / Z) * (hi - lo)];
        }),
      );
  const n = loops[0].length;
  const m = n / 2;
  const positions: number[] = [];
  for (const loop of loops) for (const p of loop) positions.push(...p);
  const pt = (v: number): [number, number, number] => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];

  // Straight sides as edges of the loop: [first vertex, last vertex], in loop order.
  const straight: Record<Side, [number, number]> = {
    right: [segments, segments + cuts.length + 1],
    rear: [m - 1, m],
    left: [m + segments, m + segments + cuts.length + 1],
    front: [n - 1, n],
  };
  // The flat wall of each side: between the ring pair where it stands
  // vertical. On a perimeter body each side has its own, from the top of its
  // bottom zone to the foot of its top zone.
  const wallRings = (side: Side): [number, number] => {
    if (!pm) return [nb - 1, nb];
    const zs = perimZones(pm, sideMult(pm, side));
    const near = (z: number) => {
      let best = 0;
      for (let k = 1; k < levels.length; k++) if (Math.abs(levels[k] - z) < Math.abs(levels[best] - z)) best = k;
      return best;
    };
    const a = near(zs.hB);
    return [a, Math.max(a + 1, near(Z - zs.hT))];
  };
  const cut = new Map<number, [number, number]>();
  const walls: Wall[] = [];
  for (const side of open) {
    const [i0, i1] = straight[side];
    const [ka, kb] = wallRings(side);
    const ax = side === "left" || side === "right" ? 1 : 0;
    const bottom: [number, number][] = [];
    const top: [number, number][] = [];
    for (let i = i0; i <= i1; i++) {
      const v = i % n;
      if (i < i1) cut.set(v, [ka, kb]);
      const b = pt(ka * n + v);
      const t = pt(kb * n + v);
      bottom.push([b[ax], b[2]]);
      top.push([t[ax], t[2]]);
    }
    walls.push({
      side,
      corners: [pt(ka * n + i0), pt(ka * n + (i1 % n)), pt(kb * n + (i1 % n)), pt(kb * n + i0)],
      bottom,
      top,
    });
  }

  const indices: number[] = [];
  for (let k = 0; k + 1 < loops.length; k++) {
    const a = k * n;
    const b = (k + 1) * n;
    for (let i = 0; i < n; i++) {
      const c = cut.get(i);
      if (c && k >= c[0] && k < c[1]) continue;
      const j = (i + 1) % n;
      indices.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  }
  // Bottom and top faces: strips across the width between neighbouring depths,
  // so the face follows the section. Right point k pairs with left point n - 1 - k.
  const faceStart = indices.length;
  for (let k = 0; k + 1 < m; k++) {
    const r0 = k;
    const r1 = k + 1;
    const l0 = n - 1 - k;
    const l1 = n - 2 - k;
    indices.push(l0, l1, r1, l0, r1, r0);
  }
  const topStart = indices.length;
  const last = (loops.length - 1) * n;
  const yFlat = profile
    ? Math.min(size.y, style.Sd > 0 ? size.y - style.Sd : Infinity, style.D > 0 ? size.y - style.D / 2 : Infinity)
    : 0;
  const flatRows: number[] = [];
  const restRows: number[] = [];
  for (let k = 0; k + 1 < m; k++) {
    const r0 = last + k;
    const r1 = last + k + 1;
    const l0 = last + n - 1 - k;
    const l1 = last + n - 2 - k;
    const rows = pt(r1)[1] <= yFlat + 1e-6 ? flatRows : restRows;
    rows.push(l0, r0, r1, l0, r1, l1);
  }
  indices.push(...flatRows);
  const restStart = indices.length;
  indices.push(...restRows);
  const flatOutline: [number, number][] = [];
  for (let k = 0; k < m; k++) if (pt(last + k)[1] <= yFlat + 1e-6) flatOutline.push([pt(last + k)[0], pt(last + k)[1]]);
  for (let k = m - 1; k >= 0; k--) if (pt(last + n - 1 - k)[1] <= yFlat + 1e-6) flatOutline.push([pt(last + n - 1 - k)[0], pt(last + n - 1 - k)[1]]);
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    n,
    bottom: [faceStart, topStart],
    top: [topStart, indices.length],
    deck: { outline: flatOutline, z: pt(last)[2], rest: [restStart, indices.length] },
    walls,
  };
}
