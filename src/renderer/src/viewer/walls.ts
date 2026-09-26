import * as THREE from "three";
import type { Fit, MeshData, Side } from "../engine";
import { portOpening } from "../models/roles/port";

// Side walls with the ports cut through them. The shell leaves out the flat
// wall of each side that has a port; this builds that wall as one extruded
// solid: the outer face with a hole shaped to each connector (its own front
// outline, from the port model, grown by a small clearance), the hole's
// sides running through the wall's thickness to the connector's face, and a
// thin collar at the back of the hole that closes the clearance round the
// connector, so no hole ever shows the void behind it.

type P2 = [number, number];

/** Gap between a connector's outline and the edge of its hole in the wall, in mm. */
export const PORT_CLEARANCE = 0.2;
/** Depth of the collar that closes the clearance at the back of each hole. */
const COLLAR = 0.05;
/** Holes stay this far inside the flat wall. */
const MARGIN = 0.05;

/** Port openings per side, in engine wall coordinates: u along the side (x on front and rear, y on left and right), z up. */
export type Cuts = Partial<Record<Side, P2[][]>>;

export function portCuts(fit: Fit): Cuts {
  const cuts: Cuts = {};
  for (const b of fit.boxes) {
    if (b.kind !== "unit" || !b.role.startsWith("port:") || !b.edge || !b.part) continue;
    const side = b.edge;
    const across = side === "left" || side === "right";
    // The port model faces its opening out of `side` by turning about the
    // vertical: its canonical x runs along +u on the front and right, along
    // -u on the rear and left.
    const s = side === "front" || side === "right" ? 1 : -1;
    const W = across ? b.size.y : b.size.x;
    const H = b.size.z;
    const cu = across ? b.at.y + b.size.y / 2 : b.at.x + b.size.x / 2;
    const cz = b.at.z + b.size.z / 2;
    for (const o of portOpening(b.part, W, H)) {
      const pts = o.map(([x, y]): P2 => [cu + s * x, cz + y]);
      if (!cuts[side]) cuts[side] = [];
      cuts[side].push(pts);
    }
  }
  return cuts;
}

function area(pts: P2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/** The outline offset outward by d, with mitred corners. Returned counter-clockwise. */
function grow(outline: P2[], d: number): P2[] {
  const pts = area(outline) < 0 ? [...outline].reverse() : outline;
  const n = pts.length;
  const normal = (a: P2, b: P2): P2 => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];
  };
  return pts.map((p, i) => {
    const n1 = normal(pts[(i - 1 + n) % n], p);
    const n2 = normal(p, pts[(i + 1) % n]);
    const k = Math.max(0.25, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (d * (n1[0] + n2[0])) / k, p[1] + (d * (n1[1] + n2[1])) / k];
  });
}

function pathOf(pts: P2[], ShapeType: typeof THREE.Path | typeof THREE.Shape = THREE.Path) {
  const p = new ShapeType();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}

/**
 * Triangles (flat positions, three per vertex) for one side's wall with its
 * port holes, `depth` thick, in engine space.
 */
export function wallPositions(
  wall: MeshData["walls"][number],
  holes: P2[][],
  depth: number,
): number[] {
  const [A, B, C, D] = wall.corners;
  const side = wall.side;
  const ax = side === "left" || side === "right" ? 1 : 0;
  const other = 1 - ax;
  const dir = Math.sign(B[ax] - A[ax]) || 1;
  const len = Math.abs(B[ax] - A[ax]);
  // Inward, from the outer face into the base.
  const inward = side === "left" || side === "front" ? 1 : -1;

  // Wall-local 2D: t along the side from A, z up.
  const bottom = (t: number) => A[2] + ((B[2] - A[2]) * t) / len;
  const top = (t: number) => D[2] + ((C[2] - D[2]) * t) / len;
  const toLocal = (pts: P2[]): P2[] => pts.map(([u, z]) => [(u - A[ax]) * dir, z]);
  // Keep a hole inside the flat wall, so it never breaks the wall's outline.
  const inside = (pts: P2[]): P2[] =>
    pts.map(([t0, z]) => {
      const t = Math.min(len - MARGIN, Math.max(MARGIN, t0));
      return [t, Math.min(top(t) - MARGIN, Math.max(bottom(t) + MARGIN, z))];
    });

  const face = pathOf(
    [
      [0, A[2]],
      [len, B[2]],
      [len, C[2]],
      [0, D[2]],
    ],
    THREE.Shape,
  ) as THREE.Shape;
  const collars: THREE.Shape[] = [];
  for (const h of holes) {
    const raw = inside(toLocal(h));
    const cut = inside(grow(toLocal(h), PORT_CLEARANCE));
    face.holes.push(pathOf(cut));
    const collar = pathOf(cut, THREE.Shape) as THREE.Shape;
    collar.holes.push(pathOf(raw));
    collars.push(collar);
  }

  const out: number[] = [];
  const emit = (g: THREE.BufferGeometry, d0: number) => {
    const geo = g.index ? g.toNonIndexed() : g;
    const p = geo.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const v: [number, number, number] = [0, 0, 0];
      v[ax] = A[ax] + dir * p.getX(i);
      v[other] = A[other] + inward * (d0 + p.getZ(i));
      v[2] = p.getY(i);
      out.push(...v);
    }
    if (geo !== g) geo.dispose();
    g.dispose();
  };
  emit(new THREE.ExtrudeGeometry(face, { depth, bevelEnabled: false, curveSegments: 1 }), 0);
  for (const c of collars)
    emit(new THREE.ExtrudeGeometry(c, { depth: COLLAR, bevelEnabled: false, curveSegments: 1 }), depth - COLLAR);
  return out;
}
