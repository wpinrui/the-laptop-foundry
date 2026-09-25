import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION BAY DRIVE: a 2.5 or 1.8 inch drive lying flat, long side along x,
// its connector at the -x short end. By ctx.part:
//   hdd25-5400, hdd25-7200, hdd18   hard disks: a die-cast metal base on a PCB,
//       a stamped metal lid with its pressed ridge round the platter, the
//       spindle hub and screw, the actuator pivot screw, and cover screws
//       round the edge; side mounting holes on both long sides.
//   ssd18-pata, ssd25-sata          SSDs: a plain two-part case, a metal
//       bottom shell and a top shell in the drive's own colour, a seam groove
//       between them and a shallow recessed top panel; no screws on top.
// Connectors: 2.5 inch PATA hard disks have a 44-pin header (two rows) and a
// jumper block; 1.8 inch drives have a slim ZIF connector; the 2026 SSD has
// the SATA data and power blades.
// capacity has no visual effect.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.
// Geometry is baked in place; no mesh transforms.

type P2 = [number, number]; // (x, z) in plan

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function planRound(x0: number, x1: number, z0: number, z1: number, r: number, cs: number): P2[] {
  const rr = Math.max(0.05, Math.min(r, (x1 - x0) / 2 - 0.01, (z1 - z0) / 2 - 0.01));
  const out: P2[] = [];
  const cs4: [number, number, number][] = [
    [x1 - rr, z1 - rr, 0],
    [x0 + rr, z1 - rr, Math.PI / 2],
    [x0 + rr, z0 + rr, Math.PI],
    [x1 - rr, z0 + rr, 1.5 * Math.PI],
  ];
  for (const [cx, cz, a0] of cs4)
    for (let i = 0; i <= cs; i++) {
      const a = a0 + (i / cs) * (Math.PI / 2);
      out.push([cx + rr * Math.cos(a), cz + rr * Math.sin(a)]);
    }
  return out;
}

/** Plan points (x, z) to shape coordinates (x, -z), so an extrusion turned up lands the right way round. */
function shapeOf(pts: P2[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], -pts[i][1]);
  s.closePath();
  return s;
}

function pathOf(pts: P2[]): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], -pts[i][1]);
  p.closePath();
  return p;
}

class Kit {
  group = new THREE.Group();
  add(g: THREE.BufferGeometry, mat: THREE.Material, name: string): void {
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    this.group.add(mesh);
  }
  box(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, name = "part"): void {
    if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(g, mat, name);
  }
  slab(mat: THREE.Material, s: THREE.Shape, y0: number, y1: number, segs: number, name = "part"): void {
    if (y1 - y0 < 1e-3) return;
    const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: segs });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    this.add(g, mat, name);
  }
  /** Vertical cylinder standing on y0. */
  post(mat: THREE.Material, r: number, x: number, z: number, y0: number, y1: number, segs: number, name = "post"): void {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, segs);
    g.translate(x, (y0 + y1) / 2, z);
    this.add(g, mat, name);
  }
  /** Cylinder along z (for side holes), from z0 to z1. */
  rodZ(mat: THREE.Material, r: number, x: number, y: number, z0: number, z1: number, segs: number, name = "rod"): void {
    const g = new THREE.CylinderGeometry(r, r, z1 - z0, segs);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, (z0 + z1) / 2);
    this.add(g, mat, name);
  }
  /** Flat ring in plan, from y0 to y1. */
  annulus(mat: THREE.Material, rIn: number, rOut: number, x: number, z: number, y0: number, y1: number, segs: number, name = "ring"): void {
    const g = new THREE.LatheGeometry(
      [
        new THREE.Vector2(rIn, y0),
        new THREE.Vector2(rOut, y0),
        new THREE.Vector2(rOut, y1),
        new THREE.Vector2(rIn, y1),
        new THREE.Vector2(rIn, y0),
      ],
      segs,
    );
    g.translate(x, 0, z);
    this.add(g, mat, name);
  }
}

interface Mats {
  body: THREE.Material;
  metal: THREE.Material;
  plastic: THREE.Material;
  rubber: THREE.Material;
}

type Conn = "pata44" | "zif" | "sata";

/** Connector at the -x end, from x = -W/2 to x1. y0..y1 is its height band. */
function connector(k: Kit, m: Mats, kind: Conn, W: number, D: number, x1: number, y0: number, y1: number): void {
  const x0 = -W / 2;
  const h = y1 - y0;
  if (kind === "pata44") {
    // 44-pin header: a plastic block, two rows of 22 pins sticking out of it.
    const zc = -0.08 * D;
    const len = Math.min(0.6 * D, 26.4);
    const bz0 = zc - len / 2, bz1 = zc + len / 2;
    const bx0 = x0 + 2.2;
    k.box(m.plastic, bx0, x1, y0, y1, bz0, bz1, "connector");
    const pitch = len / 22;
    for (let r = 0; r < 2; r++) {
      const py = y0 + (r + 1) * (h / 3);
      for (let i = 0; i < 22; i++) {
        const pz = bz0 + (i + 0.5) * pitch;
        k.box(m.metal, x0, bx0 + 0.4, py - 0.25, py + 0.25, pz - 0.25, pz + 0.25, "pin");
      }
    }
    // Jumper block beside it: four pins.
    const jz0 = bz1 + 1.5;
    k.box(m.plastic, bx0, x1, y0, y0 + 0.5 * h, jz0, jz0 + 5, "jumper");
    for (let i = 0; i < 4; i++) {
      const pz = jz0 + 0.8 + i * 1.1;
      k.box(m.metal, x0 + 0.6, bx0 + 0.4, y0 + 0.25 * h - 0.25, y0 + 0.25 * h + 0.25, pz - 0.25, pz + 0.25, "pin");
    }
  } else if (kind === "zif") {
    // Slim ZIF connector: a plastic body with a flex slot and a contact row.
    const len = 0.5 * D;
    const zc = 0;
    const s = new THREE.Shape();
    s.moveTo(zc + len / 2, y0);
    s.lineTo(zc - len / 2, y0);
    s.lineTo(zc - len / 2, y1);
    s.lineTo(zc + len / 2, y1);
    s.closePath();
    const slot = new THREE.Path();
    const sh = Math.min(0.6, 0.3 * h);
    slot.moveTo(zc + len / 2 - 1, y0 + h / 2 - sh / 2);
    slot.lineTo(zc - len / 2 + 1, y0 + h / 2 - sh / 2);
    slot.lineTo(zc - len / 2 + 1, y0 + h / 2 + sh / 2);
    slot.lineTo(zc + len / 2 - 1, y0 + h / 2 + sh / 2);
    slot.closePath();
    s.holes.push(slot);
    // Extrude along x: shape x is z here, extrusion depth runs +x after the turn.
    const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false, curveSegments: 2 });
    g.rotateY(-Math.PI / 2); // shape x -> z, extrusion z -> -x
    g.translate(x1, 0, 0);
    k.add(g, m.plastic, "connector");
    const n = 12;
    for (let i = 0; i < n; i++) {
      const pz = zc - len / 2 + 1.3 + (i * (len - 2.6)) / (n - 1);
      k.box(m.metal, x0 + 0.5, x1 - 0.3, y0 + h / 2 - sh / 2, y0 + h / 2 - sh / 2 + 0.06, pz - 0.18, pz + 0.18, "contact");
    }
  } else {
    // SATA: data (7 contacts) and power (15 contacts) blades in an L-keyed shroud.
    const blade = Math.min(0.9, 0.2 * h);
    const by = y0 + 0.5 * h;
    const bx0 = x0 + 0.3;
    const segs: [number, number, number][] = [
      [-0.36 * D, -0.36 * D + 0.2 * D, 7],
      [-0.36 * D + 0.2 * D + 2, -0.36 * D + 0.2 * D + 2 + 0.36 * D, 15],
    ];
    k.box(m.plastic, bx0 + 3, x1, y0, y1, segs[0][0] - 1, segs[1][1] + 1, "connector");
    for (const [z0, z1, n] of segs) {
      k.box(m.plastic, bx0, bx0 + 3, by - blade / 2, by + blade / 2, z0, z1, "blade");
      k.box(m.plastic, bx0, bx0 + 3, by + blade / 2, y1, z0 - 0.8, z0, "key");
      k.box(m.plastic, bx0, bx0 + 3, y0, by - blade / 2, z1, z1 + 0.8, "key");
      const pitch = (z1 - z0) / n;
      for (let i = 0; i < n; i++) {
        const pz = z0 + (i + 0.5) * pitch;
        k.box(m.metal, bx0 + 0.3, bx0 + 3, by + blade / 2, by + blade / 2 + 0.05, pz - pitch * 0.25, pz + pitch * 0.25, "contact");
      }
    }
  }
}

function hdd(k: Kit, m: Mats, W: number, H: number, D: number, big: boolean): void {
  const yBot = -H / 2, yTop = H / 2;
  const cl = big ? 3.2 : 2.2; // connector reach beyond the casting
  const xb0 = -W / 2 + cl, xb1 = W / 2;
  const zb = D / 2 - 0.05;
  const pcbT = Math.min(big ? 0.8 : 0.5, 0.1 * H);
  const lidT = Math.min(0.4, 0.06 * H);
  const screwH = Math.min(0.2, 0.04 * H);
  const yLid1 = yTop - screwH;
  const yLid0 = yLid1 - lidT;
  const rc = big ? 3 : 2;

  // PCB underneath, casting above, lid on top.
  k.slab(m.plastic, shapeOf(planRound(xb0 + 1.5, xb1 - (big ? 14 : 10), -zb + 3, zb - 3, 1, 2)), yBot, yBot + pcbT, 2, "pcb");
  k.slab(m.metal, shapeOf(planRound(xb0, xb1, -zb, zb, rc, 3)), yBot + pcbT, yLid0, 4, "base");
  const li = 0.8;
  k.slab(m.metal, shapeOf(planRound(xb0 + li, xb1 - li, -zb + li, zb - li, rc - 0.5, 3)), yLid0, yLid1, 4, "lid");

  // Platter under the lid: the pressed ridge, the spindle hub and screw.
  const R = D / 2 - 3.2;
  const pcx = xb1 - li - 1.5 - R;
  const ridge = Math.min(0.12, 0.5 * screwH);
  k.annulus(m.metal, R - 0.9, R, pcx, 0, yLid1 - 0.01, yLid1 + ridge, 32, "ridge");
  const hubR = 0.2 * R;
  k.annulus(m.metal, hubR * 0.5, hubR, pcx, 0, yLid1 - 0.01, yLid1 + ridge, 20, "hub");
  k.post(m.metal, hubR * 0.4, pcx, 0, yLid1 - 0.01, yTop, 10, "screw");
  // Actuator pivot, beyond the platter toward the connector end.
  const ax = pcx - R - 0.12 * D;
  const az = 0.28 * D;
  k.annulus(m.rubber, 1.1, 2.2, ax, az, yLid1 - 0.01, yLid1 + 0.04, 12, "pivot");
  k.post(m.metal, 1.1, ax, az, yLid1 - 0.01, yTop, 10, "screw");

  // Cover screws round the edge, each in a dark recess ring.
  const sr = big ? 0.9 : 0.7;
  const e = li + sr + 0.9;
  const xs = [xb0 + e, (xb0 + xb1) / 2 - 0.1 * W, xb1 - e];
  const screws: P2[] = [];
  for (const x of xs) screws.push([x, -zb + e], [x, zb - e]);
  for (const [x, z] of screws) {
    // Skip one that would land on the platter ridge.
    if (Math.hypot(x - pcx, z) < R + sr + 0.5 && Math.hypot(x - pcx, z) > R - 0.9 - sr - 0.5) continue;
    k.annulus(m.rubber, sr, sr + 0.3, x, z, yLid1 - 0.01, yLid1 + 0.03, 8, "recess");
    k.post(m.metal, sr, x, z, yLid1 - 0.01, yTop, 10, "screw");
  }

  // Side mounting holes: dark discs let into both long sides.
  const hy = (yBot + pcbT + yLid0) / 2;
  const hr = Math.min(1.3, 0.25 * (yLid0 - yBot - pcbT));
  for (const f of big ? [-0.3, 0.35] : [-0.25, 0.3])
    for (const sz of [-1, 1]) k.rodZ(m.rubber, hr, f * W, hy, sz > 0 ? zb - 0.3 : -D / 2, sz > 0 ? D / 2 : -zb + 0.3, 10, "hole");

  const cy0 = yBot + pcbT;
  connector(k, m, big ? "pata44" : "zif", W, D, xb0 + 1, cy0, Math.min(yLid0, cy0 + (big ? 5.5 : 2.2)));
}

function ssd(k: Kit, m: Mats, W: number, H: number, D: number, big: boolean): void {
  const yBot = -H / 2, yTop = H / 2;
  const cl = big ? 3.5 : 2.2;
  const xb0 = -W / 2 + cl, xb1 = W / 2;
  const zb = D / 2;
  const rc = big ? 3 : 2;
  const ym = yBot + (big ? 0.45 : 0.5) * H;
  const seam = Math.min(0.25, 0.05 * H);
  const outline = planRound(xb0, xb1, -zb, zb, rc, 3);
  // Metal bottom shell, the seam groove, and the top shell in the drive's colour.
  k.slab(m.metal, shapeOf(outline), yBot, ym - seam / 2, 4, "bottom");
  k.slab(m.plastic, shapeOf(planRound(xb0 + 0.4, xb1 - 0.4, -zb + 0.4, zb - 0.4, rc - 0.4, 3)), ym - seam / 2, ym + seam / 2, 4, "seam");
  const panel = Math.min(0.25, 0.05 * H);
  k.slab(m.body, shapeOf(outline), ym + seam / 2, yTop - panel, 4, "top");
  // Raised border round a shallow recessed panel.
  const bw = clamp(0.06 * D, 2.5, 4);
  const rim = shapeOf(outline);
  rim.holes.push(pathOf(planRound(xb0 + bw, xb1 - bw, -zb + bw, zb - bw, rc, 3)));
  k.slab(m.body, rim, yTop - panel, yTop, 4, "top");
  connector(k, m, big ? "sata" : "zif", W, D, xb0 + 1, yBot + 0.3, Math.min(ym + 1.5, yTop - 0.5));
}

function build(
  box: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const c = ctx.materials;
  const m: Mats = { body: c.body, metal: c.metal, plastic: c.plastic, rubber: c.rubber };
  const W = box.width, H = box.height, D = box.depth;
  const big = W >= 90; // 2.5 inch; 1.8 inch drives are 78.5 wide
  const part = ctx.part ?? (ctx.year < 2015 ? "hdd25-5400" : "ssd25-sata");
  const k = new Kit();
  if (part.startsWith("ssd")) ssd(k, m, W, H, D, big);
  else hdd(k, m, W, H, D, big);
  const drive = k.group;
  drive.name = "drive";
  return drive;
}

export const model: ModelModule = { key: "drive", build };
