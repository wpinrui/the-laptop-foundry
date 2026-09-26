import type { BodyStyle, Side, Size } from "./types";

// Engine-owned shell surface. Plain arrays, no rendering dependency: the
// viewer wraps them in whatever geometry type it uses. Same styling model as
// shell.ts: a rounded-rectangle footprint (plan corner radius) extruded to the
// thickness, with the top and bottom perimeter edges rounded or chamfered.

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

/** A rectangular hole through a side wall: u along the side (x on front and rear, y on left and right), z up. */
export interface WallHole {
  side: Side;
  u: [number, number];
  z: [number, number];
}

interface Ring {
  /** Inward distance from the footprint outline. */
  d: number;
  z: number;
}

function profileRings(
  style: BodyStyle,
  Z: number,
  profile: boolean,
  segments: number,
): Ring[] {
  const p =
    profile && style.edge !== "square" ? Math.min(style.profile, Z / 2) : 0;
  const bottom: Ring[] = [];
  if (p <= 0) bottom.push({ d: 0, z: 0 });
  else if (style.edge === "chamfer")
    bottom.push({ d: p, z: 0 }, { d: 0, z: p });
  else
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * (Math.PI / 2);
      bottom.push({ d: p - p * Math.sin(a), z: p - p * Math.cos(a) });
    }
  const top = [...bottom].reverse().map((r) => ({ d: r.d, z: Z - r.z }));
  return [...bottom, ...top];
}

/** Points of a footprint outline inset by d, counter-clockwise seen from above. */
function outline(
  X: number,
  Y: number,
  r: number,
  d: number,
  segments: number,
): [number, number][] {
  const rc = Math.max(0, Math.min(r - d, (X - 2 * d) / 2, (Y - 2 * d) / 2));
  const corners: [number, number, number][] = [
    [X - d - rc, d + rc, -90],
    [X - d - rc, Y - d - rc, 0],
    [d + rc, Y - d - rc, 90],
    [d + rc, d + rc, 180],
  ];
  const pts: [number, number][] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= segments; i++) {
      const a = ((start + (i / segments) * 90) * Math.PI) / 180;
      pts.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]);
    }
  }
  return pts;
}

/**
 * Closed outer surface of a styled slab from (0, 0, 0) to size.
 * With `profile` false the top and bottom edges stay square and there is no
 * wedge (the lid). The wedge drops the lower half of the base toward the rear,
 * so the bottom slopes down by `style.wedge` at y = size.y and the top stays flat.
 */
export function shellSurface(
  size: Size,
  style: BodyStyle,
  profile = true,
  segments = 8,
  holes: WallHole[] = [],
): MeshData {
  const rings = profileRings(style, size.z, profile, segments);
  const loops = rings.map((ring) =>
    outline(size.x, size.y, style.corner, ring.d, segments).map(([x, y]) => [
      x,
      y,
      ring.z,
    ]),
  );
  const n = loops[0].length;
  const positions: number[] = [];
  for (const loop of loops) for (const p of loop) positions.push(...p);
  // Layout: the rings, any wall pieces around holes, then the bottom centre,
  // then the top centre (the viewer relies on the centres coming last).
  const wedge = (y: number, z: number) => {
    if (!profile || style.wedge <= 0) return z;
    // Only ever moves points down in the lower half: material is added outside.
    const f = Math.max(0, 1 - z / (size.z / 2));
    return z - style.wedge * (y / size.y) * f;
  };
  for (let i = 0; i < positions.length; i += 3)
    positions[i + 2] = wedge(positions[i + 1], positions[i + 2]);

  const indices: number[] = [];
  // The flat wall band: from the last bottom ring to the first top ring, both
  // on the footprint outline. Its four straight sides are where holes go.
  const band = rings.length / 2 - 1;
  const straight: Side[] = ["right", "rear", "left", "front"];
  const cut = new Set<number>();
  for (let e = 0; e < 4; e++) {
    const side = straight[e];
    const mine = holes.filter((h) => h.side === side);
    if (mine.length === 0) continue;
    const i = e * (segments + 1) + segments;
    const j = (i + 1) % n;
    cut.add(i);
    const pt = (v: number) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    const A = pt(band * n + i);
    const B = pt(band * n + j);
    const D = pt((band + 1) * n + i);
    const C = pt((band + 1) * n + j);
    const ax = side === "left" || side === "right" ? 1 : 0;
    const len = B[ax] - A[ax];
    if (Math.abs(len) < 1e-6) continue;
    const tOf = (u: number) => Math.min(1, Math.max(0, (u - A[ax]) / len));
    const spans = mine.map((h) => {
      const t0 = tOf(h.u[0]);
      const t1 = tOf(h.u[1]);
      return { t0: Math.min(t0, t1), t1: Math.max(t0, t1), z0: h.z[0], z1: h.z[1] };
    });
    const ts = [...new Set([0, 1, ...spans.flatMap((h) => [h.t0, h.t1])])].sort((a, b) => a - b);
    const lerp = (p: number[], q: number[], t: number) => p.map((v, k) => v + (q[k] - v) * t);
    const quad = (t0: number, t1: number, lo0: number, lo1: number, hi: number) => {
      if (hi - Math.max(lo0, lo1) < 1e-6) return;
      const p0 = lerp(A, B, t0);
      const p1 = lerp(A, B, t1);
      const v = positions.length / 3;
      positions.push(p0[0], p0[1], lo0, p1[0], p1[1], lo1, p1[0], p1[1], hi, p0[0], p0[1], hi);
      indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    };
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k];
      const t1 = ts[k + 1];
      if (t1 - t0 < 1e-9) continue;
      const bot0 = lerp(A, B, t0)[2];
      const bot1 = lerp(A, B, t1)[2];
      const top = lerp(D, C, (t0 + t1) / 2)[2];
      const mid = (t0 + t1) / 2;
      const over = spans
        .filter((h) => h.t0 <= mid && mid <= h.t1)
        .map((h) => [Math.max(h.z0, Math.max(bot0, bot1)), Math.min(h.z1, top)])
        .filter(([a, b]) => b > a)
        .sort((a, b) => a[0] - b[0]);
      // Wall from the band's bottom edge up to the first hole, between holes, and above the last.
      let lo0 = bot0;
      let lo1 = bot1;
      for (const [z0, z1] of over) {
        quad(t0, t1, lo0, lo1, z0);
        lo0 = Math.max(lo0, z1);
        lo1 = Math.max(lo1, z1);
      }
      quad(t0, t1, lo0, lo1, top);
    }
  }

  const bottomCentre = positions.length / 3;
  positions.push(size.x / 2, size.y / 2, wedge(size.y / 2, 0));
  const topCentre = positions.length / 3;
  positions.push(size.x / 2, size.y / 2, size.z);

  for (let k = 0; k + 1 < loops.length; k++) {
    const a = k * n;
    const b = (k + 1) * n;
    for (let i = 0; i < n; i++) {
      if (k === band && cut.has(i)) continue;
      const j = (i + 1) % n;
      indices.push(a + i, a + j, b + j, a + i, b + j, b + i);
    }
  }
  const last = (loops.length - 1) * n;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(bottomCentre, j, i);
    indices.push(topCentre, last + i, last + j);
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}
