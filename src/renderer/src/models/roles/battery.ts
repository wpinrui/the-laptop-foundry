import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION BATTERY: the battery pack, by ctx.part.
//
//   li-ion-18650     rows of cylindrical cells, laid along x, in a hard plastic
//                    casing moulded over them: a humped top, one hump per row,
//                    with a groove at every cell joint. A BMS bay at the -x end
//                    carries the blade connector on the back (-z) face.
//   slim-li-po-2006  a flat hard plastic pack with chamfered corners and edges,
//                    three stiffening ribs across the top, and the connector set
//                    into a notch at the back-left corner.
//   li-po-pouch      bare foil pouch cells side by side (one per ~75 mm), soft
//                    pillowed edges, their tabs on a terrace along the back
//                    welded to a protection board, and a flex tail to the
//                    connector at the back-left.
//   bridge-battery   one small foil cell with the same terrace, board and flex.
// Removable (ctx.removable): the underside (-y) is the outside of the laptop.
// A finished body-colour casing plate closes it, with a sliding latch set flush
// into a slot near the front edge; pouch packs also get casing walls.
// The connector anchor sits at the centre of the connector's mating face.
//
// Model space: centred, x width, y up, z depth with the front at +z, 1 unit = 1 mm.
// Geometry is baked in place; no mesh transforms.

type P2 = [number, number]; // (x, z) in plan

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function anchor(name: string, x: number, y: number, z: number): THREE.Object3D {
  const a = new THREE.Object3D();
  a.name = `anchor:${name}`;
  a.position.set(x, y, z);
  return a;
}

/** Plan outline (x, z) to a Shape. Shape y is world -z once the extrusion is turned up. */
function planShape(pts: P2[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], -pts[i][1]);
  s.closePath();
  return s;
}

function planPath(pts: P2[]): THREE.Path {
  const p = new THREE.Path();
  p.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], -pts[i][1]);
  p.closePath();
  return p;
}

function planRect(x0: number, x1: number, z0: number, z1: number): P2[] {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

/** Rounded rectangle in plan. */
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
  /** Extrude a plan shape up y from y0 to y1; a bevel b rounds the top and bottom edges (shape is inset by b). */
  slab(mat: THREE.Material, s: THREE.Shape, y0: number, y1: number, b: number, segs: number, name = "part"): void {
    const bev = Math.max(0, Math.min(b, 0.45 * (y1 - y0)));
    const g = new THREE.ExtrudeGeometry(s, {
      depth: y1 - y0 - 2 * bev,
      bevelEnabled: bev > 0,
      bevelThickness: bev,
      bevelSize: bev,
      bevelOffset: 0,
      bevelSegments: 2,
      curveSegments: segs,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0 + bev, 0);
    this.add(g, mat, name);
  }
  /** Extrude a front-view (x, y) shape along z from z0 to z1. */
  prismZ(mat: THREE.Material, s: THREE.Shape, z0: number, z1: number, name = "part"): void {
    const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: 2 });
    g.translate(0, 0, z0);
    this.add(g, mat, name);
  }
  /** Upper half of a cylinder along x, centred at (y, z), from x0 to x1. */
  hump(mat: THREE.Material, r: number, x0: number, x1: number, y: number, z: number, segs: number, name = "hump"): void {
    const g = new THREE.CylinderGeometry(r, r, x1 - x0, segs, 1, false, Math.PI, Math.PI);
    g.rotateZ(-Math.PI / 2); // axis y -> x; the kept half faces +y
    g.translate((x0 + x1) / 2, y, z);
    this.add(g, mat, name);
  }
}

interface Mats {
  body: THREE.Material;
  metal: THREE.Material;
  plastic: THREE.Material;
  rubber: THREE.Material;
}

/** Blade connector with its mating face on -z at zFace; returns the anchor point. */
function connector(k: Kit, m: Mats, cx: number, y0: number, zFace: number, cw: number, ch: number, cl: number, pins: number): [number, number, number] {
  const face = new THREE.Shape();
  face.moveTo(cx - cw / 2, y0);
  face.lineTo(cx + cw / 2, y0);
  face.lineTo(cx + cw / 2, y0 + ch);
  face.lineTo(cx - cw / 2, y0 + ch);
  face.closePath();
  const pitch = cw / (pins + 1);
  const sw = Math.min(0.9, 0.45 * pitch);
  const sh = 0.55 * ch;
  const sy = y0 + ch / 2;
  for (let i = 0; i < pins; i++) {
    const x = cx - cw / 2 + (i + 1) * pitch;
    const p = new THREE.Path();
    p.moveTo(x - sw / 2, sy - sh / 2);
    p.lineTo(x + sw / 2, sy - sh / 2);
    p.lineTo(x + sw / 2, sy + sh / 2);
    p.lineTo(x - sw / 2, sy + sh / 2);
    p.closePath();
    face.holes.push(p);
    k.box(m.metal, x - 0.12, x + 0.12, sy - sh / 2 + 0.05, sy + sh / 2 - 0.05, zFace + 0.4, zFace + 0.6 * cl, "blade");
  }
  k.prismZ(m.plastic, face, zFace, zFace + 0.6 * cl, "connector");
  k.box(m.plastic, cx - cw / 2, cx + cw / 2, y0, y0 + ch, zFace + 0.6 * cl, zFace + cl, "connector");
  return [cx, sy, zFace];
}

/** Removable underside: a body-colour plate with a flush sliding latch near the front. */
function underside(k: Kit, m: Mats, W: number, H: number, D: number, c: number): void {
  const yB = -H / 2;
  const zF = D / 2;
  const lw = clamp(0.18 * W, 10, 24);
  const ld = clamp(0.14 * D, 5, 9);
  const lz1 = zF - Math.max(2, c + 1);
  const lz0 = lz1 - ld;
  const plate = planShape(planRect(-W / 2, W / 2, -D / 2, D / 2));
  plate.holes.push(planPath(planRect(-lw / 2, lw / 2, lz0, lz1)));
  k.slab(m.body, plate, yB, yB + c, 0, 2, "casing");
  // The latch: a slider recessed a touch, with grip ribs flush with the underside.
  const rec = Math.min(0.25, 0.3 * c);
  k.box(m.plastic, -lw / 2 + 0.2, lw / 2 - 0.2, yB + rec, yB + c, lz0 + 0.2, lz1 - 0.2, "latch");
  for (let i = 0; i < 3; i++) {
    const z = lz0 + ((i + 1) * ld) / 4;
    k.box(m.plastic, -lw / 2 + 1.2, lw / 2 - 1.2, yB, yB + rec, z - 0.4, z + 0.4, "latch");
  }
}

// ------------------------------------------------------------------ packs

function cells18650(k: Kit, m: Mats, W: number, H: number, D: number, c: number, cells: number): [number, number, number] {
  const perRow = cells === 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(cells / perRow));
  const xi0 = -W / 2 + c, xi1 = W / 2 - c;
  const zi0 = -D / 2 + c, zi1 = D / 2 - c;
  const yBase = -H / 2 + c;
  const yTop = H / 2;
  const bms = clamp(0.1 * (xi1 - xi0), 6, 10);
  const xc0 = xi0 + bms, xc1 = xi1;
  const dz = (zi1 - zi0 - 3.2) / rows;
  const r = Math.min(dz / 2, (yTop - yBase) / 2);
  const yc = yTop - r;
  // Casing moulded over the cells: a flat lower part and one hump per row.
  k.box(m.plastic, xc0, xc1, yBase, yc, zi0, zi1, "casing");
  const cellL = (xc1 - xc0) / perRow;
  const gap = Math.min(0.8, 0.05 * cellL);
  for (let j = 0; j < rows; j++) {
    const z = zi0 + 1.6 + (j + 0.5) * dz;
    for (let i = 0; i < perRow; i++) {
      const x0 = xc0 + i * cellL + (i > 0 ? gap / 2 : 0);
      const x1 = xc0 + (i + 1) * cellL - (i < perRow - 1 ? gap / 2 : 0);
      k.hump(m.plastic, r, x0, x1, yc, z, 10, "casing");
      if (i < perRow - 1) k.hump(m.plastic, r - 0.5, x1, x1 + gap, yc, z, 10, "groove");
    }
  }
  // BMS bay at the -x end, the connector on its back face.
  const cl = Math.min(4, 0.3 * (zi1 - zi0));
  const bmsTop = yTop - Math.min(1.5, 0.1 * H);
  k.box(m.plastic, xi0, xc0, yBase, bmsTop, zi0 + cl, zi1, "bms");
  const cw = Math.min(bms - 1, 14);
  const ch = Math.min(6, bmsTop - yBase - 0.5);
  k.box(m.plastic, xi0, xc0, yBase, yBase + 0.5, zi0, zi0 + cl, "bms");
  return connector(k, m, (xi0 + xc0) / 2, yBase + 0.5, -D / 2, cw, ch, cl, 5);
}

function slimPack(k: Kit, m: Mats, W: number, H: number, D: number, c: number): [number, number, number] {
  const xi0 = -W / 2 + c, xi1 = W / 2 - c;
  const zi0 = -D / 2 + c, zi1 = D / 2 - c;
  const yBase = -H / 2 + c;
  const yTop = H / 2;
  const ribH = Math.min(0.4, 0.08 * H);
  const ch = clamp(0.2 * (xi1 - xi0), 0, 4); // corner chamfer in plan
  // Connector notch at the back-left.
  const nw = Math.min(16, 0.2 * (xi1 - xi0));
  const nd = Math.min(5, 0.12 * (zi1 - zi0));
  const nx0 = xi0 + ch + 2, nx1 = nx0 + nw;
  const pts: P2[] = [
    [xi0 + ch, zi0],
    [nx0, zi0],
    [nx0, zi0 + nd],
    [nx1, zi0 + nd],
    [nx1, zi0],
    [xi1 - ch, zi0],
    [xi1, zi0 + ch],
    [xi1, zi1 - ch],
    [xi1 - ch, zi1],
    [xi0 + ch, zi1],
    [xi0, zi1 - ch],
    [xi0, zi0 + ch],
  ];
  const b = Math.min(0.6, 0.12 * (yTop - yBase));
  // Inset the outline by the bevel so the bevelled pack fills the box exactly.
  const inset = pts.map(([x, z]): P2 => [
    x + (x <= xi0 + 1e-6 ? b : x >= xi1 - 1e-6 ? -b : 0),
    z + (z <= zi0 + 1e-6 ? b : z >= zi1 - 1e-6 ? -b : 0),
  ]);
  k.slab(m.plastic, planShape(inset), yBase, yTop - ribH, b, 2, "casing");
  const rw = Math.min(3, 0.04 * (xi1 - xi0));
  for (const f of [-0.28, 0, 0.28])
    k.box(m.plastic, f * (xi1 - xi0) - rw / 2, f * (xi1 - xi0) + rw / 2, yTop - ribH - 0.1, yTop, zi0 + nd + 3, zi1 - 3, "rib");
  const cH = Math.min(3.5, yTop - yBase - 0.6);
  return connector(k, m, (nx0 + nx1) / 2, yBase + 0.3, -D / 2, nw - 1, cH, nd + c, 5);
}

function pouch(k: Kit, m: Mats, W: number, H: number, D: number, c: number, single: boolean): [number, number, number] {
  const wall = c > 0 ? Math.min(c, 1.2) : 0;
  const xi0 = -W / 2 + wall, xi1 = W / 2 - wall;
  const zi0 = -D / 2 + wall, zi1 = D / 2 - wall;
  const yBase = -H / 2 + c;
  const yTop = H / 2;
  const Wi = xi1 - xi0;
  if (c > 0) {
    // Casing walls round the tray, a little below the top.
    const wTop = yTop - Math.min(0.5, 0.1 * H);
    const ring = planShape(planRect(-W / 2, W / 2, -D / 2, D / 2));
    ring.holes.push(planPath(planRect(xi0, xi1, zi0, zi1)));
    k.slab(m.body, ring, yBase, wTop, 0, 2, "casing");
  }
  const n = single ? 1 : clamp(Math.round(Wi / 75), 1, 6);
  const terrace = clamp(0.1 * (zi1 - zi0), 3, 6);
  const gap = 1.2;
  const cellW = (Wi - gap * (n + 1)) / n;
  const ym = (yBase + yTop) / 2;
  const b = Math.min(0.8, 0.2 * (yTop - yBase));
  const cz0 = zi0 + terrace, cz1 = zi1 - 0.3;
  for (let i = 0; i < n; i++) {
    const x0 = xi0 + gap + i * (cellW + gap);
    const x1 = x0 + cellW;
    const outline = planRound(x0 + b, x1 - b, cz0 + b, cz1 - b, 2, 2);
    k.slab(m.metal, planShape(outline), yBase, yTop, b, 2, "cell");
    // Two tabs out of the cell's back edge onto the terrace.
    const tw = Math.min(8, 0.18 * cellW);
    for (const f of [0.28, 0.72]) {
      const tx = x0 + f * cellW;
      k.box(m.metal, tx - tw / 2, tx + tw / 2, ym - 0.08, ym + 0.08, zi0 + 1.6, cz0 + 0.2, "tab");
    }
  }
  // Protection board along the terrace, and the flex tail to the connector.
  const cw = Math.min(12, 0.25 * Wi);
  const cxc = xi0 + gap + cw / 2;
  const bh = Math.min(1.2, 0.35 * (yTop - yBase));
  k.box(m.plastic, cxc + cw / 2 + 0.5, xi1 - gap, ym - bh / 2, ym + bh / 2, zi0 + 0.3, zi0 + 1.6, "board");
  k.box(m.plastic, cxc - cw / 2, cxc + cw / 2 + 0.6, ym - 0.06, ym + 0.06, zi0 + 1.6, cz0 - 0.2, "flex");
  const cH = Math.min(2.2, yTop - yBase - 0.4);
  return connector(k, m, cxc, Math.max(yBase + 0.1, ym - cH / 2), -D / 2, cw, cH, Math.min(1.6 + wall, terrace), 4);
}

function build(
  box: ModelBox,
  options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const mats = ctx.materials;
  const m: Mats = { body: mats.body, metal: mats.metal, plastic: mats.plastic, rubber: mats.rubber };
  const old = ctx.year < 2015;
  const part = ctx.part ?? (old ? "li-ion-18650" : "li-po-pouch");
  const W = box.width, H = box.height, D = box.depth;
  // Removable casing: 1 mm on 2006 packs, 2 mm on the 2026 external pack.
  const c = ctx.removable ? Math.min(old ? 1 : 2, 0.25 * H) : 0;

  const k = new Kit();
  if (c > 0) underside(k, m, W, H, D, c);
  let at: [number, number, number];
  if (part === "li-ion-18650") at = cells18650(k, m, W, H, D, c, Number(options.cells ?? 6));
  else if (part === "slim-li-po-2006") at = slimPack(k, m, W, H, D, c);
  else at = pouch(k, m, W, H, D, c, part === "bridge-battery");

  const pack = k.group;
  pack.name = "battery";
  pack.add(anchor("connector", at[0], at[1], at[2]));
  return pack;
}

export const model: ModelModule = { key: "battery", build };
