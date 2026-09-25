import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION BLUETOOTH MODULE: the 2006 add-on Bluetooth daughterboard.
//
// A tiny card lying flat, long side along z:
//   - the PCB (body);
//   - the radio chip under a small metal shield can;
//   - a flat-cable (FFC) connector across the -z end: a plastic housing with
//     its metal latch bar and contacts;
//   - a chip antenna connector near the +z end with a short lead stub (rubber)
//     rising off it and curving to the +x edge, inside the box.
// One mesh per material.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.

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

  const bt = new THREE.Group();
  bt.name = "bt";
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    bt.add(mesh);
  };

  const pcbT = Math.min(0.8, 0.27 * H);
  const yS = yB + pcbT;
  add(box3(-x1 + 0.2, x1 - 0.2, yB, yS, zB + 0.2, zF - 0.2), m.body, "pcb");

  // Shield can over the radio, in the middle.
  const canH = Math.min(1.2, 0.45 * (yT - yS));
  add(box3(-0.3 * W, 0.3 * W, yS, yS + canH, -0.22 * D, 0.2 * D), m.metal, "shield");

  // FFC connector across the -z end: housing, latch bar, contacts.
  const cw = 0.7 * W;
  const ch = Math.min(1.0, 0.45 * (yT - yS));
  const cz0 = zB + 0.4, cz1 = cz0 + Math.min(3, 0.16 * D);
  add(box3(-cw / 2, cw / 2, yS, yS + ch, cz0, cz1), m.plastic, "connector");
  add(box3(-cw / 2 - 0.3, cw / 2 + 0.3, yS + ch - 0.2, yS + ch + 0.05, cz1 - 0.8, cz1), m.metal, "latch");
  const pins = 8;
  const contacts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < pins; i++) {
    const x = -cw / 2 + 0.8 + (i * (cw - 1.6)) / (pins - 1);
    contacts.push(box3(x - 0.15, x + 0.15, yS, yS + 0.06, cz1, cz1 + 0.6));
  }
  for (const g of contacts) add(g, m.metal, "contact");

  // Antenna connector near the +z end, and its lead stub curving to the +x edge.
  const ax = -0.2 * W, az = zF - 3;
  const cr = 0.7, cH = Math.min(0.7, 0.5 * (yT - yS));
  const conn = new THREE.CylinderGeometry(cr, cr, cH, 12);
  conn.translate(ax, yS + cH / 2, az);
  add(conn, m.metal, "antenna-connector");
  const lr = 0.35;
  const yRun = Math.min(yT - lr - 0.1, yS + cH + lr);
  const curve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(ax, yS + cH, az),
      new THREE.Vector3(ax + 0.3, yRun, az + 0.3),
      new THREE.Vector3(ax + 0.45 * (x1 - ax), yRun, zF - 1.4),
      new THREE.Vector3(x1 - lr - 0.5, yRun, zF - lr - 0.5),
    ],
    false,
    "centripetal",
  );
  add(new THREE.TubeGeometry(curve, 10, lr, 6, false), m.rubber, "lead");
  return bt;
}

export const model: ModelModule = { key: "bt", build };
