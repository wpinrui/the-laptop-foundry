import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION FIN STACK: a heat-sink fin stack behind a vent.
//
// Built in a canonical frame with the vent at -z (back), like the fan's
// outlet, then turned about y so the vent faces ctx.edge. In that frame:
//   - x runs across the vent (the dimension that matches the fan width);
//   - z is the fin depth (6.8 to 8 mm), from the fan side (+z) to the vent (-z);
//   - fins are thin plates in the y-z plane, stacked along x, so air from the
//     fan passes between them and straight out of the vent;
//   - thin top and bottom skins close the stack; a thicker end plate caps
//     each side;
//   - a flattened heat pipe runs across the top of the stack, along x, in a
//     saddle over the fins.
// 2006: thick copper fins (0.35 mm at 1.6 mm pitch), copper skins and pipe.
// 2026: thin, dense fins (0.12 mm at 1.0 mm pitch) in metal, copper pipe.
// Heights 3 to 12 mm: the pipe and skins scale with the height, leaving the
// fins at least two thirds of it.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

function anchor(name: string, x: number, y: number, z: number): THREE.Object3D {
  const a = new THREE.Object3D();
  a.name = `anchor:${name}`;
  a.position.set(x, y, z);
  return a;
}

/** Merged boxes; the bottom and top faces are optional. */
class Buf {
  pos: number[] = [];
  idx: number[] = [];
  private v(x: number, y: number, z: number): number {
    this.pos.push(x, y, z);
    return this.pos.length / 3 - 1;
  }
  private quad(a: number, b: number, c: number, d: number, ex: number, ey: number, ez: number): void {
    const p = this.pos;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const wx = p[c * 3] - p[a * 3], wy = p[c * 3 + 1] - p[a * 3 + 1], wz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (nx * ex + ny * ey + nz * ez >= 0) this.idx.push(a, b, c, a, c, d);
    else this.idx.push(a, c, b, a, d, c);
  }
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, caps = true): void {
    const q = (pts: number[][], ex: number, ey: number, ez: number) =>
      this.quad(this.v(pts[0][0], pts[0][1], pts[0][2]), this.v(pts[1][0], pts[1][1], pts[1][2]),
        this.v(pts[2][0], pts[2][1], pts[2][2]), this.v(pts[3][0], pts[3][1], pts[3][2]), ex, ey, ez);
    q([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], 1, 0, 0);
    q([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], -1, 0, 0);
    q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0, 0, 1);
    q([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 0, 0, -1);
    if (caps) {
      q([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], 0, 1, 0);
      q([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0, -1, 0);
    }
  }
  mesh(mat: THREE.Material, name: string): THREE.Mesh | undefined {
    if (this.idx.length === 0) return undefined;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    return m;
  }
}

function build(
  box: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const old = ctx.year < 2015;
  const slots = ctx.materials as unknown as Record<string, THREE.Material | undefined>;
  const copper = slots.copper ?? ctx.materials.metal;
  const finMat = old ? copper : ctx.materials.metal;
  const edge = ctx.edge ?? "back";
  const side = edge === "left" || edge === "right";
  // Canonical frame: W across the vent (x), L the fin depth (z), vent at -z.
  const W = side ? box.depth : box.width;
  const L = side ? box.width : box.depth;
  const H = box.height;
  const x1 = W / 2, z0 = -L / 2, z1 = L / 2;
  const yBot = -H / 2, yTop = H / 2;

  // Vertical stack: bottom skin, fins, top skin, heat pipe in its saddle.
  const skin = Math.min(old ? 0.3 : 0.2, 0.05 * H);
  const pipeH = Math.min(3, Math.max(0.8, 0.25 * H));
  const pipeD = Math.min(0.7 * L, Math.max(2.4, 2.2 * pipeH));
  const yFin0 = yBot + skin;
  const yFin1 = yTop - pipeH - skin;
  const yPipe0 = yTop - pipeH;

  const fins = new Buf();
  const frame = new Buf();

  frame.box(-x1, x1, yBot, yFin0, z0, z1);
  frame.box(-x1, x1, yFin1, yPipe0, z0, z1);

  // End plates, then fins between them at a fixed pitch, centred.
  const endT = Math.min(old ? 0.6 : 0.4, 0.1 * W);
  frame.box(-x1, -x1 + endT, yFin0, yFin1, z0, z1, false);
  frame.box(x1 - endT, x1, yFin0, yFin1, z0, z1, false);
  const pitch = old ? 1.6 : 1.0;
  const ft = old ? 0.35 : 0.12;
  const inner = W - 2 * endT;
  const n = Math.max(0, Math.floor((inner - ft) / pitch));
  const start = -((n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    const x = start + i * pitch;
    fins.box(x - ft / 2, x + ft / 2, yFin0, yFin1, z0, z1, false);
  }

  const stack = new THREE.Group();
  stack.name = "fin";
  const body = new THREE.Group();
  stack.add(body);
  const add = (mesh: THREE.Mesh | undefined) => mesh && body.add(mesh);
  add(fins.mesh(finMat, "fins"));
  add(frame.mesh(finMat, "skins"));

  // Flattened heat pipe across the top, over the middle of the fin depth; baked in place.
  const pipe = new THREE.CylinderGeometry(pipeD / 2, pipeD / 2, W - 0.02, 16);
  pipe.rotateZ(Math.PI / 2); // axis y -> x
  pipe.scale(1, pipeH / pipeD, 1); // flatten the round section to pipeH tall
  pipe.translate(0, yPipe0 + pipeH / 2, 0);
  const pipeMesh = new THREE.Mesh(pipe, copper);
  pipeMesh.name = "heatpipe";
  body.add(pipeMesh);

  // Anchor: centre of the vent face.
  body.add(anchor("vent", 0, 0, z0));

  // Turn the canonical (vent at back) stack to face ctx.edge.
  body.rotation.y = { back: 0, left: Math.PI / 2, right: -Math.PI / 2, front: Math.PI }[edge];
  return stack;
}

export const model: ModelModule = { key: "fin", build };
