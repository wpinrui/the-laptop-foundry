import * as THREE from "three";
import type { Opening, Size } from "../engine";

// A slotted fan grill as drawn: its slots in the opening colour. On a flat
// wall each slot is a block through the wall, standing just proud of the face
// like a stock vent; on the rear bevel each slot is a strip following the
// outer surface under the base and up round the edge.

/** How far a bevel slot stands off the surface, mm. */
const LIFT = 0.12;

/** Slot starts along u, centred in the span. */
function slotStarts(
  u: [number, number],
  width: number,
  pitch: number,
): number[] {
  const span = u[1] - u[0];
  const n = Math.max(0, Math.floor((span - width) / pitch) + 1);
  const start = u[0] + (span - ((n - 1) * pitch + width)) / 2;
  return Array.from({ length: n }, (_, i) => start + i * pitch);
}

/** Triangles for every slotted grill in `openings`, in engine space; `wall` is the side wall's depth. */
export function grillPositions(
  openings: Opening[],
  out: Size,
  wall: number,
): Float32Array {
  const pos: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) =>
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (const o of openings) {
    if (o.kind !== "vent" || !o.slots) continue;
    const { width, pitch } = o.slots;
    const starts = slotStarts(o.u, width, pitch);
    if (o.bevel) {
      const p = o.bevel;
      // Outward normal at each point, averaged over the segments either side.
      const nrm = p.map((_, i) => {
        const a = p[Math.max(0, i - 1)];
        const b = p[Math.min(p.length - 1, i + 1)];
        const dy = b[0] - a[0];
        const dz = b[1] - a[1];
        const l = Math.hypot(dy, dz) || 1;
        return [dz / l, -dy / l];
      });
      for (const x0 of starts) {
        const x1 = x0 + width;
        for (let i = 0; i + 1 < p.length; i++) {
          const [y0, z0] = [
            p[i][0] + LIFT * nrm[i][0],
            p[i][1] + LIFT * nrm[i][1],
          ];
          const [y1, z1] = [
            p[i + 1][0] + LIFT * nrm[i + 1][0],
            p[i + 1][1] + LIFT * nrm[i + 1][1],
          ];
          quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1]);
        }
      }
      continue;
    }
    // A block through the wall per slot, as the stock vent's.
    const across = o.side === "left" || o.side === "right";
    const face =
      o.side === "left"
        ? 0
        : o.side === "right"
          ? out.x
          : o.side === "front"
            ? 0
            : out.y;
    const outward = o.side === "left" || o.side === "front" ? -1 : 1;
    const d0 = face + outward * 0.2;
    const d1 = face - outward * wall;
    const [z0, z1] = o.z;
    for (const s of starts) {
      const u0 = s;
      const u1 = s + width;
      const v = (u: number, d: number, z: number) =>
        across ? [d, u, z] : [u, d, z];
      // Six faces of the block.
      quad(v(u0, d0, z0), v(u1, d0, z0), v(u1, d0, z1), v(u0, d0, z1));
      quad(v(u0, d1, z0), v(u1, d1, z0), v(u1, d1, z1), v(u0, d1, z1));
      quad(v(u0, d0, z0), v(u0, d1, z0), v(u0, d1, z1), v(u0, d0, z1));
      quad(v(u1, d0, z0), v(u1, d1, z0), v(u1, d1, z1), v(u1, d0, z1));
      quad(v(u0, d0, z0), v(u1, d0, z0), v(u1, d1, z0), v(u0, d1, z0));
      quad(v(u0, d0, z1), v(u1, d0, z1), v(u1, d1, z1), v(u0, d1, z1));
    }
  }
  return new Float32Array(pos);
}

export function grillGeometry(
  openings: Opening[],
  out: Size,
  wall: number,
): THREE.BufferGeometry | null {
  const pos = grillPositions(openings, out, wall);
  if (pos.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return g;
}
