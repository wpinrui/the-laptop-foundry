import * as THREE from "three";
import type { ModelBox, ModelContext, ModelModule } from "../contract";

// PRODUCTION SPEAKER: one driver in its enclosure, firing up (+y).
//
// ctx.part names the whole speaker set, so the driver is told from the box
// (src/renderer/src/engine/content/peripherals.ts, SPEAKERS, shrunk by up to
// 15 % by spend):
//   2006: 45 x 40 (34 mm deep or more) is the subwoofer; 30 x 15 is a speaker.
//   2026: 45 or 60 deep (37 mm or more) is a woofer; 35 deep is a tweeter.
//
// 2006 speaker:   a plastic box with screw ears at both ends and a round cone:
//                 metal frame ring, rubber half-roll surround, cone, dust cap.
// 2006 subwoofer: a deeper box with a much larger, deeper cone at one end, a
//                 bass-reflex port at the other, and screw bosses at the corners.
// 2026 woofer:    a sealed plastic box with a long stadium window: a flat
//                 diaphragm on a rubber surround, behind a grille of metal
//                 bars, ringed by a foam gasket; screw bosses and a flex tail.
// 2026 tweeter:   a slim sealed box with a small dome behind a round grille at
//                 one end, and a ribbed back volume along the rest.
//
// Built at identity in model space: centred, x width, y up, z depth with the
// front at +z, 1 unit = 1 mm. Geometry is baked in place; no mesh transforms.

type P2 = [number, number]; // (x, z) in plan

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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

/** Stadium in plan, long axis along z: half-width a, half-length b (b >= a). */
function planStadium(cx: number, cz: number, a: number, b: number, segs: number): P2[] {
  const out: P2[] = [];
  const s = Math.max(0, b - a);
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI;
    out.push([cx + a * Math.cos(t), cz + s + a * Math.sin(t)]);
  }
  for (let i = 0; i <= segs; i++) {
    const t = Math.PI + (i / segs) * Math.PI;
    out.push([cx + a * Math.cos(t), cz - s + a * Math.sin(t)]);
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

function circlePath(cx: number, cz: number, r: number): THREE.Path {
  const p = new THREE.Path();
  p.absarc(cx, -cz, r, 0, Math.PI * 2, true);
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
  /** Extrude a plan shape up y from y0 to y1. */
  slab(mat: THREE.Material, s: THREE.Shape, y0: number, y1: number, segs: number, name = "part"): void {
    if (y1 - y0 < 1e-3) return;
    const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: segs });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    this.add(g, mat, name);
  }
  /**
   * A closed solid of revolution about a vertical axis at (cx, cz). The (r, y)
   * profile runs anticlockwise (inner to outer along the bottom, back along the top), so it faces out.
   */
  lathe(mat: THREE.Material, prof: [number, number][], cx: number, cz: number, segs: number, name: string): void {
    const pts = prof.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
    pts.push(pts[0].clone());
    const g = new THREE.LatheGeometry(pts, segs);
    g.translate(cx, 0, cz);
    this.add(g, mat, name);
  }
  /** A flat-topped ring about a vertical axis. */
  ring(mat: THREE.Material, rIn: number, rOut: number, cx: number, cz: number, y0: number, y1: number, segs: number, name = "ring"): void {
    this.lathe(mat, [[rIn, y0], [rOut, y0], [rOut, y1], [rIn, y1]], cx, cz, segs, name);
  }
}

interface Mats {
  body: THREE.Material;
  metal: THREE.Material;
  plastic: THREE.Material;
  rubber: THREE.Material;
}

/** A round cone driver whose frame ring tops out at yTop. Returns the depth it reaches below yTop. */
function cone(k: Kit, m: Mats, cx: number, cz: number, R: number, yTop: number, room: number, big: boolean): number {
  const segs = big ? 24 : 20;
  const frameH = Math.min(big ? 0.8 : 0.5, 0.1 * room);
  const yRim = yTop - frameH; // cone rim and surround base
  const roll = Math.min((big ? 0.09 : 0.07) * R, frameH * 0.95);
  const rS0 = 0.76 * R, rS1 = 0.9 * R;
  const coneD = Math.min((big ? 0.42 : 0.32) * R, 0.55 * room);
  const t = Math.min(0.3, 0.1 * coneD + 0.1);
  const rCap = 0.3 * R;
  const yNeck = yRim - coneD;
  k.ring(m.metal, rS1, R, cx, cz, yRim - t, yTop, segs, "frame");
  // Rubber half-roll surround, flat underneath.
  const arc: [number, number][] = [];
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * Math.PI;
    arc.push([(rS0 + rS1) / 2 + ((rS1 - rS0) / 2) * Math.cos(a), yRim + roll * Math.sin(a)]);
  }
  k.lathe(m.rubber, [[rS0, yRim - t], [rS1, yRim - t], ...arc], cx, cz, segs, "surround");
  // Cone shell from the surround down to the neck.
  k.lathe(m.body, [[rCap, yNeck - t], [rS0 + 0.01, yRim - t], [rS0 + 0.01, yRim], [rCap, yNeck]], cx, cz, segs, "cone");
  // Dust cap dome over the neck.
  const capH = Math.min(0.35 * rCap, 0.8 * coneD);
  const dome: [number, number][] = [];
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * (Math.PI / 2);
    dome.push([rCap * 1.02 * Math.cos(a), yNeck + capH * Math.sin(a)]);
  }
  k.lathe(big ? m.metal : m.rubber, [[0, yNeck - 0.05], [rCap * 1.02, yNeck - 0.05], ...dome.slice(1)], cx, cz, segs, "cap");
  return frameH + coneD + t;
}

/** A plan outline with holes, as a two-part enclosure: solid below yCut, holed from yCut to yTop. */
function enclosure(k: Kit, mat: THREE.Material, outline: P2[], holes: THREE.Path[], yBot: number, yCut: number, yTop: number, segs: number): void {
  k.slab(mat, shapeOf(outline), yBot, yCut, segs, "enclosure");
  const s = shapeOf(outline);
  for (const h of holes) s.holes.push(h);
  k.slab(mat, s, yCut, yTop, segs, "enclosure");
}

// ------------------------------------------------------------------ drivers

function speaker2006(k: Kit, m: Mats, W: number, H: number, D: number): void {
  const yBot = -H / 2, yTop = H / 2;
  const ear = clamp(0.15 * W, 3, 5);
  const bx0 = -W / 2 + ear, bx1 = W / 2 - ear;
  const R = Math.min(D / 2 - 1, (bx1 - bx0) / 2 - 1);
  const encTop = yTop - Math.min(0.5, 0.08 * H);
  const drop = cone(k, m, 0, 0, R, yTop, H - 1.2, false);
  const yCut = Math.max(yBot + 0.8, yTop - drop - 0.3);
  enclosure(k, m.plastic, planRound(bx0, bx1, -D / 2, D / 2, 2, 3), [circlePath(0, 0, R - 0.02)], yBot, yCut, encTop, 10);
  // Screw ears at the ends: flat tabs with a rubber grommet.
  const earT = Math.min(1, 0.15 * H);
  const eh = Math.min(D * 0.35, 4.5);
  for (const sx of [-1, 1]) {
    const cx = sx * (W / 2 - ear / 2);
    const tab = shapeOf(planRound(sx < 0 ? -W / 2 : cx - ear / 2 - 1, sx < 0 ? cx + ear / 2 + 1 : W / 2, -eh, eh, 1.5, 2));
    const hr = Math.min(0.9, 0.2 * ear);
    tab.holes.push(circlePath(cx, 0, hr));
    k.slab(m.plastic, tab, yBot, yBot + earT, 8, "ear");
    k.ring(m.rubber, hr, hr + Math.min(0.8, 0.12 * ear), cx, 0, yBot + earT, yBot + earT + Math.min(0.8, 0.12 * H), 10, "grommet");
  }
  // Solder tabs on the back face.
  for (const f of [-0.15, 0.15]) k.box(m.metal, f * W - 0.5, f * W + 0.5, yBot + 0.5, yBot + 0.5 + Math.min(2, 0.3 * H), -D / 2, -D / 2 + 0.3, "tab");
}

function sub2006(k: Kit, m: Mats, W: number, H: number, D: number): void {
  const yBot = -H / 2, yTop = H / 2;
  const portW = clamp(0.18 * W, 5, 9);
  const R = Math.min(D / 2 - 2, (W - portW - 5) / 2);
  const cx = -W / 2 + 2 + R;
  const encTop = yTop - Math.min(0.8, 0.08 * H);
  const drop = cone(k, m, cx, 0, R, yTop, H - 1.5, true);
  const yCut = Math.max(yBot + 1, yTop - drop - 0.3);
  // Bass-reflex port at the +x end: a slot in the top with a rubber floor down the tube.
  const px0 = W / 2 - 2 - portW, px1 = W / 2 - 2;
  const pz = 0.3 * D;
  const portPts = planRound(px0, px1, -pz, pz, 1.5, 2);
  const portDepth = Math.min(0.6 * H, encTop - yBot - 1.2);
  const yPortCut = encTop - portDepth;
  // Lower enclosure solid up to the port floor; middle holed for the driver only; top holed for both.
  const outline = planRound(-W / 2, W / 2, -D / 2, D / 2, 3, 3);
  const cut0 = Math.min(yCut, yPortCut);
  const cut1 = Math.max(yCut, yPortCut);
  k.slab(m.plastic, shapeOf(outline), yBot, cut0, 8, "enclosure");
  const mid = shapeOf(outline);
  mid.holes.push(yCut < yPortCut ? circlePath(cx, 0, R - 0.02) : pathOf(portPts));
  k.slab(m.plastic, mid, cut0, cut1, 8, "enclosure");
  const top = shapeOf(outline);
  top.holes.push(circlePath(cx, 0, R - 0.02), pathOf(portPts));
  k.slab(m.plastic, top, cut1, encTop, 8, "enclosure");
  k.box(m.rubber, px0 + 0.1, px1 - 0.1, yPortCut, yPortCut + 0.1, -pz + 0.1, pz - 0.1, "port-floor");
  // Port lip, and screw bosses at the four corners.
  k.slab(m.plastic, (() => {
    const s = shapeOf(planRound(px0 - 0.8, px1 + 0.8, -pz - 0.8, pz + 0.8, 2, 2));
    s.holes.push(pathOf(portPts));
    return s;
  })(), encTop, yTop, 6, "port-lip");
  const br = Math.min(1.6, 0.05 * D);
  for (const [bx, bz] of [[-W / 2 + 3, -D / 2 + 3], [-W / 2 + 3, D / 2 - 3], [W / 2 - 3, -D / 2 + 3], [W / 2 - 3, D / 2 - 3]] as P2[])
    k.ring(m.metal, br * 0.45, br, bx, bz, encTop, yTop, 8, "boss");
}

function woofer2026(k: Kit, m: Mats, W: number, H: number, D: number): void {
  const yBot = -H / 2, yTop = H / 2;
  const bodyTop = yTop - Math.min(0.4, 0.08 * H);
  const a = (W - 3) / 2; // window half-width
  const b = Math.max(a, Math.min(0.3 * D, D / 2 - 5)); // window half-length
  const wz = D / 2 - 2 - b;
  const inset = Math.min(1.2, 0.2 * a);
  const recess = Math.min(1.2, 0.3 * (bodyTop - yBot));
  const yDia = bodyTop - recess;
  const window = planStadium(0, wz, a, b, 8);
  enclosure(k, m.plastic, planRound(-W / 2, W / 2, -D / 2, D / 2, 2, 3), [pathOf(window)], yBot, yDia - 0.4, bodyTop, 8);
  // Rubber surround ring and the flat diaphragm inside it.
  const sur = shapeOf(planStadium(0, wz, a - 0.02, b - 0.02, 8));
  sur.holes.push(pathOf(planStadium(0, wz, a - inset, b - inset, 8)));
  k.slab(m.rubber, sur, yDia - 0.4, yDia + 0.1, 8, "surround");
  k.slab(m.body, shapeOf(planStadium(0, wz, a - inset + 0.02, b - inset + 0.02, 8)), yDia - 0.4, yDia, 8, "diaphragm");
  // Foam gasket round the window, flush with the top.
  const gw = Math.min(0.9, (W / 2 - a) * 0.8);
  const gas = shapeOf(planStadium(0, wz, a + gw, b + gw, 8));
  gas.holes.push(pathOf(window));
  k.slab(m.rubber, gas, bodyTop, yTop, 8, "gasket");
  // Grille bars across the window.
  const pitch = 1.2;
  const barW = 0.5;
  const yb0 = bodyTop - Math.min(0.3, 0.5 * recess), yb1 = yTop - 0.1;
  const n = Math.floor((2 * b - 1) / pitch);
  for (let i = 0; i < n; i++) {
    const dz = -((n - 1) * pitch) / 2 + i * pitch;
    const s = Math.max(0, b - a);
    const e = Math.abs(dz) - s;
    const hw = e <= 0 ? a : Math.sqrt(Math.max(0, a * a - e * e));
    if (hw < 0.6) continue;
    k.box(m.metal, -hw + 0.05, hw - 0.05, yb0, yb1, wz + dz - barW / 2, wz + dz + barW / 2, "grille");
  }
  // Screw bosses at the back end, and the flex tail with its connector.
  const br = Math.min(1.3, 0.12 * W);
  for (const sx of [-1, 1]) k.ring(m.metal, br * 0.45, br, sx * (W / 2 - br - 0.4), -D / 2 + br + 0.6, bodyTop, yTop, 10, "boss");
  const fz0 = -D / 2 + 2 * br + 1.5;
  k.box(m.plastic, -0.2 * W, 0.2 * W, bodyTop, bodyTop + 0.1, fz0, fz0 + Math.min(8, wz - b - fz0 - 1), "flex");
  k.box(m.plastic, -0.16 * W, 0.16 * W, bodyTop, yTop, fz0, fz0 + 2, "connector");
}

function tweeter2026(k: Kit, m: Mats, W: number, H: number, D: number): void {
  const yBot = -H / 2, yTop = H / 2;
  const bodyTop = yTop - Math.min(0.3, 0.08 * H);
  const R = W / 2 - 1.4;
  const cz = -D / 2 + W / 2 + 0.6;
  const room = bodyTop - yBot;
  const recess = Math.min(1.1, 0.35 * room);
  const yBase = bodyTop - recess;
  enclosure(k, m.plastic, planRound(-W / 2, W / 2, -D / 2, D / 2, 1.5, 3), [circlePath(0, cz, R)], yBot, yBase - 0.3, bodyTop, 12);
  // Flat surround and a dome.
  const rd = 0.62 * R;
  k.ring(m.rubber, rd - 0.05, R - 0.02, 0, cz, yBase - 0.3, yBase + 0.1, 20, "surround");
  const domeH = Math.min(0.45 * rd, recess - 0.2);
  const dome: [number, number][] = [];
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    dome.push([rd * Math.cos(a), yBase + domeH * Math.sin(a)]);
  }
  k.lathe(m.body, [[0, yBase - 0.3], [rd, yBase - 0.3], ...dome], 0, cz, 20, "dome");
  // Round grille: a raised rim and three bars across.
  k.ring(m.metal, R, Math.min(W / 2 - 0.3, R + 0.8), 0, cz, bodyTop, yTop, 20, "grille");
  for (const f of [-0.45, 0, 0.45]) {
    const dz = f * R;
    const hw = Math.sqrt(Math.max(0, R * R - dz * dz));
    k.box(m.metal, -hw, hw, yTop - 0.25, yTop - 0.05, cz + dz - 0.25, cz + dz + 0.25, "grille");
  }
  // Ribbed back volume along the rest, then the flex tail at the far end.
  const rz0 = cz + R + 2.5, rz1 = D / 2 - 5;
  const ribs = Math.max(0, Math.min(5, Math.floor((rz1 - rz0) / 4)));
  for (let i = 0; i < ribs; i++) {
    const z = rz0 + ((i + 0.5) * (rz1 - rz0)) / ribs;
    k.box(m.plastic, -W / 2 + 1.2, W / 2 - 1.2, bodyTop, yTop - 0.05, z - 0.35, z + 0.35, "rib");
  }
  k.box(m.plastic, -0.3 * W, 0.3 * W, bodyTop, bodyTop + 0.1, D / 2 - 4.5, D / 2 - 0.5, "flex");
  k.box(m.plastic, -0.25 * W, 0.25 * W, bodyTop, yTop, D / 2 - 2.5, D / 2 - 0.5, "connector");
}

function build(
  box: ModelBox,
  _options: Record<string, string | number>,
  ctx: ModelContext,
): THREE.Object3D {
  const c = ctx.materials;
  const m: Mats = { body: c.body, metal: c.metal, plastic: c.plastic, rubber: c.rubber };
  const old = ctx.year < 2015;
  const W = box.width, H = box.height, D = box.depth;
  const k = new Kit();
  if (old) {
    if (D >= 28) sub2006(k, m, W, H, D);
    else speaker2006(k, m, W, H, D);
  } else if (D >= 37) woofer2026(k, m, W, H, D);
  else tweeter2026(k, m, W, H, D);
  const spk = k.group;
  spk.name = "spk";
  return spk;
}

export const model: ModelModule = { key: "spk", build };
