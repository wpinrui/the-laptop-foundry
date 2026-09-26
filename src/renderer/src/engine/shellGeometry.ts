import type { BodyStyle, Side, Size } from "./types";

// Engine-owned shell surface. Plain arrays, no rendering dependency: the
// viewer wraps them in whatever geometry type it uses. Same styling model as
// shell.ts: a rounded-rectangle footprint (plan corner radius) extruded to the
// thickness, with the top and bottom perimeter edges rounded or chamfered.

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
  /**
   * The flat wall of each side asked to be left open, which the viewer builds
   * itself with its holes cut through. Corners run bottom start, bottom end,
   * top end, top start, counter-clockwise seen from outside.
   */
  walls: { side: Side; corners: [number, number, number][] }[];
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
  /** Sides whose flat wall is left out, for the caller to build with holes. */
  open: Side[] = [],
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
  // Layout: the rings, then the bottom centre, then the top centre (the
  // viewer relies on the centres coming last).
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
  // on the footprint outline. Its four straight sides are the ones left open.
  const band = rings.length / 2 - 1;
  const straight: Side[] = ["right", "rear", "left", "front"];
  const cut = new Set<number>();
  const walls: MeshData["walls"] = [];
  const pt = (v: number): [number, number, number] => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
  for (let e = 0; e < 4; e++) {
    const side = straight[e];
    if (!open.includes(side)) continue;
    const i = e * (segments + 1) + segments;
    const j = (i + 1) % n;
    cut.add(i);
    walls.push({
      side,
      corners: [pt(band * n + i), pt(band * n + j), pt((band + 1) * n + j), pt((band + 1) * n + i)],
    });
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
    walls,
  };
}
