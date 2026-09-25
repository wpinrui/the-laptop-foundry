import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION KEYBOARD LIGHT: the 2006 lid-mounted lamp in the top bezel.
//
// A lid part: +z is the screen side, +y runs up the screen. The lamp shines
// forward and down onto the keyboard, so the housing's front-bottom edge is
// cut away at 45 degrees and the lens sits in that face, its normal (0, -1, 1):
//   - a plastic housing: a side profile (full height at the back, flat top,
//     the 45 degree lamp face across the front-bottom) run along x;
//   - a metal bezel on the lamp face, and the LED lens (glow) proud of it;
//   - two metal mounting ears at the back.
// Everything baked in place; one mesh per material.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

type P2 = [number, number]; // (z, y) side profile

/** Extrude a side profile (z, y) along x from x0 to x1. Shape x is -z, so the turned extrusion lands the right way round. */
function profile(pts: P2[], x0: number, x1: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(-pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false });
  g.rotateY(Math.PI / 2); // shape x -> -z, extrusion z -> +x
  g.translate(x0, 0, 0);
  return g;
}

function box3(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

function build(
  box: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const m = ctx.materials;
  const W = box.width, H = box.height, D = box.depth;
  const x1 = W / 2, yB = -H / 2, yT = H / 2, zB = -D / 2, zF = D / 2;

  const lamp = new THREE.Group();
  lamp.name = "kblight";
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    lamp.add(mesh);
  };

  // Housing: the lamp face runs from A (front, part way down) to B (bottom, part way back) at 45 degrees.
  const cut = Math.min(D - 0.8, 0.6 * H);
  const A: P2 = [zF, yB + cut];
  const B: P2 = [zF - cut, yB];
  const hx = x1 - 1.2; // leave room for the ears
  add(profile([[zB, yB], B, A, [zF, yT], [zB, yT]], -hx, hx), m.plastic, "housing");

  // Points on the lamp face and along its outward normal n = (z, y) = (1, -1) / sqrt 2.
  const n: P2 = [Math.SQRT1_2, -Math.SQRT1_2];
  const on = (t: number, out: number): P2 => [
    A[0] + (B[0] - A[0]) * t + n[0] * out,
    A[1] + (B[1] - A[1]) * t + n[1] * out,
  ];
  // Bezel, then the lens proud of it.
  const lx = Math.min(3.8, 0.35 * W);
  add(profile([on(0.1, 0), on(0.9, 0), on(0.9, 0.08), on(0.1, 0.08)], -lx - 0.6, lx + 0.6), m.metal, "bezel");
  add(profile([on(0.22, 0.08), on(0.78, 0.08), on(0.78, 0.2), on(0.22, 0.2)], -lx, lx), m.glow, "lens");

  // Mounting ears at the back, either end.
  const earT = Math.min(0.6, 0.15 * D);
  for (const s of [-1, 1]) add(box3(s > 0 ? hx : -x1, s > 0 ? x1 : -hx, yB + 0.6, yT - 0.6, zB, zB + earT), m.metal, "ear");

  return lamp;
}

export const model: ModelModule = { key: "kblight", build };
